import { sql } from "./database_init.ts";
import jwt from "jsonwebtoken";
import fs from 'fs'
import path from "path";
import { __dirname, htmlRoot } from "./utils.ts";
import { NVImage } from "@niivue/niivue";
import atlasFiles from "../../frontend/src/utils/atlas_files.ts"
import type { Response } from "express";
import type { GameProgress, GameSession } from "../interfaces/database.interfaces.ts";
import type { ClotureGameSessionRequest, GetNextRegionRequest, StartGameSessionRequest, ValidateRegionRequest } from "../interfaces/requests.interfaces.ts";
import type { Config } from "../interfaces/config.interfaces.ts";
import configJson from '../config.json' with { type: "json" };
const config: Config = configJson;

const TOTAL_REGIONS_TIME_ATTACK = 18;
const MAX_POINTS_PER_REGION = 50; // 1000 total points / 20 regions
const MAX_TIME_IN_SECONDS = 100; // nombre de secondes pour le Time Attack
const BONUS_POINTS_PER_SECOND = 1; // nombre de points bonus par seconde restante (max 100*10 = 1000 points)
const MAX_POINTS_TIMEATTACK = MAX_POINTS_PER_REGION * TOTAL_REGIONS_TIME_ATTACK + MAX_TIME_IN_SECONDS * BONUS_POINTS_PER_SECOND;
const MAX_POINTS_WITH_PENALTY = 30 // 30 points max if clicked outside the region
const MAX_PENALTY_DISTANCE = 100; // Arbitrary distance in mm for max penalty (0 points)
const MAX_ATTEMPTS_BEFORE_HIGHLIGHT = 3; // Number of attempts before highlighting the target region in practice mode

export const validRegions : Record<string,number[]> = {}
export const imageRef : Record<string,NVImage> = {}
export const imageMetadata : Record<string,any> = {}
export const regionCenters : Record<string,number[][][]> = {}
for (const atlas in atlasFiles) {
    const atlasJsonPath = path.join(htmlRoot, "frontend", "public", "atlas", "descr", "en", atlasFiles[atlas].json)
    const atlasJson = JSON.parse(fs.readFileSync(atlasJsonPath, 'utf-8'))
    const atlasNiiPath = path.join(htmlRoot, "frontend", "public", "atlas", "nii", atlasFiles[atlas].nii)
    const niiBuffer = await fs.openAsBlob(atlasNiiPath)
    imageRef[atlas] = await NVImage.loadFromFile({file: new File([niiBuffer], atlas)})
    imageMetadata[atlas] = imageRef[atlas].getImageMetadata()
    const myImageData = imageRef[atlas].getVolumeData([0, 0, 0], [imageMetadata[atlas].nx, imageMetadata[atlas].ny, imageMetadata[atlas].nz], 'uint8')[0]
    const dataRegions = [...new Set(myImageData.filter(val => Number(val) > 0).map(val => Math.round(Number(val))))];
    let theseValidRegions = dataRegions.filter(val => atlasJson.labels[val] !== undefined && Number.isInteger(val));
    if (theseValidRegions.length === 0) {
        theseValidRegions = Object.keys(atlasJson.labels)
          .map(Number)
          .filter(val => val > 0 && Number.isInteger(val));
        if (theseValidRegions.length === 0) {
          throw new Error(`No valid regions available for ${atlas}`);
        }
        console.warn(`Fallback to cmap.labels keys for ${atlas}`);
    }
    validRegions[atlas] = theseValidRegions;
    regionCenters[atlas] = atlasJson.centers
}

export const startGameSession = async (req: StartGameSessionRequest, res: Response): Promise<void> => {
    try {
        const { mode, atlas } = req.body;
        const userId = req.user.id; // Extract user ID from the authenticated user

        // Validate the required fields
        if (!mode || !atlas) {
            res.status(400).send({ message: "Mode and atlas are required to start a session." });
            return;
        }

        // Generate a session token
        const sessionToken: string = jwt.sign({ userId, mode, atlas }, config.jwt_secret, { expiresIn: "1h" });

        // Save the session to the database
         const result = await sql`
            INSERT INTO game_sessions (user_id, token, mode, atlas, current_score, created_at)
            VALUES (${userId}, ${sessionToken}, ${mode}, ${atlas}, 0, NOW())
            RETURNING id
        ` as {id: number}[];

        // Respond with the session token
        res.status(200).send({
            message: "Game session started successfully.",
            sessionToken,
            sessionId: result[0].id,
        });
    } catch (error) {
        console.error("Error starting game session:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
};

export const getNextRegion = async (
    req: GetNextRegionRequest,
    res: Response
): Promise<void> => {
    try {
        const { sessionId, sessionToken } = req.body;

        // Validate the session token
        const sessionResult = await sql`
            SELECT * FROM game_sessions WHERE id = ${sessionId} AND token = ${sessionToken}
        ` as GameSession[];
        if (!sessionResult.length) {
            res.status(403).send({ message: "Invalid session or token mismatch" });
            return;
        }
        const session = sessionResult[0];

        // Get the atlas length
        const atlasValidRegions = validRegions[session.atlas];
        if (!atlasValidRegions) {
            res.status(400).send({ message: "Invalid atlas specified in the session." });
            return;
        }

        // --- TIME-ATTACK: Check if time is up before selecting a new region ---
        if (session.mode === "time-attack") {
            const elapsedTime = Date.now() - new Date(session.created_at).getTime();
            if (elapsedTime >= MAX_TIME_IN_SECONDS * 1000) {
                // Time is up, end the game and notify frontend
                let {finalScore} = await endGame({ session, quitReason: "timeout" });
                res.status(200).send({
                    message: "Time is up! Game over.",
                    regionId: -1,
                    isCorrect: false,
                    voxelValue: -1,
                    scoreIncrement: 0,
                    finalScore,
                    endgame: true
                });
                return;
            }
        }

        // Check if there is already an active gameprogress element
        const activeProgresses = await sql`
            SELECT * FROM game_progress 
            WHERE session_id = ${sessionId} AND is_active = TRUE
        ` as GameProgress[];
        if (activeProgresses.length > 0) {
            // There is already an active region, return it
            res.status(200).send({
                message: "Ongoing region found.",
                regionId: activeProgresses[0].region_id,
                newRegion: false
            });
            return;
        }

        let randomRegionId: number | null = null;
        if (session.mode == "time-attack") {
            // we have to select region that has not already been answered
            const answeredRegions = await sql`
                SELECT * FROM game_progress 
                WHERE session_id = ${sessionId} AND is_correct = TRUE
            ` as GameProgress[];
            const answeredRegionIds = answeredRegions.map(
                (region) => region.region_id
            );
            let remainingRegionIds = atlasValidRegions.filter(
                (regionId) => !answeredRegionIds.includes(regionId)
            );
            if (remainingRegionIds.length === 0) {
                // if no region remaining, we'll take a random region
                remainingRegionIds = atlasValidRegions;
            }
            // Select a random region from the remaining regions
            const randomIndex = Math.floor(Math.random() * remainingRegionIds.length);
            randomRegionId = remainingRegionIds[randomIndex];
        } else {
            // Select a random region from all regions
            const randomIndex = Math.floor(Math.random() * atlasValidRegions.length);
            randomRegionId = atlasValidRegions[randomIndex];
        }
        if (randomRegionId !== null) {
            // First, deactivate any active regions
            await sql`
                UPDATE game_progress 
                SET is_active = FALSE 
                WHERE session_id = ${sessionId} AND is_active = TRUE
            `;
            // Insert the new active region
            await sql`
                INSERT INTO game_progress (session_id, session_token, region_id, time_taken, is_active, is_correct, created_at)
                VALUES (${sessionId}, ${sessionToken}, ${randomRegionId}, 0, TRUE, FALSE, NOW())
            `;

            res.status(200).send({
                message: "Next region selected successfully.",
                regionId: randomRegionId,
                newRegion: true
            });
        }
    }  catch (error: unknown) {
        console.log(error);
        res.status(500).send({ message: "Internal Server Error" });
    }
};

export const validateRegion = async (req: ValidateRegionRequest, res: Response): Promise<void> => {
    try {
        const { sessionId, sessionToken, coordinates } = req.body;
        // Validate the session token
        const sessionResults = await sql`
            SELECT * FROM game_sessions 
            WHERE id = ${sessionId} AND token = ${sessionToken}
        ` as GameSession[];
        if (!sessionResults.length) {
            res.status(403).send({ message: "Invalid session or token mismatch" });
            return;
        }
        const session = sessionResults[0];

        // get time elapsed from session start
        let elapsedTime = Math.floor((Date.now() - session.created_at)); // Time in milliseconds

        // Retrieve the active gameprogress entry
        const activeProgresses = await sql`
            SELECT * FROM game_progress 
            WHERE session_id = ${sessionId} AND is_active = TRUE
        ` as GameProgress[];
        if (!activeProgresses.length) {
            res.status(400).send({ message: "No active region to validate." });
            return;
        }
        const activeProgress = activeProgresses[0];
        const regionId = activeProgress.region_id;

        // Validate the coordinates
        if (!coordinates || !Array.isArray(coordinates.mm) || coordinates.mm.length < 3 || 
                !Array.isArray(coordinates.vox) || coordinates.vox.length < 3) {
            res.status(400).send({ message: "Invalid coordinates provided." });
            return;
        }
        const [x, y, z] = coordinates.vox;
        // Get the atlas data for the session
        const atlasImage: NVImage = imageRef[session.atlas];
        const atlasMetadata = imageMetadata[session.atlas];
        if (x < 0 || x >= atlasMetadata.nx || y < 0 || y >= atlasMetadata.ny || z < 0 || z >= atlasMetadata.nz) {
            res.status(400).send({ message: "Coordinates are out of bounds." });
            return;
        }
        const voxelValue: number = atlasImage.getValue(x, y, z);
        // Check if the voxel value matches the active region ID
        const isCorrect: boolean = voxelValue === regionId;

        // update the score
        let scoreIncrement = 0;
        if (session.mode == "streak") {
            if (isCorrect) {
                scoreIncrement = 1;
            }
        } else if (session.mode == "time-attack" && elapsedTime < MAX_TIME_IN_SECONDS*1000) {
            if (isCorrect) {
                scoreIncrement = MAX_POINTS_PER_REGION;
            } else {
                if (regionCenters[session.atlas] && regionCenters[session.atlas][regionId]) {
                    const centers: number[][] = regionCenters[session.atlas][regionId];
                    const [xMm, yMm, zMm] = coordinates.mm;
                    // Find the minimum distance to any center of the region
                    let minDistance = Infinity;
                    for (const center of centers) {
                        const distance = Math.sqrt(
                            Math.pow(center[0] - xMm, 2) +
                            Math.pow(center[1] - yMm, 2) +
                            Math.pow(center[2] - zMm, 2)
                        );
                        if (distance < minDistance) {
                            minDistance = distance;
                        }
                    }
                    // Calculate score based on distance
                    if (minDistance <= MAX_PENALTY_DISTANCE) {
                        scoreIncrement = Math.floor((1 - (minDistance / MAX_PENALTY_DISTANCE)) * MAX_POINTS_WITH_PENALTY);
                    } else {
                        scoreIncrement = 0; // No points for too far away
                    }
                }
            }
        }

        let isActive = false
        let attempts = activeProgress.attempts + 1; // Increment attempts
        let performHighlight = false
        if(session.mode == "practice"){
            isActive = isCorrect ? false : true; // In practice mode, keep the region active if incorrect
            if(!isCorrect && attempts >= MAX_ATTEMPTS_BEFORE_HIGHLIGHT){
                performHighlight = true; // Propose to highlight the region
            }
        }
        const timeTaken = Math.floor((Date.now() - activeProgress.created_at)); // Time in milliseconds

        // Update the progress
        await sql`
            UPDATE game_progress
            SET is_active = ${isActive}, 
                is_correct = ${isCorrect}, 
                time_taken = ${timeTaken}, 
                score_increment = ${scoreIncrement},
                attempts = ${attempts}
            WHERE id = ${activeProgress.id}
        `;

        let endgame = false;
        let quitReason = ""
        let bonusTime = 0
        if (!isCorrect && session.mode == "streak") {
            endgame = true;
            quitReason = "streak-ended"
        } else if (session.mode == "time-attack") {
            // Check time elapsed since session start
            // Check if all regions have been answered
            const answeredRegionsResult = await sql`
                SELECT COUNT(*) as count 
                FROM game_progress 
                WHERE session_id = ${sessionId}
            ` as { count: number }[];
            const answeredRegionsCount = answeredRegionsResult[0].count;
            if (answeredRegionsCount >= TOTAL_REGIONS_TIME_ATTACK) {
                endgame = true;
                quitReason = "all-answered"
                if (elapsedTime < MAX_TIME_IN_SECONDS*1000) { // add bonus points if time is not over
                    bonusTime = MAX_TIME_IN_SECONDS*1000 - elapsedTime
                    scoreIncrement += Math.floor(bonusTime * BONUS_POINTS_PER_SECOND / 1000);
                }
            }
            if (elapsedTime >= MAX_TIME_IN_SECONDS*1000) {
                endgame = true;
                elapsedTime = MAX_TIME_IN_SECONDS*1000;
            }
        }

        // Save the score in the session
        const finalScore = session.current_score + scoreIncrement; // Add the last score increment
        await sql`
            UPDATE game_sessions
            SET current_score = ${finalScore}
            WHERE id = ${sessionId}
        `;

        // If the game is over, update the session status
        if (endgame) {
            await endGame({session, finalScore, elapsedTime, quitReason, bonusTime})
        }
        // Respond with the result
        res.status(200).send({
            message: isCorrect ? "Correct guess!" : "Incorrect guess.",
            isCorrect,
            regionId,
            voxelValue,
            endgame,
            scoreIncrement,
            finalScore,
            performHighlight
        });
    } catch (error: unknown) {
        console.log(error);
        res.status(500).send({ message: "Internal Server Error" });
    }
}

export const manualClotureGameSession = async (req: ClotureGameSessionRequest, res: Response): Promise<void> => {
    try {
        const { sessionId, sessionToken } = req.body;
        // Validate the session token
        const sessionResult = await sql`
            SELECT * FROM game_sessions 
            WHERE id = ${sessionId} AND token = ${sessionToken}
        ` as GameSession[];
        
        if (!sessionResult.length) {
            res.status(403).send({ message: "Invalid session or token mismatch" });
            return;
        }

        const session = sessionResult[0];
        
        // Time is up, end the game and notify frontend
        let {finalScore} = await endGame({ session, quitReason: "timeout" });
        res.status(200).send({
            message: session.mode === "time-attack"?"Time is up! Game over.":"Game over.",
            isCorrect: false,
            regionId: -1,
            voxelValue: -1,
            endgame: true,
            scoreIncrement: 0,
            finalScore
        });
        return;
    } catch (error: unknown) {
        console.log(error);
        res.status(500).send({ message: "Internal Server Error" });
    }
}

const endGame = async ({session, finalScore, elapsedTime, quitReason, bonusTime} : 
    {session: GameSession, finalScore?: number, elapsedTime?: number, quitReason?: string, bonusTime?:number}) : Promise<{finalScore: number, elapsedTime: number}> => {
    try {
        if(finalScore === undefined){
            const scoreResult = await sql`
                SELECT current_score FROM game_sessions WHERE id = ${session.id}
            ` as { current_score: number }[];
            finalScore = scoreResult.length ? Number(scoreResult[0].current_score) : 0;
        }
        if(elapsedTime === undefined){
            elapsedTime = Math.min(
                Math.floor(Date.now() - new Date(session.created_at).getTime()), 
                MAX_TIME_IN_SECONDS * 1000
            ) / 1000; // Convert to seconds
        }
        if(bonusTime === undefined) bonusTime = 0
        if(quitReason === undefined) quitReason = ""
        // calculate accuracy for time attack mode
        let accurateClicks = 0
        let incorrectClicks = 0
        let totalClicks = 0
        if (session.mode === "time-attack" || session.mode === "streak") {
            // Get counts for correct and incorrect clicks
            const accuracyResult = await sql`
                SELECT 
                    SUM(CASE WHEN is_correct = TRUE THEN 1 ELSE 0 END) as accurate_clicks,
                    SUM(CASE WHEN is_correct = FALSE THEN 1 ELSE 0 END) as incorrect_clicks
                FROM game_progress
                WHERE session_id = ${session.id}
            `;
            if (accuracyResult.length) {
                accurateClicks = Number(accuracyResult[0].accurate_clicks) || 0;
                incorrectClicks = Number(accuracyResult[0].incorrect_clicks) || 0;
                totalClicks = accurateClicks + incorrectClicks;
            }
        }

        // Compute time per region stats for this session
        const timesResult = await sql`
            SELECT time_taken, is_correct 
            FROM game_progress 
            WHERE session_id = ${session.id}
        `;
        const times = timesResult
            .map(row => row.time_taken)
            .filter(t => typeof t === 'number' && !isNaN(t));

        // time stats
        let minTimePerRegion = null, maxTimePerRegion = null, avgTimePerRegion = null;
        if (times.length > 0) {
            minTimePerRegion = Math.min(...times);
            maxTimePerRegion = Math.max(...times);
            avgTimePerRegion = times.reduce((a, b) => a + b, 0) / times.length;
        }

        // time stats in correct regions
        const correctTimes = timesResult
            .filter(row => row.is_correct === true)
            .map(row => row.time_taken);
        let minTimeCorrect = null, maxTimeCorrect = null, avgTimeCorrect = null;
        if (correctTimes.length > 0) {
            minTimeCorrect = Math.min(...correctTimes);
            maxTimeCorrect = Math.max(...correctTimes);
            avgTimeCorrect = correctTimes.reduce((a, b) => a + b, 0) / correctTimes.length;
        }

        // Insert into finishedsessions
        await sql`
            INSERT INTO finished_sessions (
                user_id, session_id, mode, atlas, score, 
                attempts, correct, incorrect, 
                min_time_per_region, max_time_per_region, avg_time_per_region,
                min_time_per_correct_region, max_time_per_correct_region, avg_time_per_correct_region,
                quit_reason, duration, created_at
            )
            VALUES (
                ${session.user_id}, ${session.id}, ${session.mode}, ${session.atlas}, ${finalScore}, 
                ${totalClicks}, ${accurateClicks}, ${incorrectClicks},
                ${minTimePerRegion}, ${maxTimePerRegion}, ${avgTimePerRegion},
                ${minTimeCorrect}, ${maxTimeCorrect}, ${avgTimeCorrect},
                ${quitReason}, ${elapsedTime}, NOW()
            )
        `;

        // Delete all gameprogress for this session
        await sql`DELETE FROM game_progress WHERE session_id = ${session.id}`;

        // Delete the game_session itself
        await sql`DELETE FROM game_sessions WHERE id = ${session.id}`;

        return {finalScore, elapsedTime}
    } catch (error: unknown) {
        console.log(error);
        return {finalScore:0, elapsedTime:0}
    }
}
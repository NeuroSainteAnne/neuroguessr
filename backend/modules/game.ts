import { db } from "./database_init.ts";
import jwt from "jsonwebtoken";
import fs from 'fs'
import path from "path";
import { __dirname, htmlRoot } from "./utils.ts";
import { NVImage } from "@niivue/niivue";
import atlasFiles from "../../frontend/src/atlas_files.ts"
import type { Response } from "express";
import type { GameProgress, GameSession } from "../interfaces/database.interfaces.ts";
import type { GetNextRegionRequest, StartGameSessionRequest, ValidateRegionRequest } from "../interfaces/requests.interfaces.ts";
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

const validRegions : Record<string,number[]> = {}
const imageRef : Record<string,NVImage> = {}
const imageMetadata : Record<string,any> = {}
const regionCenters : Record<string,number[][]> = {}
for (const atlas in atlasFiles) {
    const atlasJsonPath = path.join(htmlRoot, "frontend", "dist", "assets", "atlas", "descr", "en", atlasFiles[atlas].json)
    const atlasJson = JSON.parse(fs.readFileSync(atlasJsonPath, 'utf-8'))
    const atlasNiiPath = path.join(htmlRoot, "frontend", "dist", "assets", "atlas", "nii", atlasFiles[atlas].nii)
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
        const insertSessionStmt = db.prepare(`
            INSERT INTO gamesessions (userId, token, mode, atlas)
            VALUES (?, ?, ?, ?)
        `);
        const result = insertSessionStmt.run(userId, sessionToken, mode, atlas);

        // Respond with the session token
        res.status(200).send({
            message: "Game session started successfully.",
            sessionToken,
            sessionId: result.lastInsertRowid
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
    const { sessionId, sessionToken } = req.body;
    // Validate the session token
    const getSessionStmt = db.prepare(
        `SELECT * FROM gamesessions WHERE id = ? AND token = ?`
    );
    const session = getSessionStmt.get(sessionId, sessionToken) as GameSession;
    if (!session) {
        res
            .status(403)
            .send({ message: "Invalid session or token mismatch" });
        return;
    }
    // Get the atlas length
    const atlasValidRegions = validRegions[session.atlas];
    if (!atlasValidRegions) {
        res
            .status(400)
            .send({ message: "Invalid atlas specified in the session." });
        return;
    }
    let randomRegionId: number | null = null;
    if (session.mode == "time-attack") {
        // we have to select region that has not already been answered
        const getSessionStmt = db.prepare(
            `SELECT * FROM gameprogress WHERE sessionId = ? AND isCorrect = 1`
        );
        const answeredRegions = getSessionStmt.all(sessionId) as GameProgress[];
        const answeredRegionIds = answeredRegions.map(
            (region) => region.regionId
        );
        let remainingRegionIds = atlasValidRegions.filter(
            (regionId) => !answeredRegionIds.includes(regionId)
        );
        if (remainingRegionIds.length === 0) {
            // if no region remaining, we'll take a random region
            remainingRegionIds = atlasValidRegions;
        }
        // Select a random region from the remaining regions
        const randomIndex = Math.floor(
            Math.random() * remainingRegionIds.length
        );
        randomRegionId = remainingRegionIds[randomIndex];
    } else if (session.mode == "streak") {
        // Select a random region from the remaining regions
        const randomIndex = Math.floor(Math.random() * atlasValidRegions.length);
        randomRegionId = atlasValidRegions[randomIndex];
    }
    if (randomRegionId !== null) {
        const insertProgressStmt = db.prepare(`
            INSERT INTO gameprogress (sessionId, sessionToken, regionId, timeTaken, isActive, isCorrect)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        // TODO deactivate all other active regions in order to prevent concurrent requests bugs
        insertProgressStmt.run(
            sessionId,
            sessionToken,
            randomRegionId,
            0,
            1,
            0
        );
        res.status(200).send({
            message: "Next region selected successfully.",
            regionId: randomRegionId,
        });
    }
};

export const validateRegion = async (req: ValidateRegionRequest, res: Response): Promise<void> => {
    const { sessionId, sessionToken, coordinates } = req.body;
    // Validate the session token
    const getSessionStmt = db.prepare(`SELECT * FROM gamesessions WHERE id = ? AND token = ?`);
    const session = getSessionStmt.get(sessionId, sessionToken) as GameSession;
    if (!session) {
        res.status(403).send({ message: "Invalid session or token mismatch" });
        return
    }
    // get time elapsed from session start
    const elapsedTime = Math.floor((Date.now() - session.createdAt)); // Time in milliseconds

    // Retrieve the active gameprogress entry
    const getActiveProgressStmt = db.prepare(`
        SELECT * FROM gameprogress WHERE sessionId = ? AND isActive = 1
    `);
    const activeProgress = getActiveProgressStmt.get(sessionId) as GameProgress;
    if (!activeProgress) {
        res.status(400).send({ message: "No active region to validate." });
        return;
    }
    const { regionId } = activeProgress;
    // Validate the coordinates
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 3) {
        res.status(400).send({ message: "Invalid coordinates provided." });
        return;
    }
    const [x, y, z] = coordinates;
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
                const center: number[] = regionCenters[session.atlas][regionId];
                const distance = Math.sqrt(
                    Math.pow(center[0] - x, 2) +
                    Math.pow(center[1] - y, 2) +
                    Math.pow(center[2] - z, 2)
                );
                // Calculate score based on distance
                if (distance <= MAX_PENALTY_DISTANCE) {
                    scoreIncrement = Math.floor((1 - (distance / MAX_PENALTY_DISTANCE)) * MAX_POINTS_WITH_PENALTY);
                } else {
                    scoreIncrement = 0; // No points for too far away
                }
            }
        }
    }

    const updateProgressStmt = db.prepare(`
        UPDATE gameprogress
        SET isActive = ?, isCorrect = ?, timeTaken = ?, scoreIncrement = ?
        WHERE id = ?
    `);
    const timeTaken = Math.floor((Date.now() - activeProgress.createdAt)); // Time in milliseconds
    updateProgressStmt.run(0, isCorrect ? 1 : 0, timeTaken, scoreIncrement, activeProgress.id);

    let endgame = false;
    let quitReason = ""
    let bonusTime = 0
    if (!isCorrect && session.mode == "streak") {
        endgame = true;
        quitReason = "streak-ended"
    } else if (session.mode == "time-attack") {
        // Check time elapsed since session start
        // Check if all regions have been answered
        const getAnsweredRegionsStmt = db.prepare(`SELECT COUNT(*) as count FROM gameprogress WHERE sessionId = ?`);
        const answeredRegions = getAnsweredRegionsStmt.get(sessionId) as { count: number };
        if (answeredRegions.count >= TOTAL_REGIONS_TIME_ATTACK) {
            endgame = true;
            quitReason = "all-answered"
            if (elapsedTime < MAX_TIME_IN_SECONDS*1000) { // add bonus points if time is not over
                bonusTime = MAX_TIME_IN_SECONDS*1000 - elapsedTime
                scoreIncrement += Math.floor(bonusTime * BONUS_POINTS_PER_SECOND / 1000);
            }
        }
        if (elapsedTime >= MAX_TIME_IN_SECONDS*1000) {
            endgame = true;
        }
    }

    // Save the score in the session
    const finalScore = session.currentScore + scoreIncrement; // Add the last score increment
    const updateSessionStmt = db.prepare(`
        UPDATE gamesessions
        SET currentScore = ?
        WHERE id = ?
    `);
    updateSessionStmt.run(finalScore, sessionId);

    // If the game is over, update the session status
    if (endgame) {
        endGame({session, finalScore, elapsedTime, quitReason, bonusTime})
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
    });
}

// TODO ADD ENDGAME WHEN TIME HAS ELAPSED IN FRONTEND

const endGame = ({session, finalScore, elapsedTime, quitReason, bonusTime} : 
    {session: GameSession, finalScore?: number, elapsedTime?: number, quitReason?: string, bonusTime?:number}) : void => {
    if(finalScore === undefined){
        const getScoreStmt = db.prepare(`SELECT currentScore FROM gamesessions WHERE id = ?`);
        const scoreRow = getScoreStmt.get(session.id) as { currentScore: number };
        finalScore = scoreRow ? scoreRow.currentScore : 0;
    }
    if(elapsedTime === undefined){
        const getCreatedAtStmt = db.prepare(`SELECT createdAt FROM gamesessions WHERE id = ?`);
        const createdAtRow = getCreatedAtStmt.get(session.id) as { createdAt: number };
        if (createdAtRow && typeof createdAtRow.createdAt === 'number') {
            elapsedTime = Math.floor((Date.now() - createdAtRow.createdAt));
        } else {
            elapsedTime = 0;
        }
    }
    if(bonusTime === undefined) bonusTime = 0
    if(quitReason === undefined) quitReason = ""
    // calculate accuracy for time attack mode
    let accurateClicks = 0
    let incorrectClicks = 0
    let totalClicks = 0
    if (session.mode === "time-attack") {
        // All correct answers
        const getScoreStmt = db.prepare(`
            SELECT COUNT(*) as count FROM gameprogress
            WHERE sessionId = ? AND isCorrect = 1
        `);
        const accurateResults = getScoreStmt.get(session.id) as { count: number };
        accurateClicks = accurateResults.count
        // Accuracy: correct / total attempts
        const getTotalStmt = db.prepare(`
            SELECT COUNT(*) as count FROM gameprogress
            WHERE sessionId = ? AND isCorrect = 0
        `);
        const incorrectResults = getTotalStmt.get(session.id) as { count: number };
        incorrectClicks = incorrectResults.count
        totalClicks = accurateClicks + incorrectClicks
    }
    if (session.mode === "streak") {
        const getScoreStmt = db.prepare(`
            SELECT COUNT(*) as count FROM gameprogress
            WHERE sessionId = ? AND isCorrect = 1
        `);
        const accurateResults = getScoreStmt.get(session.id) as { count: number };
        accurateClicks = accurateResults.count
        totalClicks = accurateClicks
    }

    // Compute time per region stats for this session
    const getTimesStmt = db.prepare(`
        SELECT timeTaken, isCorrect FROM gameprogress WHERE sessionId = ?
    `);
    const timesRows = getTimesStmt.all(session.id) as { timeTaken: number, isCorrect: number }[];
    const times = timesRows.map(row => row.timeTaken).filter(t => typeof t === 'number' && !isNaN(t));

    // time stats
    let minTimePerRegion = null, maxTimePerRegion = null, avgTimePerRegion = null;
    if (times.length > 0) {
        minTimePerRegion = Math.min(...times);
        maxTimePerRegion = Math.max(...times);
        avgTimePerRegion = times.reduce((a, b) => a + b, 0) / times.length;
    }

    // time stats in correct regions
    const correctTimes = timesRows.filter(row => row.isCorrect === 1).map(row => row.timeTaken);
    let minTimeCorrect = null, maxTimeCorrect = null, avgTimeCorrect = null;
    if (correctTimes.length > 0) {
        minTimeCorrect = Math.min(...correctTimes);
        maxTimeCorrect = Math.max(...correctTimes);
        avgTimeCorrect = correctTimes.reduce((a, b) => a + b, 0) / correctTimes.length;
    }

    // Insert into finishedsessions
    const insertFinishedStmt = db.prepare(`
        INSERT INTO finishedsessions (userId, mode, atlas, score, 
            attempts, correct, incorrect, 
            minTimePerRegion, maxTimePerRegion, avgTimePerRegion,
            minTimePerCorrectRegion, maxTimePerCorrectRegion, avgTimePerCorrectRegion,
            quitReason, duration)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertFinishedStmt.run(session.userId, session.mode, session.atlas, finalScore, 
        totalClicks, accurateClicks, incorrectClicks,
        minTimePerRegion, maxTimePerRegion, avgTimePerRegion,
        minTimeCorrect, maxTimeCorrect, avgTimeCorrect,
        quitReason, elapsedTime);

    // Delete all gameprogress for this session
    const deleteProgressStmt = db.prepare(`DELETE FROM gameprogress WHERE sessionId = ?`);
    deleteProgressStmt.run(session.id);

    // Delete the gamesession itself
    const deleteSessionStmt = db.prepare(`DELETE FROM gamesessions WHERE id = ?`);
    deleteSessionStmt.run(session.id);

}
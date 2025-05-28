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
            INSERT INTO gameprogress (sessionId, sessionToken, regionId, timeTaken, isActive, isCorrect, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `);
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
    const sessionStartTime = new Date(session.createdAt).getTime();
    const currentTime = Date.now();
    const elapsedTime = Math.floor((currentTime - sessionStartTime) / 1000); // Time in seconds

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
    } else if (session.mode == "time-attack" && elapsedTime < MAX_TIME_IN_SECONDS) {
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
        SET isActive = ?, isCorrect = ?, timeTaken = ?, scoreIncrement = ?, createdAt = datetime('now')
        WHERE id = ?
    `);
    const timeTaken = Math.floor((Date.now() - new Date(activeProgress.createdAt).getTime()) / 1000); // Time in seconds
    updateProgressStmt.run(0, isCorrect ? 1 : 0, timeTaken, scoreIncrement, activeProgress.id);

    let endgame = false;
    if (!isCorrect && session.mode == "streak") {
        endgame = true;
    } else if (session.mode == "time-attack") {
        // Check time elapsed since session start
        // Check if all regions have been answered
        const getAnsweredRegionsStmt = db.prepare(`SELECT COUNT(*) as count FROM gameprogress WHERE sessionId = ?`);
        const answeredRegions = getAnsweredRegionsStmt.get(sessionId) as { count: number };
        if (answeredRegions.count >= TOTAL_REGIONS_TIME_ATTACK) {
            endgame = true;
            if (elapsedTime < MAX_TIME_IN_SECONDS) { // add bonus points if time is not over
                scoreIncrement += (MAX_TIME_IN_SECONDS - elapsedTime) * BONUS_POINTS_PER_SECOND;
            }
        }
        if (elapsedTime >= MAX_TIME_IN_SECONDS) {
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

    let accuracy = 0;
    // If the game is over, update the session status
    if (endgame) {
        // calculate accuracy for time attack mode
        if (session.mode === "time-attack") {
            // All correct answers
            const getScoreStmt = db.prepare(`
                SELECT COUNT(*) as count FROM gameprogress
                WHERE sessionId = ? AND isCorrect = 1
            `);
            const accurateResults = getScoreStmt.get(sessionId) as { count: number };
            // Accuracy: correct / total attempts
            const getTotalStmt = db.prepare(`
                SELECT COUNT(*) as total FROM gameprogress
                WHERE sessionId = ?
            `);
            const totalResult = getTotalStmt.get(sessionId) as { total: number };
            accuracy = totalResult.total > 0 ? accurateResults.count / totalResult.total : 0;
        }
        
        // Insert into finishedsessions
        const insertFinishedStmt = db.prepare(`
            INSERT INTO finishedsessions (userId, mode, atlas, score, accuracy, duration)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        insertFinishedStmt.run(session.userId, session.mode, session.atlas, finalScore, accuracy, elapsedTime);

        // Delete all gameprogress for this session
        const deleteProgressStmt = db.prepare(`DELETE FROM gameprogress WHERE sessionId = ?`);
        deleteProgressStmt.run(sessionId);

        // Delete the gamesession itself
        const deleteSessionStmt = db.prepare(`DELETE FROM gamesessions WHERE id = ?`);
        deleteSessionStmt.run(sessionId);
    }
    // Respond with the result
    res.status(200).send({
        message: isCorrect ? "Correct guess!" : "Incorrect guess.",
        isCorrect,
        regionId,
        voxelValue,
        endgame,
        accuracy,
        scoreIncrement,
        finalScore,
    });
}
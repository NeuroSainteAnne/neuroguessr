import { db } from "./database_init.ts";
import jwt from "jsonwebtoken";
import fs from 'fs'
import path from "path";
import { __dirname, htmlRoot } from "./utils.ts";
import { NVImage } from "@niivue/niivue";
var config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'))
import atlasFiles from "../neuroguessr_frontend/src/atlas_files.ts"

const validRegions = {}
const imageRef : Record<string,NVImage> = {}
const imageMetadata : Record<string,any> = {}
for (const atlas in atlasFiles) {
    const atlasJsonPath = path.join(htmlRoot, "neuroguessr_frontend", "dist", "assets", "atlas", "descr", "en", atlasFiles[atlas].json)
    const atlasJson = JSON.parse(fs.readFileSync(atlasJsonPath, 'utf-8'))
    const atlasNiiPath = path.join(htmlRoot, "neuroguessr_frontend", "dist", "assets", "atlas", "nii", atlasFiles[atlas].nii)
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
}

export const startGameSession = async (req, res) => {
    try {
        const { mode, atlas } = req.body;
        const userId = req.user._id; // Extract user ID from the authenticated user

        // Validate the required fields
        if (!mode || !atlas) {
            return res.status(400).send({ message: "Mode and atlas are required to start a session." });
        }

        // Generate a session token
        const sessionToken = jwt.sign({ userId, mode, atlas }, config.jwt_secret, { expiresIn: "1h" });

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

export const getNextRegion = async (req, res) => {
    const { sessionId, sessionToken } = req.body;
    // Validate the session token
    const getSessionStmt = db.prepare(`SELECT * FROM gamesessions WHERE id = ? AND token = ?`);
    const session = getSessionStmt.get(sessionId, sessionToken);
    if (!session) {
        return res.status(403).send({ message: "Invalid session or token mismatch" });
    }
    // Get the atlas length
    const atlasValidRegions = validRegions[session.atlas];
    if (!atlasValidRegions) {
        return res.status(400).send({ message: "Invalid atlas specified in the session." });
    }
    let randomRegionId = null
    if(session.mode == "time-attack"){
        // we have to select region that has not already been answered
        const getSessionStmt = db.prepare(`SELECT * FROM gameprogress WHERE sessionId = ? AND isCorrect = 1`);
        const answeredRegions = getSessionStmt.all(sessionId);
        const answeredRegionIds = answeredRegions.map(region => region.regionId);
        const remainingRegionIds = atlasValidRegions.filter(regionId => !answeredRegionIds.includes(regionId));
        if (remainingRegionIds.length === 0) {
            return res.status(200).send({ message: "No more regions available to guess.", regionId: -1 });
        }
        // Select a random region from the remaining regions
        const randomIndex = Math.floor(Math.random() * remainingRegionIds.length);
        randomRegionId = remainingRegionIds[randomIndex];
    } else if (session.mode == "streak") {
        // Select a random region from the remaining regions
        const randomIndex = Math.floor(Math.random() * atlasValidRegions.length);
        randomRegionId = atlasValidRegions[randomIndex];
    }
    if(randomRegionId !== null){
        const insertProgressStmt = db.prepare(`
            INSERT INTO gameprogress (sessionId, sessionToken, regionId, timeTaken, isActive, isCorrect, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        insertProgressStmt.run(sessionId, sessionToken, randomRegionId, 0, 1, 0);
        res.status(200).send({
            message: "Next region selected successfully.",
            regionId: randomRegionId,
        });
    }
}

const TOTAL_REGIONS_TIME_ATTACK = 18;

export const validateRegion = async (req, res) => {
    const { sessionId, sessionToken, coordinates } = req.body;
    // Validate the session token
    const getSessionStmt = db.prepare(`SELECT * FROM gamesessions WHERE id = ? AND token = ?`);
    const session = getSessionStmt.get(sessionId, sessionToken);
    if (!session) {
        return res.status(403).send({ message: "Invalid session or token mismatch" });
    }
    // Retrieve the active gameprogress entry
    const getActiveProgressStmt = db.prepare(`
        SELECT * FROM gameprogress WHERE sessionId = ? AND isActive = 1
    `);
    const activeProgress = getActiveProgressStmt.get(sessionId);
    if (!activeProgress) {
        return res.status(400).send({ message: "No active region to validate." });
    }
    const { regionId } = activeProgress;
    // Validate the coordinates
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 3) {
        return res.status(400).send({ message: "Invalid coordinates provided." });
    }
    const [x, y, z] = coordinates;
    // Get the atlas data for the session
    const atlasImage = imageRef[session.atlas];
    const atlasMetadata = imageMetadata[session.atlas];
    if (x < 0 || x >= atlasMetadata.nx || y < 0 || y >= atlasMetadata.ny || z < 0 || z >= atlasMetadata.nz) {
        return res.status(400).send({ message: "Coordinates are out of bounds." });
    }
    const voxelValue = atlasImage.getValue(x, y, z);
    // Check if the voxel value matches the active region ID
    const isCorrect = voxelValue === regionId;
    const updateProgressStmt = db.prepare(`
        UPDATE gameprogress
        SET isActive = ?, isCorrect = ?, timeTaken = ?, createdAt = datetime('now')
        WHERE id = ?
    `);
    const timeTaken = Math.floor((Date.now() - new Date(activeProgress.createdAt).getTime()) / 1000); // Time in seconds
    updateProgressStmt.run(0, isCorrect ? 1 : 0, timeTaken, activeProgress.id);

    let endgame = false
    if(!isCorrect && session.mode == "streak"){
        endgame = true
    } else if(session.mode == "time-attack"){
        const getAnsweredRegionsStmt = db.prepare(`SELECT COUNT(*) as count FROM gameprogress WHERE sessionId = ?`);
        const answeredRegions = getAnsweredRegionsStmt.get(sessionId);
        if(answeredRegions.count >= TOTAL_REGIONS_TIME_ATTACK){
            endgame = true
        }
    }

    let accuracy = 0;
    let finalScore = 0;
    let duration = 0;

    // If the game is over, update the session status
    if (endgame) {
        // Calculate final score and duration
        // TEMPORARY CALCULATION ALGORITHM
        // For streak mode, score = number of correct answers before failure
        // For time-attack, score = number of correct answers, duration = sum of timeTaken for correct answers


        if (session.mode === "streak") {
            // Count correct answers before the first incorrect
            const getStreakStmt = db.prepare(`
                SELECT COUNT(*) as count FROM gameprogress
                WHERE sessionId = ? AND isCorrect = 1
            `);
            const streakResult = getStreakStmt.get(sessionId);
            finalScore = streakResult.count;
            // Duration: sum of timeTaken for correct answers
            const getDurationStmt = db.prepare(`
                SELECT SUM(timeTaken) as total FROM gameprogress
                WHERE sessionId = ? AND isCorrect = 1
            `);
            const durationResult = getDurationStmt.get(sessionId);
            duration = durationResult.total || 0;
        } else if (session.mode === "time-attack") {
            // All correct answers
            const getScoreStmt = db.prepare(`
                SELECT COUNT(*) as count FROM gameprogress
                WHERE sessionId = ? AND isCorrect = 1
            `);
            const scoreResult = getScoreStmt.get(sessionId);
            finalScore = scoreResult.count;
            // Accuracy: correct / total attempts
            const getTotalStmt = db.prepare(`
                SELECT COUNT(*) as total FROM gameprogress
                WHERE sessionId = ?
            `);
            const totalResult = getTotalStmt.get(sessionId);
            accuracy = totalResult.total > 0 ? finalScore / totalResult.total : 0;
            // Duration: sum of timeTaken for correct answers
            const getDurationStmt = db.prepare(`
                SELECT SUM(timeTaken) as total FROM gameprogress
                WHERE sessionId = ? AND isCorrect = 1
            `);
            const durationResult = getDurationStmt.get(sessionId);
            duration = durationResult.total || 0;
        }

        // Insert into finishedsessions
        const insertFinishedStmt = db.prepare(`
            INSERT INTO finishedsessions (userId, mode, atlas, score, accuracy, duration)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        insertFinishedStmt.run(session.userId, session.mode, session.atlas, finalScore, accuracy, duration);
    }
    // Respond with the result
    res.status(200).send({
        message: isCorrect ? "Correct guess!" : "Incorrect guess.",
        isCorrect,
        regionId,
        voxelValue,
        endgame,
        accuracy,
        finalScore,
    });
}
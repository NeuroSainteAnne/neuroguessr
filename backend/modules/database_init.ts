import sqlite3 from "better-sqlite3";
import path from "path";
import bcrypt from "bcrypt";
import { __dirname } from "./utils.ts";
type Config = import("../interfaces/config.interfaces.ts").Config;
import configJson from '../config.json' with { type: "json" };
const config: Config = configJson;

// Create a new database or open an existing one
export const db: sqlite3.Database = new sqlite3(path.join(__dirname, "..", "database.db"));

export const database_init = async () => {
    try {
        db.exec(
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                firstname TEXT NOT NULL,
                lastname TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                verified BOOLEAN NOT NULL DEFAULT 0,
                publishToLeaderboard BOOLEAN DEFAULT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER KEY NOT NULL,
                token TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS gamesessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER KEY NOT NULL,
                token TEXT NOT NULL,
                mode TEXT NOT NULL,
                atlas TEXT NOT NULL,
                createdAt INTEGER DEFAULT(unixepoch('subsec') * 1000),
                currentScore INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS gameprogress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sessionId INTEGER NOT NULL,
                sessionToken TEXT NOT NULL,
                regionId INTEGER NOT NULL,
                timeTaken INTEGER NOT NULL,
                isActive BOOLEAN NOT NULL DEFAULT 1,
                isCorrect BOOLEAN NOT NULL DEFAULT 0,
                scoreIncrement INTEGER NOT NULL DEFAULT 0,
                createdAt INTEGER DEFAULT(unixepoch('subsec') * 1000),
                FOREIGN KEY (sessionId) REFERENCES gamesessions (id)
            );
            CREATE TABLE IF NOT EXISTS finishedsessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER NOT NULL,
                mode TEXT NOT NULL,
                atlas TEXT NOT NULL,
                score INTEGER NOT NULL,
                attempts INTEGER,
                correct INTEGER,
                incorrect INTEGER,
                minTimePerRegion INTEGER,
                maxTimePerRegion INTEGER,
                avgTimePerRegion INTEGER,
                minTimePerCorrectRegion INTEGER,
                maxTimePerCorrectRegion INTEGER,
                avgTimePerCorrectRegion INTEGER,
                quitReason TEXT,
                duration INTEGER NOT NULL,
                createdAt INTEGER DEFAULT(unixepoch('subsec') * 1000),
                FOREIGN KEY (userId) REFERENCES users (id)
            );
            CREATE TABLE IF NOT EXISTS multisessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sessionCode INTEGER NOT NULL,
                sessionToken TEXT NOT NULL,
                creatorId INTEGER NOT NULL,
                createdAt INTEGER DEFAULT(unixepoch('subsec') * 1000),
                FOREIGN KEY (creatorId) REFERENCES users (id)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_userId ON tokens (userId);
        `);
        console.log("Database schema initialized successfully.");
        if(config.addTestUser){
            const salt = await bcrypt.genSalt(Number(config.salt));
            const hashedPassword = await bcrypt.hash("test", salt);
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO users (username, firstname, lastname, email, password, verified)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            stmt.run("test", "Test", "User", "", hashedPassword, 1);
            console.log("Test user added successfully.");
        }
    } catch (err) {
        console.error("Error initializing database schema:", (err instanceof Error ? err.message : err));
    }
}

export const cleanExpiredTokens = () => {
    try {
        const stmt = db.prepare(`
            DELETE FROM tokens
            WHERE createdAt <= datetime('now', '-1 hour')
        `);
        const result = stmt.run();
        if(result.changes !== 0){
            console.log(`Cleaned up ${result.changes} expired tokens.`);
        }
    } catch (err) {
        console.error("Error cleaning expired tokens:", (err instanceof Error ? err.message : err));
    }
};

export const cleanOldGameSessions = () => {
    try {
        const suppressionDelay = 60 * 60 * 1000; // in ms 
        // Delete from gameprogress where the session is older than 1 hour
        const deleteGameProgressStmt = db.prepare(`
            DELETE FROM gameprogress
            WHERE sessionId IN (
                SELECT id FROM gamesessions WHERE createdAt <= strftime('%s','now')*1000 - ${suppressionDelay}
            )
        `);
        const resultProgress = deleteGameProgressStmt.run();
        if(resultProgress.changes !== 0){
            console.log(`Cleaned up ${resultProgress.changes} old gameprogress entries.`);
        }
        // Delete from gamesessions older than 1 hour
        const deleteGameSessionsStmt = db.prepare(`
            DELETE FROM gamesessions
            WHERE createdAt <= strftime('%s','now')*1000 - ${suppressionDelay}
        `);
        const resultSessions = deleteGameSessionsStmt.run();
        if(resultSessions.changes !== 0){
            console.log(`Cleaned up ${resultSessions.changes} old gamesessions.`);
        }
    } catch (err) {
        console.error("Error cleaning old game sessions:", (err instanceof Error ? err.message : err));
    }
}
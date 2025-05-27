import sqlite3 from "better-sqlite3";
import path from "path";
import bcrypt from "bcrypt";
import { __dirname } from "./utils.ts";
import fs from 'fs'
var config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'))

// Create a new database or open an existing one
export const db = new sqlite3(path.join(__dirname, "database.db"));

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
                verified BOOLEAN NOT NULL DEFAULT 0
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
                accuracy REAL NOT NULL,
                duration INTEGER NOT NULL,
                createdAt INTEGER DEFAULT(unixepoch('subsec') * 1000),
                FOREIGN KEY (userId) REFERENCES users (id)
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
        console.error("Error initializing database schema:", err.message);
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
        console.error("Error cleaning expired tokens:", err.message);
    }
};
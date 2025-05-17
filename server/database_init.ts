import sqlite3 from "better-sqlite3";
import path from "path";
import { __dirname } from "./utils.ts";

// Create a new database or open an existing one
export const db = new sqlite3(path.join(__dirname, "database.db"));

export const database_init = () => {
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
            CREATE UNIQUE INDEX IF NOT EXISTS idx_userId ON tokens (userId);
        `);
        console.log("Database schema initialized successfully.");
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
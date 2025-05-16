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
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                verified BOOLEAN NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS tokens (
            userId INTEGER PRIMARY KEY UNIQUE,
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
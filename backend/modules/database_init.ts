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
                id SERIAL PRIMARY KEY,
                uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
                username TEXT NOT NULL,
                firstname TEXT NOT NULL,
                lastname TEXT NOT NULL,
                email TEXT NOT NULL,
                password TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                verified BOOLEAN NOT NULL DEFAULT FALSE,
                language TEXT NOT NULL DEFAULT 'fr',
                publish_to_leaderboard BOOLEAN DEFAULT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

            CREATE TABLE IF NOT EXISTS tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON tokens(user_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_token ON tokens(token);

            CREATE TABLE IF NOT EXISTS game_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token TEXT NOT NULL,
                mode TEXT NOT NULL,
                atlas TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                current_score INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON game_sessions(user_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_game_sessions_token ON game_sessions(token);
            CREATE INDEX IF NOT EXISTS idx_game_sessions_created_at ON game_sessions(created_at);

            CREATE TABLE IF NOT EXISTS game_progress (
                id SERIAL PRIMARY KEY,
                session_id INTEGER NOT NULL REFERENCES game_sessions (id) ON DELETE CASCADE,
                session_token TEXT NOT NULL REFERENCES game_sessions (token) ON DELETE CASCADE,
                region_id INTEGER NOT NULL,
                time_taken INTEGER NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                is_correct BOOLEAN NOT NULL DEFAULT FALSE,
                score_increment INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_game_progress_session_id ON game_progress(session_id);
            CREATE INDEX IF NOT EXISTS idx_game_progress_is_active ON game_progress(is_active);
            CREATE INDEX IF NOT EXISTS idx_game_progress_is_correct ON game_progress(is_correct);
            CREATE INDEX IF NOT EXISTS idx_game_progress_session_token ON game_progress(session_token);

            CREATE TABLE IF NOT EXISTS finished_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                mode TEXT NOT NULL,
                atlas TEXT NOT NULL,
                score INTEGER NOT NULL CHECK (score >= 0),
                attempts INTEGER,
                correct INTEGER,
                incorrect INTEGER,
                min_time_per_region INTEGER,
                max_time_per_region INTEGER,
                avg_time_per_region INTEGER,
                min_time_per_correct_region INTEGER,
                max_time_per_correct_region INTEGER,
                avg_time_per_correct_region INTEGER,
                quit_reason TEXT,
                multiplayer_games_won INTEGER DEFAULT 0,
                duration INTEGER NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_finished_sessions_user_id ON finished_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_finished_sessions_mode ON finished_sessions(mode);
            CREATE INDEX IF NOT EXISTS idx_finished_sessions_atlas ON finished_sessions(atlas);
            CREATE INDEX IF NOT EXISTS idx_finished_sessions_created_at ON finished_sessions(created_at);

            CREATE TABLE IF NOT EXISTS multi_sessions (
                id SERIAL PRIMARY KEY,
                session_code INTEGER NOT NULL,
                session_token TEXT NOT NULL,
                creator_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_multi_sessions_session_code ON multi_sessions(session_code);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_multi_sessions_session_token ON multi_sessions(session_token);
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
        // Delete from multisessions older than 1 hour
        const deleteMultiSessionsStmt = db.prepare(`
            DELETE FROM multisessions
            WHERE createdAt <= strftime('%s','now')*1000 - ${suppressionDelay}
        `);
        const resultMultiSessions = deleteMultiSessionsStmt.run();
        if(resultMultiSessions.changes !== 0){
            console.log(`Cleaned up ${resultMultiSessions.changes} old multisessions.`);
        }
    } catch (err) {
        console.error("Error cleaning old game sessions:", (err instanceof Error ? err.message : err));
    }
}
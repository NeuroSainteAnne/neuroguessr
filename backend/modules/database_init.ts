import postgres from 'postgres';
import path from "path";
import bcrypt from "bcrypt";
import { __dirname } from "./utils.ts";
type Config = import("../interfaces/config.interfaces.ts").Config;
import configJson from '../config.json' with { type: "json" };
const config: Config = configJson;

// Create a new database or open an existing one
export const sql = postgres(config.pgConnectionString); 
export const database_init = async () => {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL,
                firstname TEXT NOT NULL,
                lastname TEXT NOT NULL,
                email TEXT NOT NULL,
                password TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                verified BOOLEAN NOT NULL DEFAULT FALSE,
                language TEXT NOT NULL DEFAULT 'fr',
                publish_to_leaderboard BOOLEAN DEFAULT NULL
            );`
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);`
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);`
            
        await sql`CREATE TABLE IF NOT EXISTS tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );`
        await sql`CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON tokens(user_id);`
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_token ON tokens(token);`

        await sql`CREATE TABLE IF NOT EXISTS game_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token TEXT NOT NULL,
                mode TEXT NOT NULL,
                atlas TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                current_score INTEGER NOT NULL DEFAULT 0
            );`
        await sql`CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON game_sessions(user_id);`
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_game_sessions_token ON game_sessions(token);`
        await sql`CREATE INDEX IF NOT EXISTS idx_game_sessions_created_at ON game_sessions(created_at);`

        await sql`CREATE TABLE IF NOT EXISTS game_progress (
                id SERIAL PRIMARY KEY,
                session_id INTEGER NOT NULL REFERENCES game_sessions (id) ON DELETE CASCADE,
                session_token TEXT NOT NULL REFERENCES game_sessions (token) ON DELETE CASCADE,
                region_id INTEGER NOT NULL,
                time_taken INTEGER NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                is_correct BOOLEAN NOT NULL DEFAULT FALSE,
                score_increment INTEGER NOT NULL DEFAULT 0,
                attempts INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );`
        await sql`CREATE INDEX IF NOT EXISTS idx_game_progress_session_id ON game_progress(session_id);`
        await sql`CREATE INDEX IF NOT EXISTS idx_game_progress_is_active ON game_progress(is_active);`
        await sql`CREATE INDEX IF NOT EXISTS idx_game_progress_is_correct ON game_progress(is_correct);`
        await sql`CREATE INDEX IF NOT EXISTS idx_game_progress_session_token ON game_progress(session_token);`

        await sql`CREATE TABLE IF NOT EXISTS finished_sessions (
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
            );`
        await sql`CREATE INDEX IF NOT EXISTS idx_finished_sessions_user_id ON finished_sessions(user_id);`
        await sql`CREATE INDEX IF NOT EXISTS idx_finished_sessions_mode ON finished_sessions(mode);`
        await sql`CREATE INDEX IF NOT EXISTS idx_finished_sessions_atlas ON finished_sessions(atlas);`
        await sql`CREATE INDEX IF NOT EXISTS idx_finished_sessions_created_at ON finished_sessions(created_at);`

        await sql`CREATE TABLE IF NOT EXISTS multi_sessions (
                id SERIAL PRIMARY KEY,
                session_code INTEGER NOT NULL,
                session_token TEXT NOT NULL,
                creator_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );`
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_multi_sessions_session_code ON multi_sessions(session_code);`
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_multi_sessions_session_token ON multi_sessions(session_token);`
        
        console.log("Database schema initialized successfully.");
        if(config.addTestUser){
            const salt = await bcrypt.genSalt(Number(config.salt));
            const hashedPassword = await bcrypt.hash("test", salt);
            await sql`
                INSERT INTO users (username, firstname, lastname, email, password, verified)
                VALUES ('test', 'Test', 'User', '', ${hashedPassword}, ${true})
                ON CONFLICT (username) DO NOTHING
            `;
            console.log("Test user added successfully.");
        }
    } catch (err) {
        console.error("Error initializing database schema:", (err instanceof Error ? err.message : err));
    }
}

export const cleanExpiredTokens = async () => {
    try {
        const result = await sql`
            DELETE FROM tokens
            WHERE createdAt <= NOW() - INTERVAL '1 hour'
        `;
        if(result.count !== 0){
            console.log(`Cleaned up ${result.count} expired tokens.`);
        }
    } catch (err) {
        console.error("Error cleaning expired tokens:", (err instanceof Error ? err.message : err));
    }
};

export const cleanOldGameSessions = async () => {
    try {
        const suppressionDelay = 60 * 60 * 1000; // in ms 
        // Delete from gameprogress where the session is older than 1 hour
        const result = await sql`
            DELETE FROM game_progress
            WHERE session_id IN (
                SELECT id FROM game_sessions WHERE created_at <= NOW() - INTERVAL '1 hour'
            )
        `;
        if(result.count !== 0){
            console.log(`Cleaned up ${result.count} old gameprogress entries.`);
        }
        // Delete from gamesessions older than 1 hour
        const resultSessions = await sql`
            DELETE FROM game_sessions
            WHERE created_at <= NOW() - INTERVAL '1 hour'
        `;
        if (resultSessions.count !== 0) {
            console.log(`Cleaned up ${resultSessions.count} old game_sessions.`);
        }
        // Delete from multisessions older than 1 hour
        const resultMultiSessions = await sql`
            DELETE FROM multi_sessions
            WHERE created_at <= NOW() - INTERVAL '1 hour'
        `;
        if (resultMultiSessions.count !== 0) {
            console.log(`Cleaned up ${resultMultiSessions.count} old multi_sessions.`);
        }
    } catch (err) {
        console.error("Error cleaning old game sessions:", (err instanceof Error ? err.message : err));
    }
}
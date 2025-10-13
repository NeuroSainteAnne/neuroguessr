import postgres from 'postgres';
import path from "path";
import bcrypt from "bcrypt";
import { __dirname } from "./utils.ts";
type Config = import("../interfaces/config.interfaces.ts").Config;
import configJson from '../config.json' with { type: "json" };
import { debug } from 'console';
import { logger } from './logging.ts';
const config: Config = configJson;

// Create a new database or open an existing one
export const sql = postgres(
    encodeURI(config.pgConnectionString), 
    {
        debug: true,
        max: 20,                    // Maximum connections in pool
        idle_timeout: 20,           // Close idle connections after 20s
        connect_timeout: 10,        // Connection timeout
        prepare: false,             // Better for dynamic queries
        transform: {
            column: {
                from: postgres.fromCamel
            }
        },
        types: {
            date: {
                // Ensure dates are properly parsed
                parse: (value: any) => new Date(value),
                serialize: (value: any) => value instanceof Date ? value.toISOString() : value,
                to: 1082,
                // Optionally, specify the PostgreSQL type OIDs for dates (here 1082 for "date")
                from: [1082]
            }
        },
        // Add connection retry logic
        connection: {
            application_name: 'neuroguessr_backend'
        }
    }); 

export const database_init = async () => {
    try {
        logger.info('Initializing database schema...');
        // Create tables with optimized indexes
        await sql.begin(async sql => {
            await sql`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username TEXT NOT NULL,
                    firstname TEXT NOT NULL,
                    lastname TEXT NOT NULL,
                    email TEXT NOT NULL,
                    password TEXT NOT NULL,
                    admin BOOLEAN NOT NULL default FALSE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    verified BOOLEAN NOT NULL DEFAULT FALSE,
                    language TEXT NOT NULL DEFAULT 'fr',
                    publish_to_leaderboard BOOLEAN DEFAULT NULL,
                    clinical_trial_gender TEXT DEFAULT NULL,
                    clinical_trial_age INTEGER DEFAULT NULL,
                    clinical_trial_country TEXT DEFAULT NULL,
                    clinical_trial_occupation TEXT DEFAULT NULL,
                    clinical_trial_consent TEXT DEFAULT NULL,
                    clinical_trial_consent_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `;
            await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);`
            await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);`
            await sql`CREATE INDEX IF NOT EXISTS idx_users_verified ON users(verified);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_users_language ON users(language);`;

            await sql`
                CREATE TABLE IF NOT EXISTS tokens (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    token TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `;
            await sql`CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON tokens(user_id);`
            await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_token ON tokens(token);`

            await sql`
                CREATE TABLE IF NOT EXISTS game_sessions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    token TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    atlas TEXT NOT NULL,
                    blind_mode BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    current_score INTEGER NOT NULL DEFAULT 0,
                    current_streak INTEGER DEFAULT 0,
                    consecutive_errors INTEGER DEFAULT 0
                );
            `;
            await sql`CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON game_sessions(user_id);`;
            await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_game_sessions_token ON game_sessions(token);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_game_sessions_created_at ON game_sessions(created_at);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_game_sessions_user_created ON game_sessions(user_id, created_at);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_game_sessions_mode_atlas ON game_sessions(mode, atlas);`;
            await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_game_sessions_token ON game_sessions(token);`;

            await sql`
                CREATE TABLE IF NOT EXISTS game_progress (
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
                );
            `;
            await sql`CREATE INDEX IF NOT EXISTS idx_game_progress_session_id ON game_progress(session_id);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_game_progress_is_active ON game_progress(is_active);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_game_progress_is_correct ON game_progress(is_correct);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_game_progress_session_token ON game_progress(session_token);`;


            await sql`
                CREATE TABLE IF NOT EXISTS finished_sessions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                    mode TEXT NOT NULL,
                    atlas TEXT NOT NULL,
                    blind_mode BOOLEAN NOT NULL DEFAULT FALSE,
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
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    name TEXT DEFAULT NULL,
                    classic_challenge_id INTEGER,
                    classic_challenge_start_date TIMESTAMP WITH TIME ZONE,
                    classic_challenge_end_date TIMESTAMP WITH TIME ZONE
                );
            `;
            await sql`CREATE INDEX IF NOT EXISTS idx_finished_sessions_user_id ON finished_sessions(user_id);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_finished_sessions_mode ON finished_sessions(mode);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_finished_sessions_atlas ON finished_sessions(atlas);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_finished_sessions_created_at ON finished_sessions(created_at);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_finished_sessions_leaderboard ON finished_sessions(mode, atlas, blind_mode, score DESC);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_finished_sessions_user_stats ON finished_sessions(user_id, created_at, score);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_finished_sessions_atlas_count ON finished_sessions(atlas) WHERE atlas IS NOT NULL;`;

            await sql`
                CREATE TABLE IF NOT EXISTS multi_sessions (
                    id SERIAL PRIMARY KEY,
                    session_code INTEGER NOT NULL,
                    session_token TEXT NOT NULL,
                    creator_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    public BOOLEAN NOT NULL DEFAULT FALSE,
                    is_challenge BOOLEAN NOT NULL DEFAULT FALSE,
                    is_classic_challenge BOOLEAN NOT NULL DEFAULT FALSE,
                    persistent_config TEXT DEFAULT NULL,
                    name TEXT DEFAULT NULL,
                    start_date TIMESTAMP WITH TIME ZONE,
                    end_date TIMESTAMP WITH TIME ZONE,
                    classic_challenge_referral INTEGER DEFAULT NULL
                );
            `;
            await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_multi_sessions_session_code ON multi_sessions(session_code);`
            await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_multi_sessions_session_token ON multi_sessions(session_token);`

            await sql`
                ALTER TABLE multi_sessions 
                ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE;
            `;

            await sql`
                ALTER TABLE multi_sessions 
                ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE;
            `;

            await sql`
                ALTER TABLE multi_sessions 
                ADD COLUMN IF NOT EXISTS classic_challenge_referral INTEGER DEFAULT NULL;
            `;

            await sql`
                ALTER TABLE finished_sessions 
                ADD COLUMN IF NOT EXISTS blind_mode BOOLEAN NOT NULL DEFAULT FALSE;
            `;

            await sql`
                ALTER TABLE finished_sessions 
                ADD COLUMN IF NOT EXISTS classic_challenge_id INTEGER;
            `;

            await sql`
                ALTER TABLE game_progress 
                ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
            `;

            await sql`
                ALTER TABLE finished_sessions 
                ADD COLUMN IF NOT EXISTS blind_mode BOOLEAN NOT NULL DEFAULT FALSE;
            `;

        // Update old versions of the database schema
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin BOOLEAN NOT NULL default FALSE;`
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS clinical_trial_gender TEXT DEFAULT NULL;`
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS clinical_trial_age INTEGER DEFAULT NULL;`
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS clinical_trial_country TEXT DEFAULT NULL;`
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS clinical_trial_occupation TEXT DEFAULT NULL;`
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS clinical_trial_consent TEXT DEFAULT NULL;`
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS clinical_trial_consent_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`
            await sql`
                ALTER TABLE game_sessions 
                ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
            `;
            await sql`
                ALTER TABLE game_sessions 
                ADD COLUMN IF NOT EXISTS consecutive_errors INTEGER DEFAULT 0;
            `;

            await sql`CREATE INDEX IF NOT EXISTS idx_users_clinical_trial_gender ON users(clinical_trial_gender);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_users_clinical_trial_country ON users(clinical_trial_country);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_users_clinical_trial_occupation ON users(clinical_trial_occupation);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_users_clinical_trial_consent ON users(clinical_trial_consent);`;

            await sql`
                CREATE TABLE IF NOT EXISTS advanced_game_settings (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    public BOOLEAN NOT NULL DEFAULT FALSE,
                    settings TEXT NOT NULL
                );
            `;
            await sql`CREATE INDEX IF NOT EXISTS idx_advanced_game_settings_user_id ON advanced_game_settings(user_id);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_advanced_game_settings_name ON advanced_game_settings(name);`;

            await sql`
                ALTER TABLE multi_sessions 
                ADD COLUMN IF NOT EXISTS public BOOLEAN NOT NULL DEFAULT FALSE;
            `;
            await sql`CREATE INDEX IF NOT EXISTS idx_multi_sessions_public ON multi_sessions(public);`;
            
            await sql`
                ALTER TABLE multi_sessions 
                ADD COLUMN IF NOT EXISTS is_challenge BOOLEAN NOT NULL DEFAULT FALSE;
            `;
            await sql`CREATE INDEX IF NOT EXISTS idx_multi_sessions_is_challenge ON multi_sessions(is_challenge);`;
            
            await sql`
                ALTER TABLE multi_sessions 
                ADD COLUMN IF NOT EXISTS is_classic_challenge BOOLEAN NOT NULL DEFAULT FALSE;
            `;
            await sql`CREATE INDEX IF NOT EXISTS idx_multi_sessions_is_classic_challenge ON multi_sessions(is_classic_challenge);`;

            await sql`
                ALTER TABLE multi_sessions 
                ADD COLUMN IF NOT EXISTS persistent_config TEXT DEFAULT NULL;
            `;

            await sql`
                ALTER TABLE multi_sessions 
                ADD COLUMN IF NOT EXISTS name TEXT DEFAULT NULL;
            `;

            await sql`
                ALTER TABLE finished_sessions 
                ADD COLUMN IF NOT EXISTS name TEXT DEFAULT NULL;
            `;

            await sql`
                ALTER TABLE finished_sessions 
                ADD COLUMN IF NOT EXISTS classic_challenge_start_date TIMESTAMP WITH TIME ZONE;
            `;

            await sql`
                ALTER TABLE finished_sessions 
                ADD COLUMN IF NOT EXISTS classic_challenge_end_date TIMESTAMP WITH TIME ZONE;
            `;
        });

        logger.info("Database schema initialized successfully.");
        if(config.addTestUser){
            const salt = await bcrypt.genSalt(Number(config.salt));
            const hashedPassword = await bcrypt.hash("test", salt);
            await sql`
                INSERT INTO users (username, firstname, lastname, email, password, verified)
                VALUES ('test', 'Test', 'User', '', ${hashedPassword}, ${true})
                ON CONFLICT (username) DO NOTHING
            `;
            logger.info("Test user added successfully.");
        }
    } catch (err) {
        logger.error("Error initializing database schema:", (err instanceof Error ? err.message : err));
    }
}

export const cleanExpiredTokens = async () => {
    try {
        const result = await sql`
            DELETE FROM tokens
            WHERE created_at <= NOW() - INTERVAL '1 hour'
        `;
        if(result.count !== 0){
            logger.info(`Cleaned up ${result.count} expired tokens.`);
        }
    } catch (err) {
        logger.error("Error cleaning expired tokens:", (err instanceof Error ? err.message : err));
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
            logger.info(`Cleaned up ${result.count} old gameprogress entries.`);
        }
        // Delete from gamesessions older than 1 hour
        const resultSessions = await sql`
            DELETE FROM game_sessions
            WHERE created_at <= NOW() - INTERVAL '1 hour'
        `;
        if (resultSessions.count !== 0) {
            logger.info(`Cleaned up ${resultSessions.count} old game_sessions.`);
        }
        // Delete from multisessions older than 1 hour
        const resultMultiSessions = await sql`
            DELETE FROM multi_sessions
            WHERE created_at <= NOW() - INTERVAL '1 hour'
            AND is_challenge = FALSE
            AND is_classic_challenge = FALSE
        `;
        if (resultMultiSessions.count !== 0) {
            logger.info(`Cleaned up ${resultMultiSessions.count} old multi_sessions.`);
        }
    } catch (err) {
        logger.error("Error cleaning old game sessions:", (err instanceof Error ? err.message : err));
    }
}
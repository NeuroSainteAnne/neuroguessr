import postgres from 'postgres';
import bcrypt from "bcrypt";
import { __dirname } from "./utils.ts";
type Config = import("../interfaces/config.interfaces.ts").Config;
import configJson from '../config.json' with { type: "json" };
import { logger } from './logging.ts';
import { sendClassicChallengeResultsEmails } from "./multi_classic_challenge.ts";
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
                CREATE TABLE IF NOT EXISTS teams (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT DEFAULT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `;
            await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_name ON teams(name);`;

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
                    clinical_trial_consent_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL
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
                CREATE TABLE IF NOT EXISTS individual_clicks (
                    id SERIAL PRIMARY KEY,
                    is_authenticated BOOLEAN NOT NULL,
                    user_id INTEGER,
                    singleplayer_session_id INTEGER,
                    singleplayer_mode TEXT DEFAULT NULL,
                    command_index INTEGER DEFAULT NULL,
                    multiplayer_session_id INTEGER DEFAULT NULL,
                    multiplayer_is_challenge BOOLEAN DEFAULT FALSE,
                    multiplayer_is_classic_challenge BOOLEAN DEFAULT FALSE,
                    multiplayer_classic_challenge_id INTEGER DEFAULT NULL,
                    atlas TEXT NOT NULL,
                    blind_mode BOOLEAN NOT NULL DEFAULT FALSE,
                    region_id INTEGER,
                    clicked_x INTEGER DEFAULT NULL,
                    clicked_y INTEGER DEFAULT NULL,
                    clicked_z INTEGER DEFAULT NULL,
                    clicked_x_mm DOUBLE PRECISION DEFAULT NULL,
                    clicked_y_mm DOUBLE PRECISION DEFAULT NULL,
                    clicked_z_mm DOUBLE PRECISION DEFAULT NULL,
                    distance_to_target DOUBLE PRECISION DEFAULT NULL,
                    nearest_center_x_mm DOUBLE PRECISION DEFAULT NULL,
                    nearest_center_y_mm DOUBLE PRECISION DEFAULT NULL,
                    nearest_center_z_mm DOUBLE PRECISION DEFAULT NULL,
                    boundary_point_x_mm DOUBLE PRECISION DEFAULT NULL,
                    boundary_point_y_mm DOUBLE PRECISION DEFAULT NULL,
                    boundary_point_z_mm DOUBLE PRECISION DEFAULT NULL,
                    time_taken INTEGER NOT NULL,
                    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
                    score_increment INTEGER NOT NULL DEFAULT 0,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    has_clicked BOOLEAN NOT NULL DEFAULT TRUE
                );
            `;

            await sql`
                CREATE TABLE IF NOT EXISTS finished_sessions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
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
                    classic_challenge_end_date TIMESTAMP WITH TIME ZONE,
                    theoretical_maximum_score DECIMAL(8,2),
                    score_percentage DECIMAL(5,2),
                    send_classic_challenge_email BOOLEAN NOT NULL DEFAULT FALSE,
                    chat JSONB DEFAULT NULL
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
                    is_classic_challenge_original_entry BOOLEAN NOT NULL DEFAULT FALSE,
                    persistent_config TEXT DEFAULT NULL,
                    name TEXT DEFAULT NULL,
                    start_date TIMESTAMP WITH TIME ZONE,
                    end_date TIMESTAMP WITH TIME ZONE,
                    classic_challenge_referral INTEGER DEFAULT NULL,
                    total_duration INTEGER DEFAULT NULL,
                    atlas TEXT DEFAULT NULL

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
                ALTER TABLE multi_sessions 
                ADD COLUMN IF NOT EXISTS total_duration INTEGER DEFAULT NULL;
            `;

            await sql`
                ALTER TABLE multi_sessions 
                ADD COLUMN IF NOT EXISTS atlas TEXT DEFAULT NULL;
            `;

            await sql`
                ALTER TABLE multi_sessions 
                ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP WITH TIME ZONE;
            `;

            await sql`
                ALTER TABLE multi_sessions 
                ADD COLUMN IF NOT EXISTS show_as_next BOOLEAN NOT NULL DEFAULT TRUE;
            `;

            await sql`
                ALTER TABLE finished_sessions 
                ADD COLUMN IF NOT EXISTS blind_mode BOOLEAN NOT NULL DEFAULT FALSE;
            `;

            await sql`
                ALTER TABLE finished_sessions 
                ADD COLUMN IF NOT EXISTS send_classic_challenge_email BOOLEAN NOT NULL DEFAULT FALSE;
            `;

            await sql`
                ALTER TABLE finished_sessions 
                ADD COLUMN IF NOT EXISTS classic_challenge_id INTEGER;
            `;

            await sql`
                ALTER TABLE finished_sessions 
                ADD COLUMN IF NOT EXISTS blind_mode BOOLEAN NOT NULL DEFAULT FALSE;
            `;

            await sql`
                ALTER TABLE individual_clicks 
                ADD COLUMN IF NOT EXISTS has_clicked BOOLEAN NOT NULL DEFAULT TRUE;
            `;

            await sql`
                ALTER TABLE individual_clicks 
                ADD COLUMN IF NOT EXISTS region_id INTEGER;
            `;

            // Ensure region_id is nullable (in case it was created as NOT NULL before)
            await sql`
                ALTER TABLE individual_clicks 
                ALTER COLUMN region_id DROP NOT NULL;
            `;

        // Update old versions of the database schema
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin BOOLEAN NOT NULL default FALSE;`
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS clinical_trial_gender TEXT DEFAULT NULL;`
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS clinical_trial_age INTEGER DEFAULT NULL;`
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS clinical_trial_country TEXT DEFAULT NULL;`
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS clinical_trial_occupation TEXT DEFAULT NULL;`
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS clinical_trial_consent TEXT DEFAULT NULL;`
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS clinical_trial_consent_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL;`

            await sql`CREATE INDEX IF NOT EXISTS idx_users_clinical_trial_gender ON users(clinical_trial_gender);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_users_clinical_trial_country ON users(clinical_trial_country);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_users_clinical_trial_occupation ON users(clinical_trial_occupation);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_users_clinical_trial_consent ON users(clinical_trial_consent);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);`;

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
            await sql`
                ALTER TABLE multi_sessions 
                ADD COLUMN IF NOT EXISTS is_classic_challenge_original_entry BOOLEAN NOT NULL DEFAULT FALSE;
            `;
            await sql`CREATE INDEX IF NOT EXISTS idx_multi_sessions_is_classic_challenge ON multi_sessions(is_classic_challenge);`;
            await sql`CREATE INDEX IF NOT EXISTS idx_multi_sessions_is_classic_challenge_original_entry ON multi_sessions(is_classic_challenge_original_entry);`;

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

            await sql`
                ALTER TABLE finished_sessions 
                ADD COLUMN IF NOT EXISTS theoretical_maximum_score DECIMAL(8,2);
            `;

            await sql`
                ALTER TABLE finished_sessions 
                ADD COLUMN IF NOT EXISTS score_percentage DECIMAL(5,2);
            `;

            await sql`
                ALTER TABLE finished_sessions 
                ADD COLUMN IF NOT EXISTS chat JSONB DEFAULT NULL;
            `;
        });

            // News table
            await sql`
                CREATE TABLE IF NOT EXISTS news (
                    id SERIAL PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `;
            await sql`CREATE INDEX IF NOT EXISTS idx_news_active ON news(active, created_at DESC);`;

        // Allow NULL user_id for challenge metadata records
        await sql.begin(async sql => {
            await sql`
                ALTER TABLE finished_sessions 
                DROP CONSTRAINT IF EXISTS finished_sessions_user_id_fkey;
            `;
            
            await sql`
                ALTER TABLE finished_sessions 
                ALTER COLUMN user_id DROP NOT NULL;
            `;
            
            await sql`
                ALTER TABLE finished_sessions 
                ADD CONSTRAINT finished_sessions_user_id_fkey 
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
            `;
        });

        logger.info("Database schema initialized successfully.");
        if(config.addTestUser){
            const salt = await bcrypt.genSalt(Number(config.salt));
            const hashedPassword = await bcrypt.hash("test", salt);
            await sql`
                INSERT INTO users (username, firstname, lastname, email, password, verified, admin)
                VALUES ('test', 'Test', 'User', '', ${hashedPassword}, ${true}, ${false})
                ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, admin = EXCLUDED.admin
            `;
            const hashedPasswordAdmin = await bcrypt.hash("admin", salt);
            await sql`
                INSERT INTO users (username, firstname, lastname, email, password, verified, admin)
                VALUES ('admin', 'Admin', 'User', 'admin', ${hashedPasswordAdmin}, ${true}, ${true})
                ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, admin = EXCLUDED.admin
            `;
            logger.info("Test users added successfully.");
        }
    } catch (err) {
        logger.error("Error initializing database schema:", err);
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
        // Handle finished classic challenges: send emails and preserve challenge records
        const finishedChallengesUser = await sql`
            SELECT 
                ms.id, 
                ms.name, 
                ms.start_date, 
                ms.end_date, 
                ms.atlas,
                ms.creator_id,
                COUNT(fs.id) as participant_count
            FROM multi_sessions ms
            LEFT JOIN finished_sessions fs ON fs.classic_challenge_id = ms.id
            WHERE ms.is_classic_challenge = TRUE AND ms.is_classic_challenge_original_entry = FALSE
            AND ms.end_date < NOW()
            GROUP BY ms.id, ms.name, ms.start_date, ms.end_date, ms.atlas, ms.creator_id
        `;

        

        const finishedChallenges = await sql`
            SELECT 
                ms.id, 
                ms.name, 
                ms.start_date, 
                ms.end_date, 
                ms.atlas,
                ms.creator_id,
                COUNT(fs.id) as participant_count
            FROM multi_sessions ms
            LEFT JOIN finished_sessions fs ON fs.classic_challenge_id = ms.id
            WHERE ms.is_classic_challenge = TRUE AND ms.is_classic_challenge_original_entry = TRUE
            AND ms.end_date < NOW()
            GROUP BY ms.id, ms.name, ms.start_date, ms.end_date, ms.atlas, ms.creator_id
        `;

        for (const challenge of finishedChallenges) {
            try {
                // Send emails to participants who opted in
                await sendClassicChallengeResultsEmails(challenge.id);
                logger.info(`Sent challenge results emails for finished challenge ${challenge.id} (${challenge.name})`);
            } catch (emailError) {
                logger.error(`Error sending emails for challenge ${challenge.id}:`, emailError);
            }

            // If no participants, create a metadata record to preserve the challenge trace
            if (challenge.participant_count === 0) {
                try {
                    await sql`
                        INSERT INTO finished_sessions (
                            user_id,
                            mode,
                            atlas,
                            score,
                            duration,
                            name,
                            classic_challenge_id,
                            classic_challenge_start_date,
                            classic_challenge_end_date,
                            quit_reason
                        ) VALUES (
                            NULL,
                            'classic_challenge',
                            ${challenge.atlas || 'unknown'},
                            0,
                            0,
                            ${challenge.name},
                            ${challenge.id},
                            ${challenge.start_date},
                            ${challenge.end_date},
                            'no_participants'
                        )
                    `;
                    logger.info(`Created metadata record for challenge ${challenge.id} with no participants`);
                } catch (insertError) {
                    logger.error(`Error creating metadata record for challenge ${challenge.id}:`, insertError);
                }
            }

            try {
                await sql`
                    DELETE FROM multi_sessions WHERE id = ${challenge.id}
                `;
                logger.info(`Deleted multi_session record for challenge ${challenge.id}`);
            } catch (deleteError) {
                logger.error(`Error deleting multi_session record for challenge ${challenge.id}:`, deleteError);
            }
        }

        // Delete from multisessions older than 1 hour (non-challenge sessions only)
        const resultMultiSessions = await sql`
            DELETE FROM multi_sessions
            WHERE created_at <= NOW() - INTERVAL '1 hour'
            AND is_challenge = FALSE
            AND is_classic_challenge = FALSE
            AND is_classic_challenge_original_entry = FALSE
        `;
        if (resultMultiSessions.count !== 0) {
            logger.info(`Cleaned up ${resultMultiSessions.count} old multi_sessions.`);
        }
    } catch (err) {
        logger.error("Error cleaning old game sessions:", (err instanceof Error ? err.message : err));
    }
}
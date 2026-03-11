import { sql } from "./database_init.ts";
import type { Response } from "express";
import type { GetLeaderboardRequest, GetMostUsedAtlasRequest } from "../interfaces/requests.interfaces.ts";
import { logger } from "./logging.ts";

interface LeaderboardEntry {
    username: string; 
    mode: string; 
    best_score: number;
    atlas: string;
    blind_mode?: boolean | null;
}

export const getLeaderboard = async (req: GetLeaderboardRequest, res: Response): Promise<void> => {
    try {
        const { mode, atlas, numberLimit = 10, timeLimit = 7, blindMode = null } = req.body;
        
        const innerQuery = sql`
            SELECT
                user_id,
                mode,
                atlas,
                blind_mode,
                CASE 
                    WHEN mode = 'multiplayer' THEN MAX(score_percentage)
                    ELSE MAX(score)
                END AS best_score
            FROM finished_sessions
            WHERE 1=1
                ${mode ? sql` AND mode = ${mode}` : sql``}
                ${atlas ? sql` AND atlas = ${atlas}` : sql``}
                ${timeLimit ? sql` AND NOW() - created_at <= ${`'${timeLimit} days'`}` : sql``}
                ${blindMode !== null ? sql` AND blind_mode = ${blindMode}` : sql``}
                AND (mode != 'multiplayer' OR (theoretical_maximum_score IS NOT NULL AND theoretical_maximum_score > 0))
            GROUP BY user_id, mode, atlas, blind_mode
        `;

        // Execute query to get leaderboard
        const leaderboard = await sql`
            SELECT
                u.username,
                fs.mode AS mode,
                fs.atlas AS atlas,
                fs.blind_mode AS blind_mode,
                fs.best_score AS best_score
            FROM (${innerQuery}) fs
            JOIN users u ON fs.user_id = u.id
            WHERE u.publish_to_leaderboard = TRUE
            ORDER BY best_score DESC
            LIMIT ${numberLimit}
        ` as LeaderboardEntry[];

        res.status(200).json({ leaderboard });
    }  catch (error) {
        logger.error("Error getting leaderboard:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
}


// Add this interface
interface AtlasUsage {
    atlas: string;
    count: number;
}

// Add this new function
export const getMostUsedAtlases = async (req: GetMostUsedAtlasRequest, res: Response): Promise<void> => {
    try {
        // Query to get the most used atlases
        const atlasResults = await sql`
            SELECT 
                atlas,
                COUNT(DISTINCT user_id) as count
            FROM finished_sessions
            WHERE atlas IS NOT NULL AND atlas != ''
            GROUP BY atlas
            ORDER BY count DESC
        ` as {atlas: string, count: number}[];
        
        // Create a manually formatted result
        const atlases: AtlasUsage[] = atlasResults.map(row => ({
            atlas: row.atlas,
            count: row.count
        }));
        
        res.status(200).json({
            success: true,
            atlases
        });
    } catch (error) {
        logger.error('Error fetching most used atlases:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching most used atlases'
        });
    }
};
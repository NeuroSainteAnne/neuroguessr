import { sql } from "./database_init.ts";
import type { Response } from "express";
import type { GameProgress, GameSession } from "../interfaces/database.interfaces.ts";
import type { GetLeaderboardRequest, GetMostUsedAtlasRequest } from "../interfaces/requests.interfaces.ts";
import type { Config } from "../interfaces/config.interfaces.ts";
import configJson from '../config.json' with { type: "json" };
const config: Config = configJson;

interface LeaderboardEntry {
    username: string; 
    mode: string; 
    best_score: number;
    atlas: string;
}

function getSummedLeaderboard(leaderboard: LeaderboardEntry[]) {
    const summed: Record<string, LeaderboardEntry> = {};

    leaderboard.forEach(entry => {
        const key = `${entry.username}||${entry.mode}`;
        if (!summed[key]) {
            summed[key] = { username: entry.username, mode: entry.mode, best_score: 0, atlas: "total" };
        }
        summed[key].best_score += entry.best_score;
    });

    // Convert to array and sort by best_score descending
    return Object.values(summed).sort((a, b) => b.best_score - a.best_score);
}

export const getLeaderboard = async (req: GetLeaderboardRequest, res: Response): Promise<void> => {
    try {
        const { mode, atlas, appendTotal = true, numberLimit = 10, timeLimit = 7 } = req.body;

        const innerQuery = sql`
            SELECT
                user_id,
                mode,
                atlas,
                MAX(score) AS best_score
            FROM finished_sessions
            WHERE 1=1
                ${mode ? sql` AND mode = ${mode}` : sql` AND mode != ${'multiplayer'}`}
                ${timeLimit ? sql` AND NOW() - created_at <= ${`'${timeLimit} days'`}` : sql``}
            GROUP BY user_id, mode, atlas
        `;

        // Execute query to get leaderboard
        let leaderboard = await sql`
            SELECT
                u.username,
                fs.mode AS mode,
                fs.atlas AS atlas,
                fs.best_score AS best_score
            FROM (${innerQuery}) fs
            JOIN users u ON fs.user_id = u.id
            WHERE u.publish_to_leaderboard = TRUE
            ORDER BY best_score DESC
            LIMIT ${numberLimit}
        ` as LeaderboardEntry[];

        const summedLeaderboard = (appendTotal || atlas == "total") ? getSummedLeaderboard(leaderboard) : [];
        if (atlas == "total") {
            leaderboard = [];
        } else if (atlas) {
            leaderboard = leaderboard.filter(entry => entry.atlas === atlas);
        }
        leaderboard = leaderboard.concat(summedLeaderboard);
        res.status(200).json({ leaderboard });
    }  catch (error) {
        console.error("Error getting leaderboard:", error);
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
        
        // Add 'total' atlas as first option (for combined scores)
        const result = [
            ...atlases
        ];
        
        res.status(200).json({
            success: true,
            atlases: result
        });
    } catch (error) {
        console.error('Error fetching most used atlases:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching most used atlases'
        });
    }
};
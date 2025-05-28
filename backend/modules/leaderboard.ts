import { db } from "./database_init.ts";
import type { Response } from "express";
import type { GameProgress, GameSession } from "../interfaces/database.interfaces.ts";
import type { GetLeaderboardRequest } from "../interfaces/requests.interfaces.ts";
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
        let innerWhere = '';
        const params: any[] = [];

        if (mode) {
            innerWhere += ' AND mode = ?';
            params.push(mode);
        }
        if (timeLimit) {
            const now = Date.now();
            const msInDay = 24 * 60 * 60 * 1000;
            const minTimestamp = now - (Number(timeLimit) * msInDay);
            innerWhere += ' AND createdAt >= ?';
            params.push(minTimestamp);
        }
        const query = `
            SELECT
                u.username,
                fs.mode AS mode,
                fs.atlas AS atlas,
                fs.best_score AS best_score
            FROM (
                SELECT
                    userId,
                    mode,
                    atlas,
                    MAX(score) AS best_score
                FROM finishedsessions
                WHERE 1=1 ${innerWhere}
                GROUP BY userId, mode, atlas
            ) fs
            JOIN users u ON fs.userId = u.id
            WHERE u.publishToLeaderboard = 1
            GROUP BY fs.userId, fs.mode, fs.atlas
            ORDER BY best_score DESC
            LIMIT ?
        `;
        params.push(numberLimit);

        const stmt = db.prepare(query);
        let leaderboard = stmt.all(...params) as LeaderboardEntry[];
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
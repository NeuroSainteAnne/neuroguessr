// stats_api.ts
import pkg from 'express';
const { Request, Response, NextFunction } = pkg;
import { db } from './database_init.ts'; // Import your database instance

interface BestScoreRow {
    id: number;
    userId: number;
    mode: string;
    atlas: string;
    score: number;
    accuracy: number;
    duration: number;
    createdAt: string; // SQLite stores DATETIME as TEXT
}

export const getBestScores = (req: Request, res: Response) => {
    const userId = req.userId; // userId is attached by authenticateToken middleware

    if (!userId) {
        // This case should ideally not be hit if authenticateToken works correctly
        return res.status(401).json({ message: "Authentication required." });
    }

    const query = `
        SELECT
            id,
            userId,
            mode,
            atlas,
            score,
            accuracy,
            duration,
            createdAt
        FROM
            finishedsessions
        WHERE
            userId = ? AND
            (mode, atlas, score) IN (
                SELECT
                    mode,
                    atlas,
                    MAX(score)
                FROM
                    finishedsessions
                WHERE
                    userId = ?
                GROUP BY
                    mode,
                    atlas
            )
        ORDER BY
            mode, atlas;
    `;

    try {
        // *** CRITICAL CHANGE HERE ***
        // Use db.prepare() to create a statement, then .all() to run it
        const stmt = db.prepare(query);
        const rows: BestScoreRow[] = stmt.all(userId, userId) as BestScoreRow[]; // .all() is synchronous

        // If no scores found, rows will be an empty array, which is fine
        res.json(rows);
    } catch (err: any) {
        console.error('Error fetching best scores for user', userId, ':', err.message);
        return res.status(500).json({ message: "Error fetching best scores", error: err.message });
    }
};
import pkg from 'express';
const { Request, Response } = pkg; // Destructure Request and Response types
import { db } from './database_init.ts'; // Import your database instance

// Interface to define the structure of a row returned from the finishedsessions table
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

/**
 * API endpoint to retrieve the best scores for the authenticated user.
 * It fetches the highest score for each unique mode and atlas combination.
 * @param req The Express request object (with userId attached by authenticateToken).
 * @param res The Express response object.
 */
export const getBestScores = (req: Request, res: Response) => {
    // userId is attached to the request object by the authenticateToken middleware
    const userId = req.userId;

    // If userId is not present (should ideally not happen if middleware works), return 401
    if (!userId) {
        console.error("Error: userId is missing in getBestScores. Authentication token might be invalid or missing user ID.");
        return res.status(401).json({ message: "Authentication required or user ID missing from token." });
    }

    // SQL query to get the best score (highest score) for each mode and atlas
    // for the authenticated user.
    // The subquery finds the maximum score for each mode/atlas pair for the user.
    // The outer query then selects the full row(s) that match these max scores.
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
            mode, atlas; -- Optional: orders results for consistent display
    `;

    try {
        // Use better-sqlite3's synchronous API:
        // 1. Prepare the SQL statement.
        const stmt = db.prepare(query);
        // 2. Execute the statement with parameters and get all matching rows.
        //    The .all() method on a prepared statement returns an array of rows directly.
        const rows: BestScoreRow[] = stmt.all(userId, userId) as BestScoreRow[];

        // Send the fetched rows as a JSON response.
        // If no scores are found, 'rows' will be an empty array, which is a valid response.
        res.json(rows);
    } catch (err: any) {
        // Catch any errors that occur during the database operation
        console.error('Error fetching best scores for user', userId, ':', err.message);
        // Return a 500 Internal Server Error with a descriptive message
        return res.status(500).json({ message: "Error fetching best scores from database", error: err.message });
    }
};

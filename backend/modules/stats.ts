import Database from 'better-sqlite3';
import path from 'path';
import { db } from "./database_init.ts";
import type { AuthenticatedRequest, GetStatsRequest } from '../interfaces/requests.interfaces.ts';
import type { Request, Response } from "express";
import { FinishedSession } from 'interfaces/database.interfaces.ts';

export const getUserStats = async (req: GetStatsRequest, res: Response): Promise<void> => {
    try {
        const userId: number = (req as AuthenticatedRequest).user.id;
        const firstGame = (db.prepare('SELECT MIN(createdAt) as first FROM finishedsessions WHERE userId = ?').get(userId) as { first: number | null }).first;
        const lastGame = (db.prepare('SELECT MAX(createdAt) as last FROM finishedsessions WHERE userId = ?').get(userId) as { last: number | null }).last;
        const totalCorrect = (db.prepare('SELECT SUM(correct) as total FROM finishedsessions WHERE userId = ?').get(userId) as { total: number | null }).total || 0;
        const totalIncorrect = (db.prepare('SELECT SUM(incorrect) as total FROM finishedsessions WHERE userId = ?').get(userId) as { total: number | null }).total || 0;
        const totalGames = (db.prepare('SELECT COUNT(*) as count FROM finishedsessions WHERE userId = ?').get(userId) as { count: number }).count;
        const avgScore = (db.prepare('SELECT AVG(score) as avg FROM finishedsessions WHERE userId = ?').get(userId) as { avg: number }).avg || 0;
        const bestScore = (db.prepare('SELECT MAX(score) as max FROM finishedsessions WHERE userId = ?').get(userId) as { max: number }).max || 0;
        const avgDuration = (db.prepare('SELECT AVG(duration) as avg FROM finishedsessions WHERE userId = ?').get(userId) as { avg: number }).avg || 0;
        const quitReasons = db.prepare(
            'SELECT quitReason, COUNT(*) as count FROM finishedsessions WHERE userId = ? GROUP BY quitReason'
        ).all(userId).reduce((acc: Record<string, number>, row: any) => {
            acc[row.quitReason || 'unknown'] = row.count;
            return acc;
        }, {});
        const avgTimePerRegion = (db.prepare('SELECT AVG(avgTimePerRegion) as avg FROM finishedsessions WHERE userId = ?').get(userId) as { avg: number | null }).avg || 0;
        const minTimePerRegion = (db.prepare('SELECT MIN(minTimePerRegion) as min FROM finishedsessions WHERE userId = ?').get(userId) as { min: number | null }).min || 0;
        const maxTimePerRegion = (db.prepare('SELECT MAX(maxTimePerRegion) as max FROM finishedsessions WHERE userId = ?').get(userId) as { max: number | null }).max || 0;
        const avgTimePerCorrectRegion = (db.prepare('SELECT AVG(avgTimePerCorrectRegion) as avg FROM finishedsessions WHERE userId = ?').get(userId) as { avg: number | null }).avg || 0;
        const minTimePerCorrectRegion = (db.prepare('SELECT MIN(minTimePerCorrectRegion) as min FROM finishedsessions WHERE userId = ?').get(userId) as { min: number | null }).min || 0;
        const maxTimePerCorrectRegion = (db.prepare('SELECT MAX(maxTimePerCorrectRegion) as max FROM finishedsessions WHERE userId = ?').get(userId) as { max: number | null }).max || 0;

        const mostPlayedModeRow = db.prepare(
            'SELECT mode, COUNT(*) as count FROM finishedsessions WHERE userId = ? GROUP BY mode ORDER BY count DESC LIMIT 1'
        ).get(userId) as { mode?: string, count?: number } | undefined;
        const mostPlayedMode = mostPlayedModeRow?.mode || null;

        const mostPlayedAtlasRow = db.prepare(
            'SELECT atlas, COUNT(*) as count FROM finishedsessions WHERE userId = ? GROUP BY atlas ORDER BY count DESC LIMIT 1'
        ).get(userId) as { atlas?: string, count?: number } | undefined;
        const mostPlayedAtlas = mostPlayedAtlasRow?.atlas || null;

        const sessions = db.prepare('SELECT * FROM finishedsessions WHERE userId = ? ORDER BY createdAt ASC')
            .all(userId) as FinishedSession[];

        // Per-mode stats
        const perModeArr = db.prepare(
            `SELECT mode, COUNT(*) as games, AVG(score) as avgScore, MAX(score) as bestScore, AVG(duration) as avgDuration
        FROM finishedsessions WHERE userId = ? GROUP BY mode`
        ).all(userId)
        const perMode: Record<string, any> = {};
        perModeArr.forEach((row: any) => {
            let runningMax = 0;
            const modeSessions = sessions.filter(s => s.mode === row.mode);
            const progression = modeSessions.map(session => {
                runningMax = Math.max(runningMax, session.score);
                const base = {
                    date: new Date(session.createdAt).toISOString(),
                    score: session.score,
                    maxScore: runningMax
                };
                if (row.mode === "time-attack") {
                    const total = (session.correct && session.incorrect) ? session.correct + session.incorrect : null;
                    const errorRate = (total && total > 0 && session.incorrect) ? session.incorrect / total : null;
                    return { ...base, errorRate, avgTimePerRegion: session.avgTimePerRegion };
                } else if (row.mode === "streak") {
                    return { ...base, avgTimePerRegion: session.avgTimePerRegion, bestStreak: session.attempts };
                } else {
                    return base;
                }
            });
            perMode[row.mode] = {
                games: row.games,
                avgScore: row.avgScore || 0,
                bestScore: row.bestScore || 0,
                avgDuration: row.avgDuration || 0,
                progression
            };
        });

        res.status(200).send({
            totalGames,
            avgScore,
            bestScore,
            avgDuration,
            perMode,
            firstGame: new Date(firstGame || 0).toISOString(),
            lastGame: new Date(lastGame || 0).toISOString(),
            totalCorrect,
            totalIncorrect,
            quitReasons,
            avgTimePerRegion,
            minTimePerRegion,
            maxTimePerRegion,
            avgTimePerCorrectRegion,
            minTimePerCorrectRegion,
            maxTimePerCorrectRegion,
            mostPlayedMode,
            mostPlayedAtlas,
            sessions
        });
    } catch (error) {
        console.error("Error getting stats:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
}

import Database from 'better-sqlite3';
import path from 'path';
import { sql } from "./database_init.ts";
import type { AuthenticatedRequest, GetStatsRequest } from '../interfaces/requests.interfaces.ts';
import type { Request, Response } from "express";
import { FinishedSession, FinishedSessionCamelCase } from 'interfaces/database.interfaces.ts';
import { transformKeysSnakeToCamel } from "../middlewares/case-transformer.ts";

export const getUserStats = async (req: GetStatsRequest, res: Response): Promise<void> => {
    try {
        const userId: number = (req as AuthenticatedRequest).user.id;
        const statsResult = await sql`
            SELECT 
                MIN(created_at) as first_game,
                MAX(created_at) as last_game,
                SUM(correct) as total_correct,
                SUM(incorrect) as total_incorrect,
                COUNT(*) as total_games,
                AVG(score) as avg_score,
                MAX(score) as best_score,
                AVG(duration) as avg_duration,
                AVG(avg_time_per_region) as avg_time_per_region,
                MIN(min_time_per_region) as min_time_per_region,
                MAX(max_time_per_region) as max_time_per_region,
                AVG(avg_time_per_correct_region) as avg_time_per_correct_region,
                MIN(min_time_per_correct_region) as min_time_per_correct_region,
                MAX(max_time_per_correct_region) as max_time_per_correct_region
            FROM finished_sessions
            WHERE user_id = ${userId}
        `;
        const stats = statsResult[0];
        const firstGame = stats?.first_game || null;
        const lastGame = stats?.last_game || null;
        const totalCorrect = Number(stats?.total_correct) || 0;
        const totalIncorrect = Number(stats?.total_incorrect) || 0;
        const totalGames = Number(stats?.total_games) || 0;
        const avgScore = Number(stats?.avg_score) || 0;
        const bestScore = Number(stats?.best_score) || 0;
        const avgDuration = Number(stats?.avg_duration) || 0;
        const avgTimePerRegion = Number(stats?.avg_time_per_region) || 0;
        const minTimePerRegion = Number(stats?.min_time_per_region) || 0;
        const maxTimePerRegion = Number(stats?.max_time_per_region) || 0;
        const avgTimePerCorrectRegion = Number(stats?.avg_time_per_correct_region) || 0;
        const minTimePerCorrectRegion = Number(stats?.min_time_per_correct_region) || 0;
        const maxTimePerCorrectRegion = Number(stats?.max_time_per_correct_region) || 0;

        const quitReasonsResult = await sql`
            SELECT quit_reason, COUNT(*) as count 
            FROM finished_sessions 
            WHERE user_id = ${userId} 
            GROUP BY quit_reason
        `;
        const quitReasons = quitReasonsResult.reduce((acc: Record<string, number>, row: any) => {
            acc[row.quit_reason || 'unknown'] = Number(row.count);
            return acc;
        }, {});

        // Get most played mode
        const mostPlayedModeResult = await sql`
            SELECT mode, COUNT(*) as count 
            FROM finished_sessions 
            WHERE user_id = ${userId} 
            GROUP BY mode 
            ORDER BY count DESC 
            LIMIT 1
        `;
        const mostPlayedMode = mostPlayedModeResult[0]?.mode || null;

        // Get most played atlas
        const mostPlayedAtlasResult = await sql`
            SELECT atlas, COUNT(*) as count 
            FROM finished_sessions 
            WHERE user_id = ${userId} 
            GROUP BY atlas 
            ORDER BY count DESC 
            LIMIT 1
        `;
        const mostPlayedAtlas = mostPlayedAtlasResult[0]?.atlas || null;

        // Get all sessions
        const sessionsResult = await sql`
            SELECT * 
            FROM finished_sessions 
            WHERE user_id = ${userId} 
            ORDER BY created_at ASC
        ` as FinishedSession[];
        const sessions = transformKeysSnakeToCamel(sessionsResult) as FinishedSessionCamelCase[];;
        
        // Per-mode stats
        const perModeArrResult = await sql`
            SELECT 
                mode, 
                COUNT(*) as games, 
                AVG(score) as avg_score, 
                MAX(score) as best_score, 
                AVG(duration) as avg_duration
            FROM finished_sessions 
            WHERE user_id = ${userId} 
            GROUP BY mode
        `;

        // Transform to camelCase
        const perModeArrTransformed = transformKeysSnakeToCamel(perModeArrResult);
        const perMode: Record<string, any> = {};

        for (const row of perModeArrTransformed) {
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
                games: Number(row.games),
                avgScore: Number(row.avgScore) || 0,
                bestScore: Number(row.bestScore) || 0,
                avgDuration: Number(row.avgDuration) || 0,
                progression
            };
        }

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

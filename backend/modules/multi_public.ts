import type { Request, Response } from "express";
import { logger } from "./logging.ts";
import { sql } from "./database_init.ts";
import { games, DELAY_FOR_CHALLENGES_IN_PUBLIC, playerInfo } from "./multi.ts";
import { getIO } from "./socket.io.ts";

// Public lobbies list handler

export const getPublicLobbies = async (req: Request, res: Response) => {
  try {
    const lobbies = await buildPublicLobbies();
    res.status(200).json({ lobbies });
  } catch (e) {
    logger.error("getPublicLobbies error", e);
    res.status(500).json({ lobbies: [] });
  }
};


// Helper to build current public lobbies list (shared by HTTP and sockets)
export async function buildPublicLobbies() {
  const rows = await sql`
      SELECT ms.session_code, ms.created_at, u.username AS creator_name
      FROM multi_sessions ms
      LEFT JOIN users u ON u.id = ms.creator_id
      WHERE ms.public = TRUE
      ORDER BY ms.created_at DESC
      LIMIT 50
    ` as Array<{ session_code: number, created_at: Date, creator_name: string | null }>;

  const lobbies = rows.map(r => {
    const codeStr = String(r.session_code).padStart(8, '0');
    const gameRef = games[codeStr];
    if (!gameRef || (gameRef.hasStarted && gameRef.hasFinishedCountdown)) return undefined;
    
    // Hide challenges whose startTime is more than 5 minutes in the future
    if (gameRef.isChallenge && gameRef.commands && gameRef.commands.length > 0) {
      const countdownCommand = gameRef.commands.find(cmd => cmd.action === "countdown" && cmd.startTime);
      if (countdownCommand && countdownCommand.startTime) {
        const startTime = new Date(countdownCommand.startTime);
        const now = new Date();
        const timeDiff = startTime.getTime() - now.getTime();
        if (timeDiff > DELAY_FOR_CHALLENGES_IN_PUBLIC) {
          return undefined;
        }
      }
    }
    
    const users = Object.values(playerInfo).filter(p => p.sessionCode === codeStr).length;
    const totalDuration = gameRef.parameters?.totalDuration ?? (gameRef.commands ? gameRef.commands.reduce((acc, c) => acc + (c.duration || 0), 0) : undefined);
    return {
      sessionCode: codeStr,
      atlas: gameRef.parameters?.atlas,
      totalDuration,
      users,
      createdAt: r.created_at?.toISOString?.() || undefined,
      blindMode: !!gameRef.parameters?.blindMode,
      creator: r.creator_name || '—'
    };
  }).filter((x): x is NonNullable<typeof x> => x !== undefined);
  return lobbies;
}

export async function emitPublicLobbiesUpdate() {
  try {
    const io = getIO();
    const lobbies = await buildPublicLobbies();
    io.to('public-lobbies').emit('public-lobbies-update', { lobbies });
  } catch (e) {
    // no-op
  }
}
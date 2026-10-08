import type { Request, Response } from "express";
import { User } from "interfaces/database.interfaces.ts";
import type { AuthenticatedRequest } from "interfaces/requests.interfaces.ts";
import jwt from "jsonwebtoken";
import { sql } from "./database_init.ts";
import { logger } from "./logging.ts";
import { broadcastToSession, config, emitToUser, games, sendNextCommand, updateGameActivity } from "./multi.ts";
import { MultiplayerGame, PersistentGameState, Recurrence } from "interfaces/multi.interfaces.ts";
import { calculateNextStartTime } from "./multi_recurrence.ts";
import { scheduleBotJoinRealtime } from "./multi_bot.ts";

// Get next upcoming public realtime challenge

export const getNextRealtimeChallenge = async (req: Request, res: Response) => {
  try {
    const currentTime = new Date().toISOString();

    const result = await sql`
      SELECT ms.session_code, ms.created_at, ms.persistent_config, ms.name, u.username AS creator_name
      FROM multi_sessions ms
      LEFT JOIN users u ON u.id = ms.creator_id
      WHERE ms.is_challenge = TRUE
      AND ms.public = TRUE
      AND ms.persistent_config IS NOT NULL
      AND ms.show_as_next = TRUE
      AND (ms.persistent_config::jsonb->'commands'->0->>'startTime') > ${currentTime}
      ORDER BY (ms.persistent_config::jsonb->'commands'->0->>'startTime') ASC
      LIMIT 1
    ` as Array<{
      session_code: string;
      created_at: Date;
      persistent_config: string;
      name: string | null;
      creator_name: string | null;
    }>;

    if (result.length === 0) {
      return res.status(200).json({ challenge: null, message: 'No upcoming realtime challenges found' });
    }

    const session = result[0];
    const sessionCode = String(session.session_code).padStart(8, '0');

    try {
      const persistentState = JSON.parse(session.persistent_config);
      const startTime = persistentState.commands?.[0]?.startTime;

      const realtimeChallenge = {
        sessionCode,
        startTime,
        atlas: persistentState.parameters?.atlas,
        totalDuration: persistentState.parameters?.totalDuration,
        name: session.name || undefined,
        creator: session.creator_name || 'Unknown',
        createdAt: session.created_at?.toISOString?.() || undefined
      };

      res.status(200).json({ challenge: realtimeChallenge });
    } catch (parseError) {
      logger.error("Error parsing persistent config for next realtime challenge:", parseError);
      res.status(500).json({ error: 'Error parsing realtime challenge data' });
    }

  } catch (error) {
    logger.error("getNextRealtimeChallenge error", error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllRealtimeChallenges = async (req: Request, res: Response) => {
  try {
    const currentTime = new Date().toISOString();

    // Check if user is authenticated and admin
    const authHeader: string | undefined = req.headers['authorization'] as string | undefined;
    const token: string | undefined = authHeader && authHeader.split(' ')[1];
    let isAdmin = false;
    let userId = null;
    if (token) {
      jwt.verify(token, config.jwt_secret, (err: any, decoded: unknown) => {
        if (!err) {
          isAdmin = (decoded as User).admin || false;
          userId = (decoded as User).id || null;
        }
      });
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, config.jwt_secret) as any;
        userId = decoded.id;
        isAdmin = decoded.admin || false;
      } catch (jwtError) {
        // Token is invalid, continue as guest
        logger.warn("Invalid token in getAllRealtimeChallenges:", jwtError);
      }
    }

    // Build query based on user permissions
    let query;
    if (isAdmin) {
      // Admin can see all realtime challenges (public and private)
      query = sql`
        SELECT ms.session_code, ms.created_at, ms.persistent_config, ms.public, ms.name, u.username AS creator_name
        FROM multi_sessions ms
        LEFT JOIN users u ON u.id = ms.creator_id
        WHERE ms.is_challenge = TRUE 
        AND ms.persistent_config IS NOT NULL
        ORDER BY (ms.persistent_config::jsonb->'commands'->0->>'startTime') ASC
      `;
    } else {
      // Non-admin users can only see public realtime challenges
      query = sql`
        SELECT ms.session_code, ms.created_at, ms.persistent_config, ms.public, ms.name, u.username AS creator_name
        FROM multi_sessions ms
        LEFT JOIN users u ON u.id = ms.creator_id
        WHERE ms.is_challenge = TRUE 
        AND ms.public = TRUE
        AND ms.persistent_config IS NOT NULL
        ORDER BY (ms.persistent_config::jsonb->'commands'->0->>'startTime') ASC
      `;
    }

    const result = await query;

    const realtimeChallenges = [];

    for (const session of result) {
      const sessionCode = String(session.session_code).padStart(8, '0');

      try {
        const persistentState = JSON.parse(session.persistent_config);
        const startTime = persistentState.commands?.[0]?.startTime;

        const realtimeChallenge = {
          sessionCode,
          startTime,
          isPublic: session.public,
          atlas: persistentState.parameters?.atlas,
          totalDuration: persistentState.parameters?.totalDuration,
          name: session.name || undefined,
          recurrence: session.recurrence || undefined,
          creator: session.creator_name || 'Unknown',
          createdAt: session.created_at?.toISOString?.() || undefined
        };

        realtimeChallenges.push(realtimeChallenge);
      } catch (parseError) {
        logger.error(`Error parsing persistent config for session ${session.session_code}:`, parseError);
        // Skip this challenge if parsing fails
        continue;
      }
    }

    res.status(200).json({
      challenges: realtimeChallenges,
      userPermissions: {
        isAdmin,
        canSeePrivate: isAdmin
      }
    });

  } catch (error) {
    logger.error("getAllRealtimeChallenges error", error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteRealtimeChallenge = async (req: Request, res: Response) => {
  try {
    const { sessionCode } = req.params;
    const userId: number = (req as AuthenticatedRequest).user.id;
    const isAdmin: boolean = (req as AuthenticatedRequest).user.admin;

    if (!isAdmin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    if (!sessionCode || !/^\d{8}$/.test(sessionCode)) {
      res.status(400).json({ error: 'Invalid session code format' });
      return;
    }

    // Delete the challenge session from database
    const result = await sql`
      DELETE FROM multi_sessions 
      WHERE session_code = ${sessionCode}
      AND is_challenge = TRUE
    `;

    if (result.count === 0) {
      res.status(404).json({ error: 'Realtime challenge not found' });
      return;
    }

    // Also remove from active games if it's running
    if (games[sessionCode]) {
      delete games[sessionCode];
      logger.info(`Removed active realtime challenge session ${sessionCode} from memory`);
    }

    logger.info(`Admin ${userId} deleted realtime challenge session ${sessionCode}`);
    res.status(200).json({ message: 'Realtime challenge deleted successfully' });

  } catch (error) {
    logger.error("deleteRealtimeChallenge error", error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const handleSaveAsRealtimeChallenge = async ({ sessionCode, sessionToken, userToken, userName, name, recurrent }: { sessionCode: string; sessionToken: string; userToken: string; userName: string; name?: string; recurrent?: Recurrence; }) => {
  try {
    if (!sessionCode || typeof sessionCode !== 'string' || sessionCode.length !== 8) {
      emitToUser(sessionCode, userName, "error", { message: "Invalid session code" });
      return;
    }

    // Validate that this is a challenge session
    const gameRef = games[sessionCode];
    if (!gameRef) {
      emitToUser(sessionCode, userName, "error", { message: "Game does not exist" });
      return;
    }

    gameRef.commands = gameRef.parameters.commands;

    if (!gameRef.commands || gameRef.commands.length === 0) {
      emitToUser(sessionCode, userName, "error", { message: "Game with custom commands is required" });
      return;
    }

    if (!gameRef.commands[0] || gameRef.commands[0].action !== "countdown" || !gameRef.commands[0].startTime) {
      emitToUser(sessionCode, userName, "error", { message: "Programmed Start Time is required" });
      return;
    }

    if (gameRef.hasStarted) {
      emitToUser(sessionCode, userName, "error", { message: "Game has already started" });
      return;
    }

    // Verify user is admin
    if (!userToken) {
      emitToUser(sessionCode, userName, "error", { message: "Authentication token required" });
      return;
    }

    try {
      const jwtPayload: any = jwt.verify(userToken, config.jwt_secret);
      if (!jwtPayload || !jwtPayload.admin) {
        emitToUser(sessionCode, userName, "error", { message: "Admin privileges required for realtime challenge mode" });
        return;
      }
    } catch (err) {
      emitToUser(sessionCode, userName, "error", { message: "Invalid authentication token" });
      return;
    }

    // Validate session token
    const sessionResult = await sql`
      SELECT session_token FROM multi_sessions WHERE session_code = ${sessionCode}
    ` as { session_token: string; }[];

    if (sessionResult.length === 0 || sessionResult[0].session_token !== sessionToken) {
      emitToUser(sessionCode, userName, "error", { message: "Invalid session token" });
      return;
    }

    if (recurrent) {
      if (recurrent.type != "hour" && recurrent.type != "day" && recurrent.type != "week" && recurrent.type != "month" && recurrent.type != "year") {
        emitToUser(sessionCode, userName, "error", { message: "Invalid recurrence type" });
        return;
      } else if (!(recurrent.interval > 0)) {
        emitToUser(sessionCode, userName, "error", { message: "Invalid recurrence interval" });
        return;
      }
    }

    // Activate challenge mode and update game state
    gameRef.isChallenge = true;
    gameRef.hasStarted = true;
    gameRef.totalGuessNumber = gameRef.commands?.filter(command => command.action === "guess").length || 0;
    gameRef.duration = Date.now();
    gameRef.lastActivity = Date.now();
    gameRef.name = name || undefined;
    gameRef.parameters.recurrence = recurrent || undefined;

    // Extract and save the persistent game state
    const persistentState = extractPersistentState(gameRef);
    await sql`
      UPDATE multi_sessions 
      SET persistent_config = ${JSON.stringify(persistentState)},
      is_challenge = TRUE, name = ${gameRef.name || sql`NULL`}
      WHERE session_code = ${sessionCode}
    `;

    logger.info(`Realtime challenge configuration saved for session ${sessionCode}`);
    updateGameActivity(sessionCode);

    // Broadcast game preparation to all users
    broadcastToSession(sessionCode, 'realtime-challenge-prepared', {
      message: 'Realtime challenge has been prepared and will start at the scheduled time'
    });

    // Start the first command (countdown with startTime)
    sendNextCommand(gameRef);

    // Schedule bot join just before game start (test environment)
    const startTimeIso = gameRef.commands[0].startTime;
    if (startTimeIso) {
      scheduleBotJoinRealtime(sessionCode, startTimeIso);
    }

    emitToUser(sessionCode, userName, "save-as-realtime-challenge", { message: "success" });
  } catch (error) {
    logger.error("saveRealtimeChallengeConfig error", error);
    emitToUser(sessionCode, userName, "error", { message: "Internal server error" });
  }
};
// Helper function to extract persistent state from gameRef

export function extractPersistentState(gameRef: MultiplayerGame): PersistentGameState {
  return {
    id: gameRef.id,
    sessionCode: gameRef.sessionCode,
    originalSessionCode: gameRef.sessionCode,
    hasStarted: gameRef.hasStarted,
    hasFinishedCountdown: gameRef.hasFinishedCountdown,
    hasEnded: gameRef.hasEnded,
    parameters: gameRef.parameters,
    commands: gameRef.commands,
    duration: gameRef.duration,
    lastActivity: gameRef.lastActivity,
    creatorId: gameRef.creatorId,
    isChallenge: gameRef.isChallenge,
    name: gameRef.name,
    // Classic challenge fields
    isClassicChallenge: gameRef.isClassicChallenge,
    startDate: gameRef.startDate,
    endDate: gameRef.endDate
  };
}
// Function to restore all persistent realtime challenge sessions on server startup

export async function restorePersistentRealTimeChallengeSessions() {
  try {
    logger.info("Restoring persistent realtime challenge sessions...");

    const persistentSessions = await sql`
      SELECT session_code, persistent_config, creator_id, is_challenge 
      FROM multi_sessions 
      WHERE is_challenge = TRUE AND persistent_config IS NOT NULL
    ` as Array<{
      session_code: string;
      persistent_config: string;
      creator_id: number;
      is_challenge: boolean;
    }>;

    let restoredCount = 0;
    let skippedCount = 0;
    let rescheduledCount = 0;
    let deletedCount = 0;
    const now = new Date();

    for (const session of persistentSessions) {
      const sessionCode = String(session.session_code).padStart(8, '0');

      try {
        const persistentState: PersistentGameState = JSON.parse(session.persistent_config);

        // Skip sessions that have already ended
        if (persistentState.hasEnded) {
          logger.info(`Skipping ended realtime challenge session ${sessionCode}`);
          skippedCount++;
          continue;
        }

        // Check if this challenge has a countdown with startTime
        const countdownCommand = persistentState.commands?.find(cmd => cmd.action === "countdown" && cmd.startTime);
        if (!countdownCommand || !countdownCommand.startTime) {
          logger.info(`Skipping realtime challenge session ${sessionCode} - no countdown with startTime`);
          skippedCount++;
          continue;
        }

        const startTime = new Date(countdownCommand.startTime);
        const hasRecurrence = !!(persistentState.parameters?.recurrence);

        // Restore the updated game state
        let baseGameState: MultiplayerGame = {
          ...persistentState,
          currentCommandIndex: 0,
          currentAtlas: "",
          currentRegionId: -1,
          stepStartTime: undefined,
          commandTimeout: undefined,
          totalGuessNumber: persistentState.commands?.filter(cmd => cmd.action === "guess").length || 0,
          hasAnswered: {},
          individualScores: {},
          individualAttempts: {},
          individualSuccesses: {},
          individualDurations: {},
          individualCorrectDurations: {},
          anonymousUsernames: [],
          isCurrentlyBlind: false,
          lastActivity: Date.now(),
          chatMessages: []
        };

        // If the start time has passed
        if (startTime.getTime() <= now.getTime()) {
          if (hasRecurrence) {
            // For recurring challenges, calculate the next occurrence
            logger.info(`Rescheduling recurring realtime challenge session ${sessionCode} - start time has passed`);

            let nextStartTime = new Date(startTime);
            const recurrence = persistentState.parameters!.recurrence!;

            // Keep advancing until we find a future time
            while (nextStartTime.getTime() <= now.getTime()) {
              nextStartTime = calculateNextStartTime(nextStartTime.toISOString(), recurrence);
            }

            // Update the commands with the new start time
            const updatedCommands = persistentState.commands?.map(cmd => {
              if (cmd.action === "countdown" && cmd.startTime) {
                return { ...cmd, startTime: nextStartTime.toISOString() };
              }
              return cmd;
            });

            baseGameState.commands = updatedCommands;
            baseGameState.parameters.commands = updatedCommands;

            // Update database
            await sql`
              UPDATE multi_sessions 
              SET persistent_config = ${JSON.stringify(baseGameState)},
                  created_at = NOW()
              WHERE session_code = ${sessionCode}
            `;

            rescheduledCount++;
            logger.info(`Rescheduled recurring realtime challenge session ${sessionCode} to ${nextStartTime.toISOString()}`);
          } else {
            // For non-recurring challenges that have passed, delete them
            logger.info(`Deleting expired non-recurring realtime challenge session ${sessionCode}`);
            await sql`DELETE FROM multi_sessions WHERE session_code = ${sessionCode} AND is_challenge = TRUE`;
            deletedCount++;
            continue; // Skip further processing for deleted sessions
          }
        }

        // Restore the game state in memory and start it
        games[sessionCode] = baseGameState;
        sendNextCommand(games[sessionCode]);
        restoredCount++;
        logger.info(`Restored realtime challenge session ${sessionCode} - scheduled for ${startTime.toISOString()}`);
      } catch (parseError) {
        logger.error(`Error parsing persistent config for session ${sessionCode}:`, parseError);
        skippedCount++;
      }
    }

    logger.info(`Realtime challenge session restoration complete: ${restoredCount} restored, ${rescheduledCount} rescheduled, ${deletedCount} deleted, ${skippedCount} skipped`);

  } catch (error) {
    logger.error("Error restoring persistent realtime challenge sessions:", error);
  }
}



import { ExternalGameCommands, GameCommands, MultiplayerGame } from "interfaces/multi.interfaces.ts";
import { sql } from "./database_init.ts";
import { logger } from "./logging.ts";
import { socketClients, playerInfo, socketInfo, games, broadcastToSession, DEFAULT_COUNTDOWN_TIME, DEFAULT_LOAD_ATLAS_DURATION, getRandomLut, validateExternalGameCommands, INACTIVE_GAME_TIMEOUT_MS, config, MAX_POINTS_PER_REGION, BONUS_POINTS_PER_SECOND, BLIND_MODE_MULTIPLIER } from "./multi.ts";
import { emitPublicLobbiesUpdate } from "./multi_public.ts";
import { backupGameForRecurrence, handleGameRecurrence } from "./multi_recurrence.ts";
import { getIO } from "./socket.io.ts";
import { validRegions } from "./game.ts";
import jwt from "jsonwebtoken";

// Create a dedicated cleanup function
export function cleanupGame(sessionCode: string, skipDatabaseDeletion: boolean = false) {
  logger.info("Cleaning up session", {
    sessionCode,
    skipDatabaseDeletion
  });
  const io = getIO();
  // Clean up SSE clients
  const socketIdsToDisconnect: string[] = [];
  Object.keys(socketClients)
    .filter(key => key.startsWith(sessionCode + ":"))
    .forEach(key => {
      socketIdsToDisconnect.push(...socketClients[key]);
      delete socketClients[key];
    });

  // Clean up player info
  Object.keys(playerInfo)
    .filter(key => key.startsWith(sessionCode + ":"))
    .forEach(key => {
      delete playerInfo[key];
    });

  // Clean up socket info for affected sockets
  socketIdsToDisconnect.forEach(socketId => {
    delete socketInfo[socketId];
  });

  // Force all sockets to leave the room
  io.in(`game:${sessionCode}`).socketsLeave(`game:${sessionCode}`);

  // Remove game entry
  const game = games[sessionCode];
  if (game && game.commandTimeout) {
    clearTimeout(game.commandTimeout);
  }

  delete games[sessionCode];

  // Delete from database if it exists (unless we're keeping it for recurrence)
  if (!skipDatabaseDeletion) {
    sql`DELETE FROM multi_sessions WHERE session_code = ${sessionCode} AND is_classic_challenge_original_entry = FALSE`.catch(e => {
      logger.error(`Error deleting session ${sessionCode}:`, e);
    });
    // Notify watchers that lobbies list may have changed
    emitPublicLobbiesUpdate();
  }
}

export async function clotureMultiplayerGame(gameRef: MultiplayerGame) {
  try {
    if (gameRef.hasEnded) return;
    gameRef.hasEnded = true;
    logger.info("Cloturing game", {
      sessionCode: gameRef.sessionCode
    });

    // 1. Backup the game state for potential recurrence
    const gameBackup = backupGameForRecurrence(gameRef);

    // Save finished session data to DB
    await saveFinishedSessions(gameRef);

    // 2. Perform complete game cleanup (skip database deletion if we have recurrence)
    const sessionCode = gameRef.sessionCode;
    const hasRecurrence = !!(gameBackup && gameRef.isChallenge && gameRef.parameters.recurrence);
    const isOriginalClassicChallenge = gameRef.isClassicChallenge && (!gameRef.originalSessionCode || gameRef.originalSessionCode === gameRef.sessionCode);

    // For classic challenges, we need to clean up temporary database entries
    if (isOriginalClassicChallenge) {
      // This is a temporary session created for a user-specific classic challenge
      // Delete the temporary entry, but keep the original challenge intact
      await sql`DELETE FROM multi_sessions WHERE session_code = ${gameRef.sessionCode} AND is_classic_challenge_original_entry = FALSE`
        .catch(e => {
          logger.error(`Error deleting temporary classic challenge session ${sessionCode}:`, e);
        });
    } else if (gameRef.isChallenge && !hasRecurrence) {
      // Delete the session from database only if no recurrence and not a temporary classic challenge
      await sql`DELETE FROM multi_sessions WHERE session_code = ${gameRef.sessionCode} AND is_classic_challenge_original_entry = FALSE`
        .catch(e => {
          logger.error(`Error deleting session ${sessionCode}:`, e);
        });
    }

    // Use the common cleanup function (skip DB deletion if we have recurrence or for classic challenges original sessions)
    cleanupGame(gameRef.sessionCode, hasRecurrence || isOriginalClassicChallenge);

    // broadcast a final message to all clients
    broadcastToSession(sessionCode, 'game-closed', {});

    // 3. Handle recurrence if this was a challenge with recurrence settings
    if (gameBackup && gameRef.isChallenge && gameRef.parameters.recurrence) {
      await handleGameRecurrence(gameBackup);
    }

  } catch (error) {
    logger.error("Error cloturing game:", error);
    if (gameRef && gameRef.sessionCode) {
      cleanupGame(gameRef.sessionCode);
    }
  }
}

/**
 * Extracted helper to persist finished session rows for a game. This is separated
 * so callers (like handleClassicChallengeEnd) can record the final scores to the
 * `finished_sessions` table before any cleanup/broadcast happens.
 */
export async function saveFinishedSessions(gameRef: MultiplayerGame) {
  try {
    const gameDuration = gameRef.duration ? (Date.now() - gameRef.duration) : 0;
    const allScores = Object.values(gameRef.individualScores || {});
    const maxScore = allScores.length ? Math.max(...allScores) : 0;
    logger.info(`Saving finished session`,{
      sessionCode: gameRef.sessionCode
    });

    const savePromises: Promise<any>[] = [];
    for (const username in gameRef.individualScores || {}) {
      // Skip anonymous users
      if (gameRef.anonymousUsernames && gameRef.anonymousUsernames.includes(username)) continue;
      if (!gameRef.hasStarted) continue; // avoid saving non-started games
      logger.info(`Saving scores from finished session`,{
        sessionCode: gameRef.sessionCode,
        username: username, playerKey: `${gameRef.sessionCode}:${username}`
      });
      const playerKey = `${gameRef.sessionCode}:${username}`;
      const player = playerInfo[playerKey];
      if (!player) continue;
      const userId = player.userId;
      if (!userId) continue; // If no userId, do not store anything for this user

      logger.info(`Saving scores from finished session for user`,{
        sessionCode: gameRef.sessionCode,
        username: username, playerKey: `${gameRef.sessionCode}:${username}`,
        userId
      });

      const mode = 'multiplayer';
      const atlas = gameRef.currentAtlas;
      const blindMode = gameRef.isCurrentlyBlind || false;
      const score = gameRef.individualScores[username] || 0;
      const attempts = gameRef.individualAttempts[username] || 0;
      const correct = gameRef.individualSuccesses[username] || 0;
      const incorrect = attempts - correct;
      const durations = gameRef.individualDurations[username] || [];
      const correctDurations = gameRef.individualCorrectDurations[username] || [];
      const minTimePerRegion = durations.length > 0 ? Math.min(...durations) : null;
      const maxTimePerRegion = durations.length > 0 ? Math.max(...durations) : null;
      const avgTimePerRegion = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
      const minTimePerCorrectRegion = correctDurations.length > 0 ? Math.min(...correctDurations) : null;
      const maxTimePerCorrectRegion = correctDurations.length > 0 ? Math.max(...correctDurations) : null;
      const avgTimePerCorrectRegion = correctDurations.length > 0 ? Math.round(correctDurations.reduce((a, b) => a + b, 0) / correctDurations.length) : null;
      const quitReason = 'end';
      const multiplayerGamesWon = (score === maxScore && maxScore > 0) ? 1 : 0;
      const name = gameRef.name || null;
      const classicChallengeStartDate = gameRef.startDate || null;
      const classicChallengeEndDate = gameRef.endDate || null;
      const classicChallengeId = gameRef.classicChallengeId || null;

      const theoreticalMaximumScore = gameRef.theoreticalMaximumScore || 0;
      const scorePercentage = theoreticalMaximumScore > 0 ? Math.round((score / theoreticalMaximumScore) * 10000) / 100 : 0; // Round to 2 decimals

      // Idempotency: if classicChallengeId is set, skip inserting if a row already exists for this user+challenge
      let shouldInsert = true;
      if (classicChallengeId) {
        try {
          const existing = await sql`
            SELECT id FROM finished_sessions
            WHERE user_id = ${userId} AND classic_challenge_id = ${classicChallengeId}
            ORDER BY created_at DESC LIMIT 1
          ` as { id: number }[];
          if (existing && existing.length > 0) shouldInsert = false;
        } catch (err) {
          logger.error('Error checking existing finished_sessions for idempotency:', err);
          // On error, proceed to insert to avoid data loss
          shouldInsert = true;
        }
      }

      if (!shouldInsert) continue;
      savePromises.push(
        sql`
          INSERT INTO finished_sessions (
            user_id, mode, atlas, blind_mode, score, attempts, correct, incorrect,
            min_time_per_region, max_time_per_region, avg_time_per_region,
            min_time_per_correct_region, max_time_per_correct_region, avg_time_per_correct_region,
            quit_reason, multiplayer_games_won, duration, created_at,
            name, classic_challenge_start_date, classic_challenge_end_date, classic_challenge_id,
            theoretical_maximum_score, score_percentage, chat
          ) VALUES (
            ${userId}, ${mode}, ${atlas}, ${blindMode}, ${score}, ${attempts}, ${correct}, ${incorrect},
            ${minTimePerRegion}, ${maxTimePerRegion}, ${avgTimePerRegion},
            ${minTimePerCorrectRegion}, ${maxTimePerCorrectRegion}, ${avgTimePerCorrectRegion},
            ${quitReason}, ${multiplayerGamesWon}, ${gameDuration}, NOW(),
            ${name}, ${classicChallengeStartDate}, ${classicChallengeEndDate}, ${classicChallengeId},
            ${theoreticalMaximumScore}, ${scorePercentage}, ${gameRef.chatMessages?.length ? JSON.stringify(gameRef.chatMessages) : null}
          )
        `.catch(e => {
          logger.error('Error inserting finished_session for user ' + userId + ':', e);
        })
      );
    }

    await Promise.allSettled(savePromises);
  } catch (err) {
    logger.error('Error in saveFinishedSessions:', err);
  }
}

export function cleanupExternalCommands(externalCommands: ExternalGameCommands[], isChallenge: boolean = false): GameCommands[] | undefined {
  try {
    const { error } = validateExternalGameCommands(externalCommands);
    if (error) throw error;
    const commands: GameCommands[] = [];
    let currentAtlas: string | undefined = undefined;
    let regionPool: number[] = [];
    let index = 0;

    for (const command of externalCommands) {
      if (command.action === "countdown") {
        if (index === 0) {
          let countdownCommand: any = { action: "countdown" };

          // Handle startTime vs duration
          if (command.startTime) {
            const startTime = new Date(command.startTime);
            if (isNaN(startTime.getTime())) {
              throw `Invalid startTime format. Must be a valid ISO date string.`;
            }

            // Validate that startTime is in the future
            const now = new Date();
            if (startTime.getTime() <= now.getTime()) {
              throw `Countdown start time must be in the future. Provided: ${command.startTime}`;
            }

            countdownCommand.startTime = command.startTime;
            // Duration will be computed at game launch
          } else {
            countdownCommand.duration = command.duration || DEFAULT_COUNTDOWN_TIME;
          }

          commands.push(countdownCommand);
        } else {
          throw `Countdown command must be the first command.`;
        }
        index++;
        continue;
      } else {
        if (index === 0) {
          commands.push({ action: "countdown", duration: DEFAULT_COUNTDOWN_TIME });
        }
      }

      if (command.action === "load-atlas") {
        currentAtlas = command.atlas || Object.keys(validRegions)[Math.floor(Math.random() * Object.keys(validRegions).length)];
        if (!validRegions[currentAtlas || ""]) {
          throw `Atlas "${currentAtlas}" does not exist.`;
        }
        const { lut, mapping, inverseMapping } = getRandomLut(currentAtlas);
        commands.push({
          action: "load-atlas",
          atlas: currentAtlas,
          lut,
          mapping,
          inverseMapping,
          duration: command.duration || DEFAULT_LOAD_ATLAS_DURATION,
          blindMode: command.blindMode || false,
        });
        regionPool = [...validRegions[currentAtlas]];
      } else if (command.action === "guess") {
        if (!currentAtlas || !validRegions[currentAtlas || ""]) {
          throw `Atlas "${currentAtlas}" does not exist.`;
        }
        // If pool is empty, refill with all regions (to allow repeats only after all have been used)
        if (regionPool.length === 0) {
          regionPool = [...validRegions[currentAtlas]];
        }
        let idx = -1;
        let regionId = -1;
        if (command.regionId) {
          regionId = command.regionId;
          if (regionPool.includes(regionId)) {
            idx = regionPool.indexOf(regionId);
            regionPool.splice(idx, 1); // Remove from pool
          }
        } else {
          idx = Math.floor(Math.random() * regionPool.length);
          regionId = regionPool[idx];
          regionPool.splice(idx, 1); // Remove from pool
        }
        if (!validRegions[currentAtlas].includes(regionId)) {
          throw `Region "${regionId}" does not exist in atlas "${currentAtlas}".`;
        }
        commands.push({
          action: "guess",
          regionId: regionId,
          duration: command.duration,
        });
      } else {
        throw `Unknown action "${command.action}" in external commands.`;
      }
      index++;
    }
    return commands;
  } catch (error) {
    throw error;
  }
}
// Add this function to check for inactive games
export function setupInactiveGameCheck() {
  setInterval(() => {
    const now = Date.now();
    Object.keys(games).forEach(sessionCode => {
      const game = games[sessionCode];

      // Skip games that are active
      if (game.hasStarted && !game.hasEnded) return;
      if (game.isClassicChallenge && (!game.originalSessionCode || game.originalSessionCode === game.sessionCode)) return; // avoid classic challenge cleaning

      // Check if the game has been inactive
      const lastActivity = game.lastActivity || game.duration || 0;
      if (now - lastActivity > INACTIVE_GAME_TIMEOUT_MS) {
        logger.info(`Cleaning up inactive game: ${sessionCode}`);

        // For games that haven't started, just clean up
        if (!game.hasStarted) {
          cleanupGame(sessionCode);
        }

        // For started games that haven't ended properly, close them
        else if (!game.hasEnded) {
          clotureMultiplayerGame(game);
        }
      }
    });
  }, 5 * 60 * 1000); // Check every 5 minutes
}
export const handleDestroySession = async (data: {
  sessionCode: string;
  sessionToken: string;
  userToken: string;
}) => {
  try {
    const { sessionCode, sessionToken, userToken } = data;

    // Verify authentication
    if (!userToken) {
      return { status: 400, message: "Authentication token required" };
    }
    if (!sessionCode || !sessionToken) {
      return { status: 400, message: "Session code and token are required" };
    }

    const jwtPayload: any = jwt.verify(userToken, config.jwt_secret);
    if (!jwtPayload) {
      return { status: 403, message: "Invalid authentication token" };
    }

    // Verify session exists and user has access
    const currentSession = await sql`
      SELECT id, creator_id 
      FROM multi_sessions 
      WHERE session_code = ${sessionCode} AND session_token = ${sessionToken}
    ` as { id: number; creator_id: number; }[];

    if (currentSession.length === 0) {
      return { status: 404, message: "Session not found or invalid token" };
    }

    // Check if user is the creator or admin
    const isCreator = jwtPayload.id === currentSession[0].creator_id;
    const isAdmin = jwtPayload.admin === true;

    if (!isCreator && !isAdmin) {
      return { status: 403, message: "Only the session creator or admin can destroy the session" };
    }

    // Notify all players in the lobby that the session is being destroyed
    broadcastToSession(sessionCode, 'session-destroyed', {
      reason: 'Creator left the configuration screen'
    });

    // Clean up the session
    cleanupGame(sessionCode, false); // false = don't skip database deletion

    logger.info(`Session ${sessionCode} destroyed by user ${jwtPayload.id} (creator: ${isCreator}, admin: ${isAdmin})`);
    return { status: 200, message: "Session destroyed successfully" };
  } catch (error) {
    logger.error("Destroy session error:", error);
    return { status: 500, message: "Error destroying session" };
  }
};
export async function getClassicChallengeRankings(challengeId: number): Promise<{userId: number, username: string, score: number, ranking: number}[]> {
  try {
    // Get all finished sessions for this challenge where users have publish_to_leaderboard=true
    const results = await sql`
      SELECT 
        fs.user_id,
        u.username,
        fs.score_percentage as score
      FROM finished_sessions fs
      JOIN users u ON fs.user_id = u.id
      WHERE fs.classic_challenge_id = ${challengeId}
        AND u.publish_to_leaderboard = true
        AND fs.score_percentage IS NOT NULL
      ORDER BY fs.score_percentage DESC, fs.created_at ASC
    ` as { user_id: number, username: string, score: number }[];

    // Add ranking
    const rankings = results.map((result, index) => ({
      userId: result.user_id,
      username: result.username,
      score: result.score,
      ranking: index + 1
    }));

    return rankings;
  } catch (error) {
    logger.error("Error getting classic challenge rankings:", error);
    return [];
  }
}


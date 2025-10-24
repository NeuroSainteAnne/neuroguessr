import type { AuthenticatedRequest, MultiValidateGuessRequest, UpdateMultiGameRequest } from "../interfaces/requests.interfaces.ts";
import { sql } from "./database_init.ts";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
type Config = import("../interfaces/config.interfaces.ts").Config;
import configJson from '../config.json' with { type: "json" };
export const config: Config = configJson;
import { imageMetadata, imageRef, regionCenters, validRegions } from "./game.ts";
import { NVImage } from "@niivue/niivue";
import { MultiSession } from "interfaces/database.interfaces.ts";
import { GameCommands, MultiplayerGame, MultiplayerParametersType, PlayerInfo, PersistentGameState, Recurrence } from "interfaces/multi.interfaces.ts";
import crypto from "crypto";
import { getIO } from "./socket.io.ts";
import { Socket } from "socket.io";
import Joi from "joi";
import { logger } from "./logging.ts";
import { getDistance } from "./utils_compute.ts";
import { extractPersistentState, handleSaveAsRealtimeChallenge } from "./multi_challenge.ts";
import { buildPublicLobbies, emitPublicLobbiesUpdate } from "./multi_public.ts";
import { cleanupExternalCommands, cleanupGame, clotureMultiplayerGame, 
  handleDestroySession, setupInactiveGameCheck, getClassicChallengeRankings, saveFinishedSessions} from "./multi_cleanup.ts";
import { handleCreateClassicChallenge } from "./multi_classic_challenge.ts";
import { logoString, sendEmail } from "./email.ts";

// Atomic game update locks to prevent race conditions
const gameStateLocks = new Map<string, boolean>();

/**
 * Executes a game state update atomically to prevent race conditions
 * @param sessionCode - The session code to lock
 * @param updateFn - The function to execute atomically
 * @param timeoutMs - Optional timeout in milliseconds (default: 5000)
 * @returns Promise<T> - The result of the update function
 */
async function atomicGameUpdate<T>(
  sessionCode: string, 
  updateFn: () => Promise<T> | T,
  timeoutMs: number = 5000
): Promise<T | null> {
  const lockKey = `game:${sessionCode}`;
  
  // Check if already locked
  if (gameStateLocks.get(lockKey)) {
    logger.warn(`Game ${sessionCode}: Operation blocked due to concurrent access`);
    return null;
  }
  
  // Acquire lock
  gameStateLocks.set(lockKey, true);
  
  try {
    // Set timeout to prevent deadlocks
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Atomic update timeout for game ${sessionCode}`)), timeoutMs);
    });
    
    const updatePromise = Promise.resolve(updateFn());
    
    // Race between update and timeout
    const result = await Promise.race([updatePromise, timeoutPromise]);
    return result;
  } catch (error) {
    logger.error(`Atomic update failed for game ${sessionCode}:`, error);
    throw error;
  } finally {
    // Always release lock
    gameStateLocks.delete(lockKey);
  }
}

/**
 * Checks if a game session is currently locked
 * @param sessionCode - The session code to check
 * @returns boolean - True if locked, false otherwise
 */
function isGameLocked(sessionCode: string): boolean {
  return gameStateLocks.has(`game:${sessionCode}`);
}

/**
 * Forces release of a game lock (use with caution)
 * @param sessionCode - The session code to unlock
 */
export function forceUnlockGame(sessionCode: string): void {
  const lockKey = `game:${sessionCode}`;
  if (gameStateLocks.has(lockKey)) {
    gameStateLocks.delete(lockKey);
    logger.warn(`Forced unlock for game ${sessionCode}`);
  }
}

// Export atomic update functions for use in other modules
export { atomicGameUpdate, isGameLocked };

const externalGameCommandsSchema = Joi.array().items(
  Joi.object({
    action: Joi.string().valid("load-atlas", "guess", "countdown").required(),
    atlas: Joi.string().optional(),
    regionId: Joi.number().integer().optional(),
    duration: Joi.number().integer().min(5).when('action', {
      is: 'countdown',
      then: Joi.optional(),
      otherwise: Joi.required()
    }),
    startTime: Joi.string().isoDate().when('action', {
      is: 'countdown',
      then: Joi.optional(),
      otherwise: Joi.forbidden()
    }),
    blindMode: Joi.boolean().optional(),
  }).required()
);

export const validateExternalGameCommands = (commands: unknown): Joi.ValidationResult => {
  return externalGameCommandsSchema.validate(commands, { abortEarly: false });
};

const DEFAULT_REGION_NUMBER = 15;
const DEFAULT_DURATION_PER_REGION = 15;
const DEFAULT_GAMEOVER_ON_ERROR = false;
export const DEFAULT_LOAD_ATLAS_DURATION = 5; // seconds to load atlas
export const DEFAULT_COUNTDOWN_TIME = 5; // 5 seconds countdown before game start
export const MAX_POINTS_PER_REGION = 50; // 1000 total points / 20 regions
export const BONUS_POINTS_PER_SECOND = 1; // nombre de points bonus par seconde restante (max 100*10 = 1000 points)
const MAX_POINTS_WITH_PENALTY = 30 // 30 points max if clicked outside the region
const MAX_PENALTY_DISTANCE = 100; // Arbitrary distance in mm for max penalty (0 points)
export const INACTIVE_GAME_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const BLIND_MODE_MULTIPLIER = 1.5; // Multiplier for points in blind mode
export const DELAY_FOR_CHALLENGES_IN_PUBLIC = 5 * 60 * 1000; // 5 minutes

// In-memory maps
export const socketClients: Record<string, string[]> = {}; // sessionCode:userName -> socketIds[]
export const games: Record<string, MultiplayerGame> = {};
export const playerInfo: Record<string, PlayerInfo> = {};
export const socketInfo: Record<string, {sessionCode: string, userName: string}> = {};

export type ColorMap = {
  R: number[];
  G: number[];
  B: number[];
  A: number[];
  I: number[];
  min?: number;
  max?: number;
  labels: string[];
  centers?: number[][][];
};

// Initialize Socket.io handling
export function initSocketHandlers() {
  const io = getIO();

  io.on('connection', (socket) => {
    const clientIP = socket.handshake.address || 'unknown';
    
    logger.info('Socket connection established', {
      socketId: socket.id,
      clientIP,
      timestamp: new Date().toISOString()
    });

    // Handle join lobby
    socket.on('join-lobby', async (data: {
      sessionCode: string,
      userName: string,
      isAnonymous: boolean,
      token?: string,
      anonToken?: string
    }) => {
      const startTime = Date.now();
      logger.info('Join lobby attempt', {
        socketId: socket.id,
        sessionCode: data?.sessionCode,
        userName: data?.userName,
        isAnonymous: data?.isAnonymous,
        clientIP,
        timestamp: new Date().toISOString()
      });

      try {
        const { sessionCode, userName, isAnonymous, token, anonToken } = data;
        
        // Set up cleanup function for when this socket disconnects
        socket.on('disconnect', () => {
          logger.info('Socket disconnecting', {
            socketId: socket.id,
            sessionCode: socketInfo[socket.id]?.sessionCode,
            userName: socketInfo[socket.id]?.userName,
            clientIP
          });
          handleDisconnect(socket.id);
        });

        // Check if this is a classic challenge first
        const sessionResult = await sql`
          SELECT * FROM multi_sessions WHERE session_code = ${sessionCode}
        ` as MultiSession[];
        
        if (!sessionResult.length) {
          socket.emit('error', { message: "Lobby does not exist" });
          return;
        }
        
        const sessionData = sessionResult[0];
        const isClassicChallenge = sessionData.is_classic_challenge || false;
        
        if (isClassicChallenge) {
          // Handle classic challenge logic
          const challenge = sessionData;
          const now = new Date();
          const startDate = new Date(challenge.start_date!!);
          const endDate = new Date(challenge.end_date!!);

          // Check timing
          if (now < startDate) {
            socket.emit('error', { message: 'Challenge has not started yet' });
            return;
          }

          if (now > endDate) {
            socket.emit('error', { message: 'Challenge has ended' });
            return;
          }

          if(challenge.classic_challenge_referral){
            socket.emit('error', { message: 'Cannot create a self-referring challenge' });
            return;
          }

          // Get user ID for replay prevention check
          let userId: number | undefined = undefined;
          let finalUserName: string = userName;

          if (!token) {
            socket.emit('error', { message: 'Classic challenges require you to be logged in. Please log in to participate.' });
            return;
          }

          try {
            const jwtPayload: any = jwt.verify(token, config.jwt_secret);
            userId = jwtPayload.id;
            finalUserName = jwtPayload.username;
          } catch (jwtError) {
            socket.emit('error', { message: 'Invalid authentication token' });
            return;
          }

          // Check replay prevention for authenticated users
          if (userId) {
            const completedResult = await sql`
              SELECT id FROM finished_sessions
              WHERE user_id = ${userId}
              AND classic_challenge_id = ${challenge.id}
            `;

            if (completedResult.length > 0) {
              socket.emit('error', { message: 'You have already completed this classic challenge' });
              return;
            }

            // Check if user already has an active session for this challenge
            const activeSessionResult = await sql`
              SELECT id FROM multi_sessions
              WHERE classic_challenge_referral = ${sessionCode}
            `;

            if (activeSessionResult.length > 0) {
              socket.emit('error', { message: 'You already have an active session for this classic challenge. Please complete or leave your current session first.' });
              return;
            }
          }

          // Create a unique session code for this user's challenge instance
          const userSessionCode = await getUniqueCode();
          const userSessionToken = crypto.randomBytes(32).toString('hex');

          console.log("challenge", challenge)
          const newSessionConfig = JSON.parse(challenge.persistent_config || "")
          newSessionConfig.sessionCode = userSessionCode;

          // Create new temporary database entry for this user's personal challenge
          const insertResult = await sql`
            INSERT INTO multi_sessions (
              session_code, session_token, creator_id, 
              is_classic_challenge, start_date, end_date, name,
              persistent_config, created_at, classic_challenge_referral
            ) VALUES (
              ${userSessionCode}, ${userSessionToken}, ${userId!},
              true, ${new Date(challenge.start_date!)}, ${new Date(challenge.end_date!)}, ${challenge.name || 'Classic Challenge'},
              ${JSON.stringify(newSessionConfig)}, NOW(), ${sessionCode}
            )
            RETURNING id
          `;
          const sessionId = insertResult[0].id;

          // Now join the lobby with the real session code
          const joinResult = await joinLobby(socket, userSessionCode, finalUserName, false, token, undefined);

          if (joinResult.success) {
            // Mark this as a classic challenge session
            const gameRef = games[userSessionCode];
            if (gameRef) {
              gameRef.isClassicChallenge = true;
              gameRef.name = challenge.name || undefined;
              gameRef.startDate = startDate;
              gameRef.endDate = endDate;
              gameRef.classicChallengeId = challenge.id; // Store the challenge ID
              // Keep original sessionCode for display purposes
              gameRef.originalSessionCode = sessionCode;
            }

            socket.emit('joined-classic-challenge', {
              sessionCode,
              userSessionCode,
              userSessionToken,
              challengeName: challenge.name,
              challengeId: challenge.id,
              startDate: challenge.start_date,
              endDate: challenge.end_date,
            });
          } else {
            socket.emit('error', { message: joinResult.error || 'Failed to join challenge' });
          }

          // Store socketInfo 
          socketInfo[socket.id] = { sessionCode:userSessionCode, userName };
        } else {
          // Handle regular multiplayer lobby
          const result = await joinLobby(socket, sessionCode, userName, isAnonymous, token, anonToken);
          
          if (result.error) {
            socket.emit('error', { message: result.error });
            return;
          }
          
          // Store socketInfo for lookups during disconnects
          socketInfo[socket.id] = { sessionCode, userName };
          
          // Send initial data to client
          if (result.anonToken) {
            socket.emit('anon-token', { anonToken: result.anonToken });
          }
        }
        
        const duration = Date.now() - startTime;
        logger.info('Join lobby successful', {
          socketId: socket.id,
          sessionCode,
          userName,
          isAnonymous,
          clientIP,
          duration: `${duration}ms`
        });
        
      } catch (error) {
        logger.error("Socket join error:", error);
        socket.emit('error', { message: "Internal server error" });
      }
    });

    // Handle validate guess
    socket.on('validate-guess', async (data: {
      sessionCode: string,
      userName: string,
      voxelProp: any,
      anonToken?: string,
      userToken?: string
    }) => {
      try {
        const info = socketInfo[socket.id];
        if (!info) {
          socket.emit('error', { message: "Not authenticated" });
          return;
        }
        const result = await handleValidateGuess({...data, userName: info.userName});
      } catch (error) {
        logger.error("Validate guess error:", error);
        socket.emit('error', { message: "Error validating guess" });
      }
    });

    // Handle update parameters
    socket.on('update-parameters', async (data: {
      sessionCode: string,
      sessionToken: string,
      parameters: Partial<MultiplayerParametersType>
    }) => {
      try {
        const info = socketInfo[socket.id];
        if (!info) {
          socket.emit('error', { message: "Not authenticated" });
          return;
        }
        const result = await handleUpdateParameters({...data, userName: info.userName});
        socket.emit('parameters-has-updated', result);
      } catch (error) {
        logger.error("Update parameters error:", error);
        socket.emit('error', { message: "Error updating parameters" });
      }
    });

    // Handle launch game
    socket.on('launch-game', async (data: {
      sessionCode: string,
      sessionToken: string,
      userToken: string
    }) => {
      try {
        const info = socketInfo[socket.id];
        if (!info) {
          socket.emit('error', { message: "Not authenticated" });
          return;
        }
        const result = await handleLaunchGame({...data, userName: info.userName});
        socket.emit('game-launched', result);
      } catch (error) {
        logger.error("Launch game error:", error);
        socket.emit('error', { message: "Error launching game" });
      }
    });

    // Handle save as realtime challenge
    socket.on('save-as-realtime-challenge', async (data: {
      sessionCode: string,
      sessionToken: string,
      userToken: string,
      name?: string,
      recurrent?: Recurrence
    }) => {
      try {
        const info = socketInfo[socket.id];
        if (!info) {
          socket.emit('error', { message: "Not authenticated" });
          return;
        }
        const result = await handleSaveAsRealtimeChallenge({...data, userName: info.userName});
      } catch (error) {
        logger.error("Save as realtime challenge error:", error);
        socket.emit('error', { message: "Error saving realtime challenge" });
      }
    })

    // Handle admin change session code
    socket.on('change-session-code', async (data: {
      currentSessionCode: string,
      newSessionCode: string,
      sessionToken: string,
      userToken: string
    }) => {
      try {
        const { currentSessionCode, newSessionCode, sessionToken, userToken } = data;
        
        // Verify admin privileges
        if (!userToken) {
          socket.emit('error', { message: "Authentication token required" });
          return;
        }

        try {
          const jwtPayload: any = jwt.verify(userToken, config.jwt_secret);
          if (!jwtPayload || !jwtPayload.admin) {
            socket.emit('error', { message: "Admin privileges required" });
            return;
          }
          
          // Validate new session code format (8 digits)
          if (!newSessionCode || newSessionCode.length !== 8 || !/^\d{8}$/.test(newSessionCode)) {
            socket.emit('error', { message: "Invalid session code format. Must be 8 digits." });
            return;
          }
          
          // Check if new session code is already in use
          const existingSession = await sql`
            SELECT COUNT(*) as count 
            FROM multi_sessions 
            WHERE session_code = ${newSessionCode}
          `;
          
          if (existingSession[0]?.count > 0) {
            socket.emit('error', { message: "Session code already in use" });
            return;
          }
          
          // Verify current session exists and user has access
          const currentSession = await sql`
            SELECT id, creator_id 
            FROM multi_sessions 
            WHERE session_code = ${currentSessionCode} AND session_token = ${sessionToken}
          ` as { id: number; creator_id: number }[];
          
          if (currentSession.length === 0) {
            socket.emit('error', { message: "Current session not found or invalid token" });
            return;
          }
          
          // Update the session code in database
          await sql`
            UPDATE multi_sessions 
            SET session_code = ${newSessionCode}
            WHERE session_code = ${currentSessionCode} AND session_token = ${sessionToken}
          `;
          
          // Get IO instance to access all sockets
          const io = getIO();
          
          // First, notify all clients in the current room about the upcoming change
          broadcastToSession(currentSessionCode, 'session-code-changed', {
            oldCode: currentSessionCode,
            newCode: newSessionCode
          });
          
          // Find all socketClient keys for this session and move sockets to new room
          const affectedPlayerKeys: string[] = [];
          Object.keys(socketClients).forEach(playerKey => {
            if (playerKey.startsWith(`${currentSessionCode}:`)) {
              affectedPlayerKeys.push(playerKey);
              
              // Move all sockets for this player to the new room
              socketClients[playerKey].forEach(socketId => {
                const clientSocket = io.sockets.sockets.get(socketId);
                if (clientSocket) {
                  clientSocket.leave(`game:${currentSessionCode}`);
                  clientSocket.join(`game:${newSessionCode}`);
                }
              });
            }
          });
          
          // Update in-memory data structures
          if (games[currentSessionCode]) {
            games[newSessionCode] = games[currentSessionCode];
            games[newSessionCode].sessionCode = newSessionCode;
            delete games[currentSessionCode];
          }
          
          // Update socketClients mapping (change keys from oldCode:userName to newCode:userName)
          affectedPlayerKeys.forEach(oldPlayerKey => {
            const userName = oldPlayerKey.split(':')[1]; // Extract userName from "sessionCode:userName"
            const newPlayerKey = `${newSessionCode}:${userName}`;
            socketClients[newPlayerKey] = socketClients[oldPlayerKey];
            delete socketClients[oldPlayerKey];
          });
          
          // Update socket info for all connected clients
          Object.keys(socketInfo).forEach(socketId => {
            if (socketInfo[socketId].sessionCode === currentSessionCode) {
              socketInfo[socketId].sessionCode = newSessionCode;
            }
          });
          
          // Update playerInfo mapping (change keys from oldCode:userName to newCode:userName)
          Object.keys(playerInfo).forEach(playerKey => {
            if (playerKey.startsWith(`${currentSessionCode}:`)) {
              const userName = playerKey.split(':')[1];
              const newPlayerKey = `${newSessionCode}:${userName}`;
              playerInfo[newPlayerKey] = { ...playerInfo[playerKey], sessionCode: newSessionCode };
              delete playerInfo[playerKey];
            }
          });
          
          // Send updated lobby users list to the new room
          const userList = Object.values(playerInfo)
            .filter(info => info.sessionCode === newSessionCode)
            .map(info => info.userName)
            .filter(Boolean);
            
          broadcastToSession(newSessionCode, 'lobby-users', { users: userList });
          
          logger.info(`Admin ${jwtPayload.id} changed session code from ${currentSessionCode} to ${newSessionCode}`);
          
        } catch (jwtError) {
          socket.emit('error', { message: "Invalid authentication token" });
          return;
        }
        
      } catch (error) {
        logger.error("Change session code error:", error);
        socket.emit('error', { message: "Error changing session code" });
      }
    });

    // Handle create classic challenge (admin only)
    socket.on('create-classic-challenge', async (data: {
      sessionCode: string;
      sessionToken: string;
      name: string;
      start_date: Date;
      end_date: Date;
      public: boolean;
      userToken: string;
    }) => {
      try {
        const result = await handleCreateClassicChallenge(data, socket);
        socket.emit('classic-challenge-created', result);
      } catch (error) {
        logger.error("Create classic challenge error:", error);
        socket.emit('error', { message: error });
      }
    });

    // Handle get active classic challenges
    socket.on('get-active-classic-challenges', async () => {
      try {
        const result = await sql`
          SELECT
            ms.*,
            u.username as creator_username,
            u.firstname as creator_firstname,
            u.lastname as creator_lastname
          FROM multi_sessions ms
          JOIN users u ON ms.creator_id = u.id
          WHERE ms.is_classic_challenge = true
          AND ms.start_date <= NOW()
          AND ms.end_date >= NOW()
          ORDER BY ms.start_date ASC
        `;

        socket.emit('active-classic-challenges', { challenges: result });

      } catch (error) {
        logger.error("Get active classic challenges error:", error);
        socket.emit('error', { message: "Error getting active classic challenges" });
      }
    });

    // Handle get all classic challenges (admin only)
    socket.on('get-all-classic-challenges', async (data: { userToken: string }) => {
      try {
        const { userToken } = data;

        // Verify admin privileges
        if (!userToken) {
          socket.emit('error', { message: "Authentication token required" });
          return;
        }

        try {
          const jwtPayload: any = jwt.verify(userToken, config.jwt_secret);
          if (!jwtPayload || !jwtPayload.admin) {
            socket.emit('error', { message: "Admin privileges required" });
            return;
          }

          const result = await sql`
            SELECT
              ms.*,
              u.username as creator_username,
              u.firstname as creator_firstname,
              u.lastname as creator_lastname
            FROM multi_sessions ms
            JOIN users u ON ms.creator_id = u.id
            WHERE ms.is_classic_challenge = true
            ORDER BY ms.created_at DESC
          `;

          socket.emit('all-classic-challenges', { challenges: result });

        } catch (jwtError) {
          socket.emit('error', { message: "Invalid authentication token" });
          return;
        }

      } catch (error) {
        logger.error("Get all classic challenges error:", error);
        socket.emit('error', { message: "Error getting all classic challenges" });
      }
    });

    // Handle get classic challenge by ID
    socket.on('get-classic-challenge', async (data: { challengeId: number }) => {
      try {
        const { challengeId } = data;

        const result = await sql`
          SELECT
            ms.*,
            u.username as creator_username,
            u.firstname as creator_firstname,
            u.lastname as creator_lastname
          FROM multi_sessions ms
          JOIN users u ON ms.creator_id = u.id
          WHERE ms.id = ${challengeId} AND ms.is_classic_challenge = true
        `;

        if (result.length === 0) {
          socket.emit('error', { message: "Challenge not found" });
          return;
        }

        socket.emit('classic-challenge-details', { challenge: result[0] });

      } catch (error) {
        logger.error("Get classic challenge error:", error);
        socket.emit('error', { message: "Error getting classic challenge" });
      }
    });

    // Handle check if user can join classic challenge
    socket.on('can-join-classic-challenge', async (data: {
      challengeId: number;
      userToken?: string;
      anonToken?: string;
    }) => {
      try {
        const { challengeId, userToken, anonToken } = data;

        // Get user ID from token if authenticated
        let userId: number | undefined = undefined;
        if (userToken) {
          try {
            const jwtPayload: any = jwt.verify(userToken, config.jwt_secret);
            userId = jwtPayload.id;
          } catch (jwtError) {
            socket.emit('error', { message: "Invalid authentication token" });
            return;
          }
        }

        const challenge = await sql`
          SELECT * FROM multi_sessions
          WHERE id = ${challengeId} AND is_classic_challenge = true
        `;

        if (challenge.length === 0) {
          socket.emit('can-join-result', { canJoin: false, reason: 'Challenge not found' });
          return;
        }

        const challengeData = challenge[0];
        const now = new Date();

        if (now < new Date(challengeData.start_date)) {
          socket.emit('can-join-result', { canJoin: false, reason: 'Challenge has not started yet' });
          return;
        }

        if (now > new Date(challengeData.end_date)) {
          socket.emit('can-join-result', { canJoin: false, reason: 'Challenge has ended' });
          return;
        }

        socket.emit('can-join-result', { canJoin: true, sessionCode: challengeData.session_code });

      } catch (error) {
        logger.error("Can join classic challenge error:", error);
        socket.emit('error', { message: "Error checking challenge participation" });
      }
    });

    // Handle deactivate classic challenge (admin only)
    socket.on('deactivate-classic-challenge', async (data: {
      challengeId: number;
      userToken: string;
    }) => {
      try {
        const { challengeId, userToken } = data;

        // Verify admin privileges
        if (!userToken) {
          socket.emit('error', { message: "Authentication token required" });
          return;
        }

        try {
          const jwtPayload: any = jwt.verify(userToken, config.jwt_secret);
          if (!jwtPayload || !jwtPayload.admin) {
            socket.emit('error', { message: "Admin privileges required" });
            return;
          }

          // For classic challenges, we can "deactivate" by setting end_date to now
          const result = await sql`
            UPDATE multi_sessions
            SET end_date = NOW()
            WHERE id = ${challengeId} AND is_classic_challenge = true
          `;

          const success = result.count > 0;
          if (success) {
            logger.info(`Classic challenge ${challengeId} deactivated`);
            socket.emit('classic-challenge-deactivated', { success: true });
          } else {
            socket.emit('error', { message: 'Challenge not found' });
          }

        } catch (jwtError) {
          socket.emit('error', { message: "Invalid authentication token" });
          return;
        }

      } catch (error) {
        logger.error("Deactivate classic challenge error:", error);
        socket.emit('error', { message: "Error deactivating classic challenge" });
      }
    });

    // Handle get classic challenge leaderboard
    socket.on('get-classic-challenge-leaderboard', async (data: {
      challengeId: number;
      limit?: number;
    }) => {
      try {
        const { challengeId, limit = 50 } = data;

        const result = await sql`
          SELECT
            fs.score,
            fs.duration,
            fs.correct,
            fs.incorrect,
            fs.attempts,
            u.username,
            u.firstname,
            u.lastname,
            fs.created_at as completion_date,
            fs.classic_challenge_name as challenge_name
          FROM finished_sessions fs
          JOIN users u ON fs.user_id = u.id
          WHERE fs.classic_challenge_session_id = ${challengeId}
          ORDER BY fs.score DESC, fs.duration ASC
          LIMIT ${limit}
        `;

        socket.emit('classic-challenge-leaderboard', { leaderboard: result });

      } catch (error) {
        logger.error("Get classic challenge leaderboard error:", error);
        socket.emit('error', { message: "Error getting classic challenge leaderboard" });
      }
    });

    // Handle destroy session (creator leaving config screen)
    socket.on('destroy-session', async (data: {
      sessionCode: string,
      sessionToken: string,
      userToken: string
    }) => {
      try {
        const { sessionCode, sessionToken, userToken } = data;
        const result = await handleDestroySession({sessionCode, sessionToken, userToken});
        if(result.status != 200){
          socket.emit('error', { message: result.message });
          return;
        }
      } catch (error) {
        logger.error("Destroy session error:", error);
        socket.emit('error', { message: "Error destroying session" });
      }
    });

    // Handle explicit leave-lobby (when user navigates away from multiplayer page)
    socket.on('leave-lobby', async (data: {
      sessionCode: string,
      userName: string,
      anonToken?: string,
      userToken?: string
    }) => {
      try {
        const info = socketInfo[socket.id];
        if (!info) return;
        const { userName } = data;
        const playerKey = `${info.sessionCode}:${userName}`;
        
        logger.info(`User ${userName} explicitly leaving lobby ${info.sessionCode}`);
        
        // First, remove socket from the game room to stop receiving updates
        socket.leave(`game:${info.sessionCode}`);
        
        // Remove this specific socket from the user's socket list
        if (socketClients[playerKey]) {
          socketClients[playerKey] = socketClients[playerKey].filter(id => id !== socket.id);
          
          // If this was the last socket for this user, clean up completely
          if (socketClients[playerKey].length === 0) {
            // Use the same cleanup logic as disconnect but for explicit leave
            await handleExplicitUserLeave(info.sessionCode, userName, playerKey);
          }
        }
      } catch (error) {
        logger.error("Leave lobby error:", error);
      }
    });

    // Subscribe to public lobbies updates
    socket.on('connect-public', async () => {
      try {
        socket.join('public-lobbies');
        const lobbies = await buildPublicLobbies();
        socket.emit('public-lobbies-update', { lobbies });
      } catch (e) {
        // no-op
      }
    });
  });
}


// Convert your existing functions to use Socket.io
async function joinLobby(
  socket: Socket,
  sessionCode: string,
  userName: string,
  isAnonymous: boolean,
  token?: string,
  anonToken?: string
) {
  updateGameActivity(sessionCode);
  
  let finalUserName = userName;
  let authenticated = false;
  let userId: number | undefined = undefined;
  let newAnonToken: string | undefined = undefined;
  
  // Session check
  const sessionResult = await sql`
    SELECT * FROM multi_sessions WHERE session_code = ${sessionCode}
  ` as MultiSession[];
  if (!sessionResult.length) {
    return { error: "Lobby does not exist" };
  }
  const creatorId = sessionResult[0]?.creator_id;

  // Authentication logic (similar to your existing code)
  if (!isAnonymous) {
    if (!token) {
      return { error: "Please connect or choose anonymous mode" };
    }
    try {
      const jwtpayload: any = jwt.verify(token, config.jwt_secret);
      if (jwtpayload && jwtpayload.username && jwtpayload.id) {
        finalUserName = String(jwtpayload.username);
        userId = jwtpayload.id;
        authenticated = true;
      }
    } catch (err) {
      return { error: "Error: invalid token provided" };
    }
  } else {
    if (!config.allowAnonymousInMultiplayer) {
      return { error: "Anonymous mode not allowed" };
    }
    
    const userResult = await sql`
      SELECT id FROM users WHERE username = ${userName}
    `;
    
    if (userResult.length > 0) {
      return { error: "Username already exists" };
    }
    
    if (!anonToken) {
      // Generate new token for first-time anonymous users
      newAnonToken = crypto.randomBytes(32).toString("hex");
    } else {
      // Check existing token
      const playerKey = `${sessionCode}:${finalUserName}`;
      if (playerInfo[playerKey]?.anonToken && playerInfo[playerKey].anonToken !== anonToken) {
        return { error: "Invalid anonymous token" };
      }
    }
  }

  // Create game if it doesn't exist
  if (!games[sessionCode]) {
    await createEmptySession(sessionCode, creatorId ?? undefined);
  }
  
  const gameRef = games[sessionCode];
  const playerKey = `${sessionCode}:${finalUserName}`;
  let rejoiningMode = false;

  // Check if user is already in lobby
  if (playerInfo[playerKey]) {
    if (isAnonymous && anonToken) {
      // Anonymous user with existing token is rejoining
      if (playerInfo[playerKey].anonToken === anonToken) {
        rejoiningMode = true;
        logger.info('Anonymous user rejoining lobby', {
          sessionCode,
          userName: finalUserName
        });
      } else {
        return { error: "Invalid anonymous token" };
      }
    } else if (!isAnonymous) {
      // Allow the creator to rejoin (e.g., when navigating from create page to lobby page)
      const isCreator = userId && gameRef.creatorId === userId;
      if (!isCreator) {
        return { error: "User already in lobby" };
      }
      // Creator is rejoining - don't add them again to anonymous usernames or duplicate their info
      logger.info('Creator rejoining lobby', {
        sessionCode,
        userName: finalUserName,
        userId
      });
      rejoiningMode = true;
    } else {
      return { error: "User already in lobby" };
    }
  }

  // Check game state before user-specific operations (no lock needed for read-only check)
  if (gameRef.hasFinishedCountdown && !rejoiningMode) {
    return { error: "Game has already started, cannot join lobby" };
  }

  // Update anonymous usernames
  if (isAnonymous && !rejoiningMode) {
    const anonUpdateResult = await atomicGameUpdate(playerKey, async () => {
      // Only add to anonymous usernames if not already present
      if (!gameRef.anonymousUsernames.includes(finalUserName)) {
        gameRef.anonymousUsernames.push(finalUserName);
      }
      return { success: true };
    });
    
    if (!anonUpdateResult) {
      logger.warn(`Failed to update anonymous usernames for ${finalUserName} in ${sessionCode}`);
      return { error: `Failed to update anonymous usernames for ${finalUserName} in ${sessionCode}` };
    }
  }

  // Use per-user atomic update to prevent the same user from joining multiple times
  const userJoinResult = await atomicGameUpdate(playerKey, async () => {
    // Double-check user isn't already being processed for joining
    if (!rejoiningMode && playerInfo[playerKey]) {
      throw new Error("User already in lobby or being processed");
    }

    // Add socket to room
    socket.join(`game:${sessionCode}`);
    
    // Register socket client
    if (!socketClients[playerKey]) {
      socketClients[playerKey] = [];
    }
    // Only add socket if it's not already in the array to prevent duplicates
    if (!socketClients[playerKey].includes(socket.id)) {
      socketClients[playerKey].push(socket.id);
    }

    // Update player info
    updatePlayerInfo(sessionCode, finalUserName, {
      isAnonymous,
      userName: finalUserName,
      sessionCode,
      anonToken: newAnonToken || anonToken,
      userId: userId
    });

    return { success: true };
  });

  if (!userJoinResult) {
    return { error: "Failed to join lobby due to concurrent access for this user" };
  }

  if (userJoinResult instanceof Error) {
    return { error: userJoinResult.message };
  }

  // Initialize user in lobby (outside atomic section as it's mostly read operations)
  initUserInLobby(socket, finalUserName, gameRef, sessionCode, rejoiningMode);

  // Notify watchers of public lobbies (in case this lobby is public)
  emitPublicLobbiesUpdate();

  return { success: true, anonToken: newAnonToken };
}

function updatePlayerInfo(sessionCode: string, userName: string, info: Partial<PlayerInfo>) {
  const key = `${sessionCode}:${userName}`;
  if (!playerInfo[key]) {
    playerInfo[key] = {
      isAnonymous: false,
      userName,
      sessionCode,
      gameRef: games[sessionCode]
    };
  }
  Object.assign(playerInfo[key], info);
}

export function updateGameActivity(sessionCode: string) {
  if (games[sessionCode]) {
    games[sessionCode].lastActivity = Date.now();
  }
}

// Helper to check if a session code is reserved (0000, 1111, 2222, etc.)
function isReservedSessionCode(code: string): boolean {
    if (code.length !== 8) return false;
    
    // Check if all digits are the same (0000, 1111, 2222, etc.)
    const firstDigit = code[0];
    return code.split('').every(digit => digit === firstDigit);
}

// Helper to generate a unique 8-digit code
function generateCode(): string {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

async function getUniqueCode(): Promise<string> {
    let code: string;
    let exists: boolean = true;
    do {
        code = generateCode();
        
        // Skip reserved codes 
        if (isReservedSessionCode(code)) {
            continue;
        }
        
        const result = await sql`
            SELECT COUNT(*) as count 
            FROM multi_sessions 
            WHERE session_code = ${code}
        `;
        exists = result[0]?.count > 0;
    } while (exists);
    return code;
}

// Helper function to generate session token
function generateSessionToken(sessionCode: string, creatorId?: number): string {
  return jwt.sign({ 
    sessionCode, 
    creatorId, 
    type: "multiplayer-creator" 
  }, config.jwt_secret, { expiresIn: "1h" });
}

export const createMultiplayerSession = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id; 
    const sessionCode = await getUniqueCode();
    const sessionToken = generateSessionToken(sessionCode, userId);
    const result = await sql`
        INSERT INTO multi_sessions (session_code, session_token, creator_id, created_at)
        VALUES (${sessionCode}, ${sessionToken}, ${userId}, NOW())
        RETURNING id
    ` as { id: number }[];
    res.status(200).send({
        message: "Multiplayer session created.",
        sessionCode,
        sessionId: result[0].id,
        sessionToken
    });
  } catch (error) {
        logger.error("Error creating multiplayer session:", error);
        res.status(500).send({ message: "Internal Server Error" });
  }
};

export const destroyMultiplayerSession = async (req: Request, res: Response) => {
  try {
    const userToken = (req as AuthenticatedRequest).userToken;
    const { sessionCode, sessionToken } = req.body;

    const result = await handleDestroySession({ sessionCode, sessionToken, userToken });
    if(result.status == 200){
      res.status(200).send({ message: "Session destroyed successfully" });
    } else {
      res.status(result.status).send({ message: result.message });
    }
  } catch (error) {
    logger.error("Error destroying multiplayer session:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

async function createEmptySession(sessionCode: string, creatorId?: number) {
  // Fetch session data from database to check if it's a challenge
  let isChallenge = false;
  let persistentConfig: string | null = null;
  let isClassicChallenge = false;
  let challengeName: string | null = null;
  let startDate: Date | null = null;
  let endDate: Date | null = null;
  let name: string | null = null;
  
  try {
    const sessionResult = await sql`
      SELECT is_challenge, persistent_config, is_classic_challenge, start_date, end_date, name 
      FROM multi_sessions 
      WHERE session_code = ${sessionCode} 
      LIMIT 1
    `;
    
    if (sessionResult.length > 0) {
      isChallenge = sessionResult[0].is_challenge || false;
      persistentConfig = sessionResult[0].persistent_config || null;
      isClassicChallenge = sessionResult[0].is_classic_challenge || false;
      startDate = sessionResult[0].start_date ? new Date(sessionResult[0].start_date) : null;
      endDate = sessionResult[0].end_date ? new Date(sessionResult[0].end_date) : null;
      name = sessionResult[0].name || null;
    }
  } catch (error) {
    logger.error("Error fetching session data for createEmptySession:", error);
  }

  // If we have persistent config, restore from it
  if (persistentConfig && (isChallenge || isClassicChallenge)) {
    try {
      const persistentState: PersistentGameState = JSON.parse(persistentConfig);
      
      // Create base game state with runtime-only properties
      const baseGameState: MultiplayerGame = {
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
        lastActivity: Date.now() // Update activity time
      };
      
      games[sessionCode] = baseGameState;
      return;
    } catch (parseError) {
      logger.error("Error parsing persistent config, creating default session:", parseError);
    }
  }

  // Create default session (fallback or non-challenge)
  games[sessionCode] = {
    sessionCode: sessionCode,
    originalSessionCode: sessionCode,
    hasStarted: false,
    hasFinishedCountdown: false,
    hasEnded: false,
    currentCommandIndex: 0,
    totalGuessNumber: 0,
    currentAtlas: "",
    currentRegionId: -1,
    duration: 0,
    parameters: {
      regionsNumber: DEFAULT_REGION_NUMBER,
      durationPerRegion: DEFAULT_DURATION_PER_REGION,
      gameoverOnError: DEFAULT_GAMEOVER_ON_ERROR,
      blindMode: false,
      commands: undefined,
      isChallenge
    },
    hasAnswered: {},
    individualScores: {},
    individualAttempts: {},
    individualSuccesses: {},
    individualDurations: {},
    individualCorrectDurations: {},
    anonymousUsernames: [],
    lastActivity: Date.now(),
    isCurrentlyBlind: false,
    isChallenge,
    isClassicChallenge,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    name: name || undefined,
    ...(creatorId !== undefined ? { creatorId } : {}),
  }
}

function initUserInLobby(socket: Socket, userName: string, gameRef: MultiplayerGame, sessionCode: string, rejoiningMode: boolean = false) {
  if (!(userName in gameRef.individualScores)) {
    gameRef.individualScores[userName] = 0;
    gameRef.individualAttempts[userName] = 0;
    gameRef.individualSuccesses[userName] = 0;
    gameRef.individualDurations[userName] = [];
    gameRef.individualCorrectDurations[userName] = [];
  }
    
  // Build the current user list
  const userList = Object.values(playerInfo)
    .filter(info => info.sessionCode === sessionCode)
    .map(info => info.userName)
    .filter(Boolean);

  // Send data to the new user
  if(!gameRef.isClassicChallenge) socket.emit('lobby-users', { users: userList });
  socket.emit('parameters-updated', { parameters: gameRef.parameters });

  // Only broadcast "player-joined" for new users, not rejoining ones
  if (!rejoiningMode) {
    logger.info("broadcast player joined")
    // Broadcast to others that a new player joined
    socket.to(`game:${sessionCode}`).emit('player-joined', { userName });
  } else {
    logger.info("user rejoining lobby - no broadcast needed")
  }
  
  // If game is already in progress, send current state
  if (gameRef.hasStarted) {
    socket.emit('game-start');
    
    if (gameRef.commands && gameRef.currentCommandIndex < gameRef.commands.length) {
      const currentCommand = gameRef.commands[gameRef.currentCommandIndex];
      
      // Adjust duration for countdown commands
      if (currentCommand.action === "countdown") {
        if (currentCommand.startTime) {
          // For countdown with startTime, calculate time until start
          const startTime = new Date(currentCommand.startTime);
          const now = new Date();
          const timeUntilStart = Math.max(0, Math.floor((startTime.getTime() - now.getTime()) / 1000));
          
          // Send modified command with adjusted duration
          const modifiedCommand = { ...currentCommand, duration: timeUntilStart };
          socket.emit('game-command', { command: modifiedCommand });
        } else if (currentCommand.duration && gameRef.stepStartTime) {
          // For standard countdown with duration, calculate remaining time
          const now = Date.now();
          const elapsed = Math.floor((now - gameRef.stepStartTime) / 1000); // elapsed time in seconds
          const remainingDuration = Math.max(0, currentCommand.duration - elapsed);
          
          // Send modified command with remaining duration
          const modifiedCommand = { ...currentCommand, duration: remainingDuration };
          socket.emit('game-command', { command: modifiedCommand });
        } else {
          // Fallback: send command as-is
          socket.emit('game-command', { command: currentCommand });
        }
      } else {
        // For non-countdown commands, send as-is
        socket.emit('game-command', { command: currentCommand });
      }
    }
    
    socket.emit('all-scores-update', { scores: gameRef.individualScores });
  }
}

// Handle socket disconnection
function handleDisconnect(socketId: string) {
  const info = socketInfo[socketId];
  if (!info) return;
  
  const { sessionCode, userName } = info;
  const playerKey = `${sessionCode}:${userName}`;
  const gameRef = games[sessionCode];

  // Get the socket instance and leave the game room
  const socket = getIO().sockets.sockets.get(socketId);
  if (socket) {
    socket.leave(`game:${sessionCode}`);
  }

  // Use atomic update for user disconnect to prevent race conditions
  atomicGameUpdate(playerKey, async () => {
    // Remove from socketClients
    if (socketClients[playerKey]) {
      socketClients[playerKey] = socketClients[playerKey].filter(id => id !== socketId);
      
      // If this was the last socket for this user
      if (socketClients[playerKey].length === 0) {
        delete socketClients[playerKey];
        
        const player = playerInfo[playerKey];
        
        // Handle creator disconnection (game-level action)
        if(gameRef.isClassicChallenge){
          if(gameRef.classicChallengeId && gameRef && gameRef.creatorId && player?.userId && gameRef.creatorId == player.userId){
            // should destroy the classic challenge and store the results to finished sessions
            console.log("SHOULD DESTROY CLASSIC")
            return { shouldDestroyGame: true, player };
          }
          // not a classic instance: we don't destroy it
        } else if (gameRef && !gameRef.hasStarted && gameRef.creatorId && player?.userId && gameRef.creatorId == player.userId) {
          return { shouldDestroyGame: true, player };
        }
        
        // Clean up player info
        delete playerInfo[playerKey];
        
        return { shouldBroadcastLeave: true, player };
      }
    }
    return { shouldBroadcastLeave: false };
  }).then(async (result) => {
    if (!result) return;
    
    // Handle game destruction if creator left
    if (result.shouldDestroyGame) {
      // For classic challenges, save abandonment record before destroying
      if (result.player?.userId && gameRef.isClassicChallenge) {
        await clotureMultiplayerGame(gameRef);
      }
      getIO().to(`game:${sessionCode}`).emit('lobby-cancelled', {});
      cleanupGame(sessionCode);
      emitPublicLobbiesUpdate();
      delete socketInfo[socketId];
      return;
    }
    
    // Handle normal user leave
    if (result.shouldBroadcastLeave && result.player) {
      // Update anonymous usernames list if needed
      if (result.player.isAnonymous && gameRef) {
        await atomicGameUpdate(`${sessionCode}:anon`, async () => {
          gameRef.anonymousUsernames = gameRef.anonymousUsernames.filter(name => name !== userName);
          return { success: true };
        });
      }
      
      // Broadcast player left
      getIO().to(`game:${sessionCode}`).emit('player-left', { userName });
      emitPublicLobbiesUpdate();
    }
  }).catch((error) => {
    logger.error(`Error handling disconnect for ${playerKey}:`, error);
  });
  
  // Clean up socketInfo
  delete socketInfo[socketId];
}

// Handle explicit user leave (when navigating away from multiplayer page)
async function handleExplicitUserLeave(sessionCode: string, userName: string, playerKey: string) {
  const gameRef = games[sessionCode];
  
  await atomicGameUpdate(playerKey, async () => {
    delete socketClients[playerKey];
    
    const player = playerInfo[playerKey];
    if (!player) return { shouldBroadcastLeave: false };
    
    // Handle creator leaving before game starts
    if(gameRef.isClassicChallenge){
          if(gameRef.classicChallengeId && gameRef && gameRef.creatorId && player?.userId && gameRef.creatorId == player.userId){
            // should destroy the classic challenge and store the results to finished sessions
            console.log("SHOULD DESTROY CLASSIC")
            return { shouldDestroyGame: true, player };
          }
          // not a classic instance: we don't destroy it
    } else if (gameRef && !gameRef.hasStarted && gameRef.creatorId && player.userId && gameRef.creatorId == player.userId) {
      return { shouldDestroyGame: true, player };
    }
    
    // Clean up player info
    delete playerInfo[playerKey];
    
    return { shouldBroadcastLeave: true, player };
  }).then(async (result) => {
    if (!result) return;
    
    // Handle game destruction if creator left
    if (result.shouldDestroyGame) {
      // For classic challenges, save abandonment record before destroying
      if (result.player?.userId && gameRef.isClassicChallenge) {
        await clotureMultiplayerGame(gameRef);
      }
      getIO().to(`game:${sessionCode}`).emit('lobby-cancelled', {});
      cleanupGame(sessionCode);
      emitPublicLobbiesUpdate();
      return;
    }
    
    // Handle normal user leave
    if (result.shouldBroadcastLeave && result.player) {
      // Update anonymous usernames list if needed
      if (result.player.isAnonymous && gameRef) {
        await atomicGameUpdate(`${sessionCode}:anon`, async () => {
          gameRef.anonymousUsernames = gameRef.anonymousUsernames.filter(name => name !== userName);
          return { success: true };
        });
      }
      
      // Broadcast player left
      getIO().to(`game:${sessionCode}`).emit('player-left', { userName });
      emitPublicLobbiesUpdate();
    }
  }).catch((error) => {
    logger.error(`Error handling explicit leave for ${playerKey}:`, error);
  });
}

// Helper to emit to all sockets for a specific user
export function emitToUser(sessionCode: string, userName: string, event: string, data: any) {
  const playerKey = `${sessionCode}:${userName}`;
  const socketIds = socketClients[playerKey] || [];
  
  socketIds.forEach(socketId => {
    const socket = getIO().sockets.sockets.get(socketId);
    if (socket) {
      socket.emit(event, data);
    }
  });
}

// Helper to broadcast to all users in a session
export function broadcastToSession(sessionCode: string, event: string, data: any) {
  getIO().to(`game:${sessionCode}`).emit(event, data);
}

function verifyUserAccess(sessionCode: string, userName: string, userToken?: string, anonToken?: string): boolean {
  const playerKey = `${sessionCode}:${userName}`;
  const player = playerInfo[playerKey];
  
  if (!player) return false;
  
  if (player.isAnonymous) {
    return !!anonToken && player.anonToken === anonToken;
  } else {
    if (!userToken) return false;
    try {
      const jwtpayload: any = jwt.verify(userToken, config.jwt_secret);
      return !!jwtpayload && jwtpayload.username === userName;
    } catch (err) {
      return false;
    }
  }
}

function shuffleArray<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function getAtlasesToPreload(commands: GameCommands[]): string[] {
  const atlases = new Set<string>();
  
  // Find all unique atlases in the commands, excluding the first one
  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    if (command.action === "load-atlas" && command.atlas) {
      atlases.add(command.atlas);
    }
  }
  
  return Array.from(atlases);
}

export function getRandomLut(atlasName: string) : {lut: ColorMap|undefined, mapping: Record<number,number>|undefined, inverseMapping: Record<number,number>|undefined} {
    const atlasNumberRegions = validRegions[atlasName].length
    let lut : ColorMap | undefined = undefined;
    let mapping : Record<number,number> | undefined = undefined;
    let inverseMapping : Record<number,number> | undefined = undefined;
    if (atlasNumberRegions > 254) {
      // data shuffle mode
      const indices: number[] = [...validRegions[atlasName].keys()].filter(id => id > 0 && Number.isInteger(id))
      const shuffled = shuffleArray(indices);
      mapping = {};
      inverseMapping = {};
      for (let i = 0; i < indices.length; i++) {
          const oldId = indices[i];
          const newId = shuffled[i];
          mapping[oldId] = newId;
          inverseMapping[newId] = oldId;
      }
    } else {
      // lut shuffle mode
      lut = {
          "R": Array(1).fill(0).concat(shuffleArray([...Array(256).keys()]).slice(0, atlasNumberRegions - 1)),
          "G": Array(1).fill(0).concat(shuffleArray([...Array(256).keys()]).slice(0, atlasNumberRegions - 1)),
          "B": Array(1).fill(0).concat(shuffleArray([...Array(256).keys()]).slice(0, atlasNumberRegions - 1)),
          "A": Array(1).fill(0).concat(Array((atlasNumberRegions || 1) - 1).fill(255)),
          "I": [...Array(atlasNumberRegions).keys()],
          "labels": (validRegions[atlasName] || []).map(String) || [],
        }
    }
    return {lut, mapping, inverseMapping}
}

export function generateGameCommands(params: MultiplayerParametersType): GameCommands[]|undefined {
  try {
    const commands : GameCommands[] = [];
    if(!params.atlas) return;
    // 0. Game countdown
    commands.push({
      action: "countdown",
      duration: DEFAULT_COUNTDOWN_TIME
    });
    const {lut, mapping, inverseMapping} = getRandomLut(params.atlas)
    // 1. Load atlas
    commands.push({
      action: "load-atlas",
      atlas: params.atlas,
      lut, mapping, inverseMapping,
      duration: DEFAULT_LOAD_ATLAS_DURATION,
      blindMode: params.blindMode || false
    });

    // 2. Generate region IDs (replace with your actual region list logic)
    let regionPool = [...validRegions[params.atlas]];
    for (let i = 0; i < params.regionsNumber; i++) {
      // If pool is empty, refill with all regions (to allow repeats only after all have been used)
      if (regionPool.length === 0) {
        regionPool = [...validRegions[params.atlas]];
      }
      // Pick a random region from the pool
      const idx = Math.floor(Math.random() * regionPool.length);
      const regionId = regionPool[idx];
      commands.push({
        action: "guess",
        regionId,
        duration: params.durationPerRegion
      });
      // Remove from pool
      regionPool.splice(idx, 1);
    }

    return commands;
  } catch (error) {
      logger.error("Error creating commands:", error);
      return []
  }
}

// Calculate theoretical maximum score for a multiplayer game
export function calculateTheoreticalMaximumScore(gameRef: MultiplayerGame): number {
  // Get the number of guess commands (regions)
  const guessCommands = gameRef.commands?.filter(cmd => cmd.action === "guess") || [];
  const numRegions = guessCommands.length;

  if (numRegions === 0) {
    return 0;
  }

  let totalTheoreticalScore = 0;
  let currentBlindMode = false;

  // Process commands in order to track blind mode changes
  for (const command of gameRef.commands || []) {
    if (command.action === "load-atlas") {
      currentBlindMode = command.blindMode || false;
    } else if (command.action === "guess") {
      const duration = command.duration || 15; // Default to 15 seconds if not specified
      const baseScore = MAX_POINTS_PER_REGION + (duration * BONUS_POINTS_PER_SECOND);
      const scoreForRegion = currentBlindMode ? Math.floor(baseScore * BLIND_MODE_MULTIPLIER) : baseScore;
      totalTheoreticalScore += scoreForRegion;
    }
  }

  return totalTheoreticalScore;
}

async function handleLaunchGame(data: {
  sessionCode: string,
  sessionToken?: string,
  userToken?: string,
  userName: string
}) {
  try {
    const { sessionCode, sessionToken, userToken, userName } = data;
    const gameRef = games[sessionCode];
    if (!gameRef) {
      emitToUser(sessionCode, userName, "error", {message: "Lobby does not exist"})
      return {success: false};
    }
    updateGameActivity(sessionCode);
    
    // For classic challenges, skip session token validation and allow single-player
    if (!gameRef.isClassicChallenge) {
      // Check that the sessionToken matches the one in the multisessions table
      const sessionResult = await sql`
        SELECT session_token FROM multi_sessions WHERE session_code = ${sessionCode}
      ` as { session_token: string }[];
      if (sessionResult.length === 0 || sessionResult[0].session_token !== sessionToken) {
        emitToUser(sessionCode, userName, "error", {message: "Invalid session token for this lobby"})
        return {success: false};
      }

      // Get all users in the lobby from playerInfo
      const userList = Object.values(playerInfo)
        .filter(info => info.sessionCode === sessionCode)
        .map(info => info.userName)
        .filter(Boolean);
        
      if (userList.length <= 1) {
        emitToUser(sessionCode, userName, "error", {message: "Insufficient users in lobby"})
        return {success: false};
      }
    }
    
    if (gameRef.hasStarted) {
      emitToUser(sessionCode, userName, "error", {message: "Game already started"})
      return {success: false};
    }

    logger.info("Starting game", sessionCode)
    
    // Atomic game start to prevent race conditions
    const startResult = await atomicGameUpdate(sessionCode, async () => {
      // Double-check game hasn't already started
      if (gameRef.hasStarted) {
        throw new Error("Game has already started");
      }
      
      if(gameRef.parameters.commands){
        gameRef.commands = gameRef.parameters.commands;
        gameRef.totalGuessNumber = gameRef.commands.filter(command => command.action === "guess").length;
      } else {
        gameRef.commands = generateGameCommands(gameRef.parameters) || []
        gameRef.totalGuessNumber = gameRef.parameters.regionsNumber
      }
      
      // Calculate theoretical maximum score at game start
      gameRef.theoreticalMaximumScore = calculateTheoreticalMaximumScore(gameRef);
      
      gameRef.hasStarted = true;
      gameRef.duration = Date.now();
      
      return { success: true };
    });

    if (!startResult) {
      return { error: "Failed to start game due to concurrent access" };
    }

    if (startResult instanceof Error) {
      return { error: startResult.message };
    }

    // broadcast gamestart to all users and start
    broadcastToSession(sessionCode, 'game-start', {});
    sendNextCommand(gameRef);
    // A started game should be removed from public list
    emitPublicLobbiesUpdate();
    return {success: true}
  } catch (error) {
    logger.error("Error starting game:", error);
    emitToUser(data.sessionCode, data.userName, "error", { message: error instanceof Error ? error.message : String(error) })
  }
}

export async function sendNextCommand(gameRef: MultiplayerGame) {
  try {
    if (!gameRef.commands) return;

    // If all commands sent, stop
    if (gameRef.currentCommandIndex >= gameRef.commands.length) {
      // Handle classic challenge ending differently
      if (gameRef.isClassicChallenge && gameRef.classicChallengeId) {
        await handleClassicChallengeEnd(gameRef);
      } else {
        // Standard multiplayer game end
        const allScores = Object.values(gameRef.individualScores);
        const maxScore = Math.max(...allScores);
        Object.keys(gameRef.individualScores).forEach(userName => {
          emitToUser(gameRef.sessionCode, userName, "game-end", {
            scores: gameRef.individualScores,
            youWon: gameRef.individualScores[userName] === maxScore && maxScore > 0
          });
        });
      }
      clotureMultiplayerGame(gameRef)
      return;
    }

    gameRef.stepStartTime = Date.now();
    const command = gameRef.commands[gameRef.currentCommandIndex];
    
    // Compute duration for countdown commands with startTime
    let effectiveDuration = command.duration || 0;
    if (command.action === "countdown" && command.startTime) {
      effectiveDuration = await broadcastCountdown(gameRef, command)
    } else {
      // Broadcast command as-is
      broadcastToSession(gameRef.sessionCode, 'game-command', { command });
    }
    
    if(command.action == "load-atlas"){
      gameRef.currentAtlas = command.atlas || "";
      gameRef.isCurrentlyBlind = command.blindMode || false;
      gameRef.hasFinishedCountdown = true;
    }
    if(command.action == "guess") gameRef.currentRegionId = command.regionId || -1;
    
    // Broadcast scores to all users
    broadcastToSession(gameRef.sessionCode, 'all-scores-update', { scores: gameRef.individualScores, maximumScore: gameRef.theoreticalMaximumScore });

    // After the first command, check for additional atlases to preload
    if (gameRef.currentCommandIndex === 0) {
      const atlasesToPreload = getAtlasesToPreload(gameRef.commands);
      if (atlasesToPreload.length > 0) {
        // Send preload command immediately after the load-atlas command
        broadcastToSession(gameRef.sessionCode, 'game-command', { 
            command: "preload-atlas", 
            atlasesToPreload 
        });
      }
    }

    // Schedule next command with atomic command index increment
    if (gameRef.currentCommandIndex < gameRef.commands.length) {
      const nextDuration = (effectiveDuration || command.duration || 0) * 1000; // convert to ms
      gameRef.commandTimeout = setTimeout(async () => { 
        // Atomic command progression to prevent race conditions
        const progressResult = await atomicGameUpdate(gameRef.sessionCode, async () => {
          gameRef.currentCommandIndex += 1;
          return gameRef.currentCommandIndex;
        });
        
        if (progressResult !== null) {
          sendNextCommand(gameRef);
        } else {
          logger.warn(`Failed to progress command for game ${gameRef.sessionCode} due to concurrent access`);
        }
      }, nextDuration);
    }
  } catch (error) {
      logger.error("Error sending next command:", error);
  }
}

async function broadcastCountdown(gameRef: MultiplayerGame, command: GameCommands) {
  if (!command.startTime) return 0;
  let effectiveDuration = command.duration || 0;
  const startTime = new Date(command.startTime);
  const now = new Date();
  
  // Validate that startTime is in the future
  if (startTime.getTime() <= now.getTime()) {
    logger.error(`Game ${gameRef.sessionCode}: startTime ${command.startTime} is not in the future`);
    // Find creator name based on creatorId
    let creatorName: string | undefined = undefined;
    if (gameRef.creatorId !== undefined) {
      try {
      const creatorResult = await sql`
        SELECT username FROM users WHERE id = ${gameRef.creatorId}
      `;
      if (creatorResult.length > 0) {
        creatorName = creatorResult[0].username;
      }
      } catch (e) {
      logger.error("Error fetching creator name:", e);
      }
    }
    emitToUser(gameRef.sessionCode, creatorName || "", "error", {message: "Countdown start time must be in the future"});

    return 0;
  }
  
  const timeUntilStart = Math.max(0, Math.floor((startTime.getTime() - now.getTime()) / 1000));
  effectiveDuration = timeUntilStart;
  
  // Update the command with computed duration for client
  const modifiedCommand = { ...command, duration: effectiveDuration };
  broadcastToSession(gameRef.sessionCode, 'game-command', { command: modifiedCommand });

  return effectiveDuration;
}

async function handleUpdateParameters(data: {
  sessionCode: string,
  sessionToken: string,
  userName: string,
  parameters: Partial<MultiplayerParametersType>
}) {
  try {
    const { sessionCode, sessionToken, parameters } = data;
    const gameRef = games[sessionCode];
    if (!gameRef) {
      emitToUser(data.sessionCode, data.userName, "error", { message: "Lobby does not exist" })
      return;
    }
    updateGameActivity(sessionCode);
    
    // Check session token
    const sessionResult = await sql`
      SELECT session_token FROM multi_sessions WHERE session_code = ${sessionCode}
    ` as { session_token: string }[];
    if (sessionResult.length === 0 || sessionResult[0].session_token !== sessionToken) {
      emitToUser(data.sessionCode, data.userName, "error", { message: "Invalid session token for this lobby" })
      return;
    }

    gameRef.parameters = {
      ...gameRef.parameters,
      ...parameters
    };

    if(parameters.commands){
      const commands = cleanupExternalCommands(parameters.commands, gameRef.isChallenge || false)
      gameRef.parameters.commands = commands
      gameRef.parameters.regionsNumber = commands?.filter(command => command.action === "guess").length || 0;
      // If no atlas explicitly set, derive from first load-atlas action
      const firstLoad = commands?.find(c => c.action === 'load-atlas');
      if (firstLoad && firstLoad.atlas) {
        gameRef.parameters.atlas = firstLoad.atlas;
      }
      // If any load-atlas sets blindMode, use the last one as current default
      const lastBlind = [...(commands||[])].reverse().find(c => c.action==='load-atlas' && typeof c.blindMode === 'boolean');
      if (lastBlind && typeof lastBlind.blindMode === 'boolean') {
        gameRef.parameters.blindMode = lastBlind.blindMode as boolean;
      }
    } else {
      gameRef.parameters.commands = undefined
    }
    // Total duration: sum of commands or estimate
    if (gameRef.parameters.commands && gameRef.parameters.commands.length) {
      gameRef.parameters.totalDuration = gameRef.parameters.commands.reduce((total, command) => total + (command.duration || 0), 0);
    } else {
      const regions = gameRef.parameters.regionsNumber || 0;
      const dur = gameRef.parameters.durationPerRegion || 0;
      gameRef.parameters.totalDuration = (regions > 0 && dur > 0) ? (DEFAULT_LOAD_ATLAS_DURATION + regions * dur) : 0;
    }

    // If a public flag is provided, persist it
    const publicFlag = (parameters as any)?.public;
    if (typeof publicFlag === 'boolean') {
      await sql`UPDATE multi_sessions SET public = ${publicFlag} WHERE session_code = ${sessionCode}`;
    }
    
    // Broadcast updated parameters to all lobby members
    broadcastToSession(sessionCode, 'parameters-updated', { 
      parameters: gameRef.parameters 
    });
    // Push updated public lobbies (public flag/metadata may have changed)
    emitPublicLobbiesUpdate();
    return { success: true };
  } catch (error) {
    logger.error("Error updating parameters:", error);
    emitToUser(data.sessionCode, data.userName, "error", { message: error instanceof Error ? error.message : String(error) })
  }
}

async function handleValidateGuess(data: {
  sessionCode: string,
  userName: string,
  voxelProp: any,
  anonToken?: string,
  userToken?: string
}) : Promise<void> {
  try {
    const { sessionCode, userName, voxelProp, anonToken, userToken } = data;
    
    // Authentication check
    if (!verifyUserAccess(sessionCode, userName, userToken, anonToken)) {
      emitToUser(sessionCode, userName, "error", {message: "Authentication failed"})
      return;
    }

    const gameRef = games[sessionCode];
    if (!gameRef || !gameRef.commands) {
      emitToUser(sessionCode, userName, "error", {message: "Game not available"})
      return;
    }
    updateGameActivity(sessionCode);

    // Initialize hasAnswered structure if needed
    if(!gameRef.hasAnswered) gameRef.hasAnswered = {}
    if(!gameRef.hasAnswered[userName]) gameRef.hasAnswered[userName] = Array(gameRef.commands?.length || 0).fill(false);
    
    // Use per-user atomic check to prevent duplicate submissions from same user
    const userLockKey = `${sessionCode}:${userName}`;
    const userGuessResult = await atomicGameUpdate(userLockKey, async () => {
      // Check if this specific user has already answered this question
      if(gameRef.hasAnswered[userName][gameRef.currentCommandIndex]){
        throw new Error("Answer already given");
      }
      
      // Check if we're still in a guess phase
      if(!gameRef.commands || gameRef.commands[gameRef.currentCommandIndex].action != "guess"){
        throw new Error("Guess delay timed out");
      }

      // Mark this user as having answered (prevents duplicate from same user)
      gameRef.hasAnswered[userName][gameRef.currentCommandIndex] = true;
      return { success: true };
    });

    if (!userGuessResult) {
      emitToUser(sessionCode, userName, "error", {message: "Failed to process guess due to concurrent access"});
      return;
    }

    if (userGuessResult instanceof Error) {
      emitToUser(sessionCode, userName, "error", {message: userGuessResult.message});
      return;
    }

    // Validate coordinates (this can be done outside atomic section)
    const [x, y, z] = voxelProp.vox;
    const atlasImage: NVImage = imageRef[gameRef.currentAtlas];
    const atlasMetadata = imageMetadata[gameRef.currentAtlas];
    if (x < 0 || x >= atlasMetadata.nx || y < 0 || y >= atlasMetadata.ny || z < 0 || z >= atlasMetadata.nz) {
      emitToUser(sessionCode, userName, "error", {message: "Coordinates out of bound"})
      return;
    }
    const voxelValue: number = atlasImage.getValue(x, y, z);
    const isCorrect: boolean = voxelValue === gameRef.currentRegionId;
    let scoreIncrement = 0
    const command = gameRef.commands[gameRef.currentCommandIndex];
    const now = Date.now();
    const elapsed = (now - (gameRef.stepStartTime || 0));
    
    let minDistance: number = Infinity;
    let nearestCenter: number[] | undefined = undefined;
    let nearestBoundary: number[] | undefined = undefined;
    if (regionCenters[gameRef.currentAtlas] && regionCenters[gameRef.currentAtlas][gameRef.currentRegionId]) {
      const { distance, center, boundary } = getDistance(
        regionCenters[gameRef.currentAtlas][gameRef.currentRegionId],
        voxelProp,
        gameRef.currentAtlas,
        gameRef.currentRegionId
      );
      minDistance = distance;
      nearestCenter = center;
      nearestBoundary = boundary;
    }

    if (isCorrect) {
      let bonus = 0;
      minDistance = 0;
      if (gameRef.commands && gameRef.commands[gameRef.currentCommandIndex]) {
        if (gameRef.stepStartTime && command.duration) {
          const bonusTime = Math.max(0, command.duration - (elapsed/1000));
          bonus = Math.floor(bonusTime * BONUS_POINTS_PER_SECOND);
        }
      }
      scoreIncrement = MAX_POINTS_PER_REGION + bonus;
    } else {
      if (regionCenters[gameRef.currentAtlas] && regionCenters[gameRef.currentAtlas][gameRef.currentRegionId]) {
        // Calculate score based on distance
        if (minDistance <= MAX_PENALTY_DISTANCE) {
            scoreIncrement = Math.floor((1 - (minDistance / MAX_PENALTY_DISTANCE)) * MAX_POINTS_WITH_PENALTY);
        } else {
            scoreIncrement = 0; // No points for too far away
        }
      }
    }
    if(gameRef.isCurrentlyBlind) {
      scoreIncrement = Math.floor(scoreIncrement * BLIND_MODE_MULTIPLIER);
    }
    
    // Atomic update for score modifications to prevent race conditions
    const scoreUpdateResult = await atomicGameUpdate(`${sessionCode}:scores`, async () => {
      // Initialize score tracking for user if needed
      if (!gameRef.individualScores[userName]) gameRef.individualScores[userName] = 0;
      if (!gameRef.individualAttempts[userName]) gameRef.individualAttempts[userName] = 0;
      if (!gameRef.individualSuccesses[userName]) gameRef.individualSuccesses[userName] = 0;
      if (!gameRef.individualDurations[userName]) gameRef.individualDurations[userName] = [];
      if (!gameRef.individualCorrectDurations[userName]) gameRef.individualCorrectDurations[userName] = [];
      
      // Update scores atomically
      gameRef.individualScores[userName] += scoreIncrement;
      gameRef.individualAttempts[userName] += 1;
      if(isCorrect) gameRef.individualSuccesses[userName] += 1;
      gameRef.individualDurations[userName].push(elapsed);
      if(isCorrect) gameRef.individualCorrectDurations[userName].push(elapsed);
      
      return gameRef.individualScores[userName];
    });

    const finalScore = scoreUpdateResult || gameRef.individualScores[userName] || 0;
    
    // Broadcast score update to all users
    broadcastToSession(sessionCode, 'score-update', {
      user: userName,
      score: finalScore
    });
    
    emitToUser(sessionCode, userName, "guess-result", {
      isCorrect,
      scoreIncrement,
      totalScore: finalScore,
      distance: minDistance,
      nearestCenter,
      nearestBoundary
    })
  } catch (error) {
      logger.error("Error validating guess:", error);
      emitToUser(data.sessionCode, data.userName, "error", {message: error instanceof Error ? error.message : String(error) })
  }
}

// Get multiplayer session info for meta tag generation
export const getMultiplayerSessionStartDate = async (req: Request, res: Response) => {
  try {
    const { sessionCode } = req.params;
    
    if (!sessionCode || typeof sessionCode !== 'string' || sessionCode.length !== 8) {
      return res.status(400).json({ error: 'Invalid session code' });
    }
    
    // Check if game exists in memory first
    const gameRef = games[sessionCode];
    if (!gameRef) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    // Extract startTime from countdown command if it exists
    let startTime = null;
    let name = null;
    if (gameRef.parameters.commands) {
      const countdownCommand = gameRef.parameters.commands.find(cmd => cmd.action === 'countdown' && cmd.startTime);
      if (countdownCommand && countdownCommand.startTime) {
        startTime = countdownCommand.startTime;
      }
    }
    if (gameRef.name) {
      name = gameRef.name;
    }

    return res.status(200).json({
      startTime,
      name
    });
    
  } catch (error) {
    logger.error("getMultiplayerSessionStartDate error", error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const checkIfClassicChallenge = async (req: Request, res: Response) => {
  try {
    const { sessionCode } = req.params;
    const sessions = await sql`
      SELECT id, is_classic_challenge FROM multi_sessions WHERE session_code = ${sessionCode} LIMIT 1
    ` as { id: number; is_classic_challenge: boolean | null }[];
    if (!sessions.length) {
      return res.status(404).send({ isClassicChallenge: false });
    }
    const isClassic = sessions[0].is_classic_challenge === true ? true : false;
    res.status(200).send({ isClassicChallenge: isClassic, challengeId: isClassic ? sessions[0].id : null });
  } catch (error) {
    logger.error("Error checking if classic challenge:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export const getChallengeResults = async (req: Request, res: Response) => {
  try {
    const { challengeId } = req.params;
    
    // Try to get challenge details from multi_sessions first (for ongoing challenges)
    let challengeResult = await sql`
      SELECT 
        ms.id,
        ms.session_code,
        ms.name,
        ms.start_date,
        ms.end_date,
        u.username as creator_username
      FROM multi_sessions ms
      JOIN users u ON ms.creator_id = u.id
      WHERE ms.id = ${challengeId} AND ms.is_classic_challenge = true
    `;
    
    let sessionCode = null;
    
    // If not found in multi_sessions, try finished_sessions (for completed challenges where multi_sessions was deleted)
    if (!challengeResult.length) {
      challengeResult = await sql`
        SELECT 
          fs.classic_challenge_id as id,
          NULL as session_code,
          fs.name,
          fs.classic_challenge_start_date as start_date,
          fs.classic_challenge_end_date as end_date,
          'Unknown' as creator_username
        FROM finished_sessions fs
        WHERE fs.classic_challenge_id = ${challengeId}
        LIMIT 1
      `;
    } else {
      sessionCode = challengeResult[0].session_code;
    }
    
    if (!challengeResult.length) {
      return res.status(404).send({ message: "Challenge not found" });
    }
    
    const challenge = challengeResult[0];
    const now = new Date();
    const startDate = new Date(challenge.start_date);
    const endDate = new Date(challenge.end_date);
    
    // Determine challenge state
    let state: 'pending' | 'started' | 'finished';
    if (now < startDate) {
      state = 'pending';
    } else if (now > endDate) {
      state = 'finished';
    } else {
      state = 'started';
    }
    
    // Get participants (users who have finished sessions for this challenge)
    const participantsResult = await sql`
      SELECT
        fs.user_id,
        fs.score,
        fs.duration,
        fs.correct,
        fs.incorrect,
        fs.attempts,
        fs.avg_time_per_region,
        fs.created_at as completion_date,
        u.username,
        ROW_NUMBER() OVER (ORDER BY fs.score DESC, fs.avg_time_per_region ASC) as ranking
      FROM finished_sessions fs
      JOIN users u ON fs.user_id = u.id
      WHERE fs.classic_challenge_id = ${challengeId}
        AND u.publish_to_leaderboard = true
      ORDER BY fs.score DESC, fs.duration ASC
    `;
    
    res.status(200).send({
      challenge: {
        id: challenge.id,
        name: challenge.name,
        startDate: challenge.start_date,
        endDate: challenge.end_date,
        creator: challenge.creator_username
      },
      sessionCode,
      state,
      participants: participantsResult.map(p => ({
        userId: p.user_id,
        username: p.username,
        score: p.score,
        duration: p.duration,
        correct: p.correct,
        incorrect: p.incorrect,
        attempts: p.attempts,
        avgTimePerRegion: p.avg_time_per_region,
        completionDate: p.completion_date,
        ranking: p.ranking
      }))
    });
    
  } catch (error) {
    logger.error("Error getting challenge results:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export const getPastChallenges = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;
    const isAdmin = (req as AuthenticatedRequest).user?.admin;

    let challenges;
    if (isAdmin) {
      // For admins, get all past classic challenges from finished_sessions with their personal score and ranking
      challenges = await sql`
        SELECT DISTINCT
          fs.classic_challenge_id as id,
          fs.name,
          fs.classic_challenge_start_date as start_date,
          fs.classic_challenge_end_date as end_date,
          user_participation.score as user_score,
          user_participation.ranking as user_ranking,
          participant_counts.participant_count,
          MAX(fs.theoretical_maximum_score) as theoretical_maximum_score
        FROM finished_sessions fs
        LEFT JOIN (
          SELECT
            classic_challenge_id,
            user_id,
            score,
            ROW_NUMBER() OVER (PARTITION BY classic_challenge_id ORDER BY score DESC, avg_time_per_region ASC) as ranking
          FROM finished_sessions
          WHERE classic_challenge_id IS NOT NULL
        ) user_participation ON user_participation.classic_challenge_id = fs.classic_challenge_id AND user_participation.user_id = ${userId}
        LEFT JOIN (
          SELECT
            classic_challenge_id,
            COUNT(DISTINCT user_id) as participant_count
          FROM finished_sessions
          WHERE classic_challenge_id IS NOT NULL AND user_id IS NOT NULL
          GROUP BY classic_challenge_id
        ) participant_counts ON participant_counts.classic_challenge_id = fs.classic_challenge_id
        WHERE fs.classic_challenge_id IS NOT NULL
        GROUP BY fs.classic_challenge_id, fs.name, fs.classic_challenge_start_date, fs.classic_challenge_end_date, user_participation.score, user_participation.ranking, participant_counts.participant_count
        ORDER BY fs.classic_challenge_end_date DESC
      `;
    } else if (userId) {
      // For regular users, get challenges they participated in with their score and ranking
      challenges = await sql`
        SELECT DISTINCT
          fs.classic_challenge_id as id,
          fs.name,
          fs.classic_challenge_start_date as start_date,
          fs.classic_challenge_end_date as end_date,
          user_participation.score as user_score,
          user_participation.ranking as user_ranking,
          participant_counts.participant_count,
          MAX(fs.theoretical_maximum_score) as theoretical_maximum_score
        FROM finished_sessions fs
        JOIN (
          SELECT
            classic_challenge_id,
            user_id,
            score,
            ROW_NUMBER() OVER (PARTITION BY classic_challenge_id ORDER BY score DESC, avg_time_per_region ASC) as ranking
          FROM finished_sessions
          WHERE classic_challenge_id IS NOT NULL
        ) user_participation ON user_participation.classic_challenge_id = fs.classic_challenge_id AND user_participation.user_id = ${userId}
        LEFT JOIN (
          SELECT
            classic_challenge_id,
            COUNT(DISTINCT user_id) as participant_count
          FROM finished_sessions
          WHERE classic_challenge_id IS NOT NULL AND user_id IS NOT NULL
          GROUP BY classic_challenge_id
        ) participant_counts ON participant_counts.classic_challenge_id = fs.classic_challenge_id
        WHERE fs.user_id = ${userId} AND fs.classic_challenge_id IS NOT NULL
        GROUP BY fs.classic_challenge_id, fs.name, fs.classic_challenge_start_date, fs.classic_challenge_end_date, user_participation.score, user_participation.ranking, participant_counts.participant_count
        ORDER BY fs.classic_challenge_end_date DESC
      `;
    } else {
      // Not logged in, no past challenges
      return res.status(200).send({ challenges: [] });
    }

    res.status(200).send({ challenges });
  } catch (error) {
    logger.error("Error getting past challenges:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

setupInactiveGameCheck();

async function handleClassicChallengeEnd(gameRef: MultiplayerGame) {
  try {    
    if (!gameRef.classicChallengeId) return;

    // Persist final scores before computing rankings so the current user's row is present
    await saveFinishedSessions(gameRef);

    // Get rankings for all users who published to leaderboard
    const rankings = await getClassicChallengeRankings(gameRef.classicChallengeId);

    // For each user in the current game session
    for (const userName of Object.keys(gameRef.individualScores)) {
      // Skip anonymous users
      if (gameRef.anonymousUsernames && gameRef.anonymousUsernames.includes(userName)) {
        // Send basic end data for anonymous users
        emitToUser(gameRef.sessionCode, userName, "game-end", {
          scores: { [userName]: gameRef.individualScores[userName] },
          youWon: false, // Anonymous users don't get rankings
          isAnonymous: true
        });
        continue;
      }

      // Get user info
      const playerKey = `${gameRef.sessionCode}:${userName}`;
      const player = playerInfo[playerKey];
      if (!player || !player.userId) continue;

      const userScore = gameRef.individualScores[userName] || 0;

      // Send all rankings and user's score - frontend will handle publish_to_leaderboard logic
      emitToUser(gameRef.sessionCode, userName, "game-end", {
        scores: { [userName]: userScore },
        rankings: rankings,
        totalParticipants: rankings.length,
        isClassicChallenge: true
      });
    }
  } catch (error) {
    logger.error("Error handling classic challenge end:", error);
    // Fallback to basic game end
    const allScores = Object.values(gameRef.individualScores);
    const maxScore = Math.max(...allScores);
    Object.keys(gameRef.individualScores).forEach(userName => {
      emitToUser(gameRef.sessionCode, userName, "game-end", {
        scores: gameRef.individualScores,
        youWon: gameRef.individualScores[userName] === maxScore && maxScore > 0
      });
    });
  }
}

// Email opt-in for challenge participants
export const challengeEmailOptIn = async (req: Request, res: Response) => {
  try {
    const { challengeId } = req.params;
    const userId = (req as AuthenticatedRequest).user.id;

    // Check if the user has a finished session for this challenge
    const finishedSessionResult = await sql`
      SELECT id FROM finished_sessions
      WHERE user_id = ${userId} AND classic_challenge_id = ${challengeId}
    `;

    if (finishedSessionResult.length === 0) {
      return res.status(404).send({ message: "You have not participated in this challenge" });
    }

    // Update the email opt-in flag
    await sql`
      UPDATE finished_sessions
      SET send_classic_challenge_email = TRUE
      WHERE user_id = ${userId} AND classic_challenge_id = ${challengeId}
    `;

    res.status(200).send({ message: "Email opt-in successful" });

  } catch (error) {
    logger.error("Error opting in for challenge email:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export const sendChallengeResultsEmails = async (challengeId: number) => {
  try {
    // Get challenge details
    const challengeResult = await sql`
      SELECT
        ms.id,
        ms.session_code,
        ms.name,
        ms.start_date,
        ms.end_date,
        u.username as creator_username
      FROM multi_sessions ms
      JOIN users u ON ms.creator_id = u.id
      WHERE ms.id = ${challengeId} AND ms.is_classic_challenge = true
    `;

    if (!challengeResult.length) {
      logger.warn(`Challenge ${challengeId} not found for email sending`);
      return;
    }

    const challenge = challengeResult[0];

    // Get participants who opted in for emails
    const participantsResult = await sql`
      SELECT
        fs.score,
        fs.duration,
        fs.correct,
        fs.incorrect,
        fs.attempts,
        fs.avg_time_per_region,
        fs.created_at as completion_date,
        u.username,
        u.email,
        u.firstname,
        u.lastname,
        u.language,
        ROW_NUMBER() OVER (ORDER BY fs.score DESC, fs.avg_time_per_region ASC) as ranking
      FROM finished_sessions fs
      JOIN users u ON fs.user_id = u.id
      WHERE fs.classic_challenge_id = ${challengeId}
        AND fs.send_classic_challenge_email = TRUE
      ORDER BY fs.score DESC, fs.duration ASC
    `;

    if (participantsResult.length === 0) {
      logger.info(`No opt-in participants for challenge ${challengeId}`);
      return;
    }

    // Import email function
    const backendI18n = (await import("./backend-i18n.ts")).default;

    // Send email to each participant
    for (const participant of participantsResult) {
      const lang = participant.language || 'fr';

      const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US');
      };

      const subject = backendI18n.t('email_subject', {
        lng: lang,
        challengeName: challenge.name || backendI18n.t('classic_challenge', { lng: lang })
      });

      const message = `
        <head>
            <style>
                body { background-color:#363636; width:100%; font-family: Open Sans,system-ui,Arial,Helvetica,sans-serif; color: #d9dddc; text-align:left; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .logo { width: 64px; height: 64px; }
                .title { font-size: 32px; margin: 15px 0; color: #ffffff; }
                .challenge-info { background-color: #2a2a2a; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
                .user-results { background-color: #1a1a1a; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
                .result-item { margin-bottom: 10px; }
                .ranking { font-size: 24px; font-weight: bold; color: #4CAF50; }
                .footer { text-align: center; font-size: 14px; color: #888; margin-top: 30px; }
                .label { font-weight: bold; color: #ffffff; }
                .value { color: #d9dddc; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <a href="https://www.neuroguessr.org"><img src="cid:logo@neuroguessr" class="logo" alt="NeuroGuessr Logo"></a>
                    <h1 class="title"><a href="https://www.neuroguessr.org" style="color: #ffffff; text-decoration: none;">NeuroGuessr</a></h1>
                </div>

                <div class="challenge-info">
                    <h2>${backendI18n.t('email_challenge_results', { lng: lang })}</h2>
                    <p><span class="label">${backendI18n.t('email_challenge_name', { lng: lang })}:</span> <span class="value">${challenge.name || backendI18n.t('classic_challenge', { lng: lang })}</span></p>
                    <p><span class="label">${backendI18n.t('created_by', { lng: lang })}:</span> <span class="value">${challenge.creator_username}</span></p>
                    <p><span class="label">${backendI18n.t('email_start_date', { lng: lang })}:</span> <span class="value">${formatDate(challenge.start_date)}</span></p>
                    <p><span class="label">${backendI18n.t('email_end_date', { lng: lang })}:</span> <span class="value">${formatDate(challenge.end_date)}</span></p>
                </div>

                <div class="user-results">
                    <h3>${backendI18n.t('email_your_participation', { lng: lang })}</h3>
                    <div class="result-item">
                        <span class="label">${backendI18n.t('email_your_ranking', { lng: lang })}:</span>
                        <span class="ranking">
                            ${participant.ranking === 1 ? '🏆 ' : participant.ranking === 2 ? '🥈 ' : participant.ranking === 3 ? '🥉 ' : ''}
                            #${participant.ranking}
                        </span>
                    </div>
                    <div class="result-item">
                        <span class="label">${backendI18n.t('email_your_score', { lng: lang })}:</span> <span class="value">${participant.score}</span>
                    </div>
                    <div class="result-item">
                        <span class="label">${backendI18n.t('email_time_per_region', { lng: lang })}:</span> <span class="value">${Math.round(participant.avg_time_per_region / 100) / 10}s</span>
                    </div>
                    <div class="result-item">
                        <span class="label">${backendI18n.t('email_completed_at', { lng: lang })}:</span> <span class="value">${formatDate(participant.completion_date)}</span>
                    </div>
                </div>

                <div class="footer">
                    <p>${backendI18n.t('email_footer', { lng: lang })}</p>
                </div>
            </div>
        </body>
      `;

      try {
        await sendEmail(participant.email, subject, message);
        logger.info(`Challenge results email sent to ${participant.email} for challenge ${challengeId}`);
      } catch (emailError) {
        logger.error(`Failed to send challenge results email to ${participant.email}:`, emailError);
      }
    }

  } catch (error) {
    logger.error(`Error sending challenge results emails for challenge ${challengeId}:`, error);
  }
};
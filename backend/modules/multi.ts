import type { AuthenticatedRequest } from "../interfaces/requests.interfaces.ts";
import { sql } from "./database_init.ts";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
type Config = import("../interfaces/config.interfaces.ts").Config;
import configJson from '../config.json' with { type: "json" };
export const config: Config = configJson;
import { imageMetadata, imageRef, regionCenters, validRegions } from "./game.ts";
import { NVImage } from "@niivue/niivue";
import { MultiSession } from "interfaces/database.interfaces.ts";
import { GameCommands, MultiplayerGame, MultiplayerParametersType, PlayerInfo, PersistentGameState, ColorMap, JoinLobbyData, ChatMessage } from "interfaces/multi.interfaces.ts";
import crypto from "crypto";
import { getIO } from "./socket.io.ts";
import { Socket } from "socket.io";
import Joi from "joi";
import { logger } from "./logging.ts";
import { getDistance } from "./utils_compute.ts";
import { extractPersistentState } from "./multi_challenge.ts";
import { emitPublicLobbiesUpdate } from "./multi_public.ts";
import { cleanupExternalCommands, cleanupGame, clotureMultiplayerGame, 
  handleDestroySession, saveFinishedSessions, setupInactiveGameCheck} from "./multi_cleanup.ts";
import { logoString } from "./email.ts";
import { atomicGameUpdate, generateCode, isReservedSessionCode } from "./socket.ts";
import { handleClassicChallengeEnd, joinClassicChallenge } from "./multi_classic_challenge.ts";
import type { PastRegion } from "../../frontend/src/types/types.tsx";
import { scheduleBotJoinStandard, scheduleBotGuess } from "./multi_bot.ts";

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

// verification routines
const externalGameCommandsSchema = Joi.array().items(
  Joi.object({
    action: Joi.string().valid("load-atlas", "guess", "countdown").required(),
    atlas: Joi.string().optional(),
    regionId: Joi.number().integer().optional(),
    duration: Joi.number().integer().min(1).when('action', {
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


export const multiJoinLobby = async (socket: Socket, data: JoinLobbyData) => {
  const clientIP = socket.handshake.address || 'unknown';
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
      SELECT * FROM multi_sessions WHERE session_code = ${data.sessionCode}
    ` as MultiSession[];

    if (!sessionResult.length) {
      socket.emit('error', { message: "Lobby does not exist" });
      return;
    }

    const sessionData = sessionResult[0];
    const isClassicChallenge = (sessionData.is_classic_challenge === true && sessionData.is_classic_challenge_original_entry === true) ? true : false;

    if (isClassicChallenge) {
      await joinClassicChallenge(socket, sessionData, data);
    } else {
      await joinMultiplayer(socket, data)
    }

    const duration = Date.now() - startTime;
    logger.info('Join lobby successful', {
      socketId: socket.id,
      sessionCode: data.sessionCode,
      userName: data.userName,
      isAnonymous: data.isAnonymous,
      clientIP,
      duration: `${duration}ms`
    });

  } catch (error) {
    logger.error("Socket join error:", error);
    socket.emit('error', { message: "Internal server error" });
  }
};

export const multiLeaveLobby = async (socket: Socket, userName: string) => {
  const info = socketInfo[socket.id];
  if (!info) return;
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
}

const joinMultiplayer = async (socket: Socket, data: JoinLobbyData) => {
  const result = await joinLobby(socket, data.sessionCode, data.userName, data.isAnonymous, data.token, data.anonToken);

  if (result.error) {
    socket.emit('error', { message: result.error });
    return;
  }

  // Store socketInfo for lookups during disconnects
  socketInfo[socket.id] = { 
    sessionCode: data.sessionCode, 
    userName: data.userName 
  };

  // Send initial data to client
  if (result.anonToken) {
    socket.emit('anon-token', { anonToken: result.anonToken });
  }
}

// Convert your existing functions to use Socket.io
export async function joinLobby(
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
      return { error: "Invalid token provided" };
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
      return { error: `Failed to update anonymous usernames` };
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

export async function getMultiUniqueCode(): Promise<string> {
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
    const sessionCode = await getMultiUniqueCode();
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
    scheduleBotJoinStandard(sessionCode);
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
  let id: number | null = null;
  
  try {
    const sessionResult = await sql`
      SELECT id, is_challenge, persistent_config, is_classic_challenge, start_date, end_date, name 
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
      id = sessionResult[0].id || null;
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
        lastActivity: Date.now(), // Update activity time
        chatMessages: []
      };
      
      games[sessionCode] = baseGameState;
      return;
    } catch (parseError) {
      logger.error("Error parsing persistent config, creating default session:", parseError);
    }
  }
  
  if(id === null){
    logger.error("Did not find game:", sessionCode);
    return;
  }

  // Create default session (fallback or non-challenge)
  games[sessionCode] = {
    id: id,
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
    chatMessages: [],
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
    
    if (!rejoiningMode && gameRef.commands && gameRef.currentCommandIndex < gameRef.commands.length) {
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
export function handleDisconnect(socketId: string) {
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
            return { shouldDestroyGame: true, player };
          } else {
            if(gameRef.hasStarted){
              // save session as finished if it is a started classic challenge 
              saveFinishedSessions(gameRef)
            } else {
              // No active game, remove the session from multi_sessions if it exists 
              // (cleanup for users who started a single game but never got to the point of having an active game state)
              await sql`
                DELETE FROM multi_sessions
                WHERE session_code = ${gameRef.sessionCode}
                AND is_challenge = false
                AND is_classic_challenge_original_entry = false
              `;
            }
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
export async function handleExplicitUserLeave(sessionCode: string, userName: string, playerKey: string) {
  const gameRef = games[sessionCode];
  
  await atomicGameUpdate(playerKey, async () => {
    delete socketClients[playerKey];
    
    const player = playerInfo[playerKey];
    if (!player) return { shouldBroadcastLeave: false };
    
    // Handle creator leaving before game starts
    if(gameRef.isClassicChallenge){
      if(gameRef.classicChallengeId && gameRef && gameRef.creatorId && player?.userId && gameRef.creatorId == player.userId){
        // should destroy the classic challenge and store the results to finished sessions
        return { shouldDestroyGame: true, player };
      } else {
        if(gameRef.hasStarted){
          // save session as finished if it is a started classic challenge 
          saveFinishedSessions(gameRef)
        }
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

// Helper to broadcast to all users in a session (one message per user, to avoid duplicates for multi-tab users)
export function broadcastToSession(sessionCode: string, event: string, data: any) {
  for (const playerKey in socketClients) {
    if (playerKey.startsWith(`${sessionCode}:`)) {
      const socketIds = socketClients[playerKey];
      if (socketIds.length > 0) {
        const socket = getIO().sockets.sockets.get(socketIds[0]);
        if (socket) {
          socket.emit(event, data);
        }
      }
    }
  }
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

    if (params.commands && params.commands.length > 0) {
      // Use predefined commands if provided
      return params.commands;
    }
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

export async function handleLaunchGame(data: {
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
        
      const isDev = process.env.NODE_ENV !== 'production';
      if (!isDev && userList.length <= 1) {
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

// Record missing clicks for players who didn't answer
async function recordMissingClicks(gameRef: MultiplayerGame, commandIndex: number) {
  try {
    // Get all players in this game
    const playersInGame = Object.keys(socketClients)
      .filter(key => key.startsWith(`${gameRef.sessionCode}:`))
      .map(key => key.split(':')[1]);

    // Find players who haven't answered this question
    for (const userName of playersInGame) {
      const hasUserAnswered = gameRef.hasAnswered?.[userName]?.[commandIndex];
      
      if (!hasUserAnswered) {
        // This player didn't click - record a missing click
        const playerKey = `${gameRef.sessionCode}:${userName}`;
        const player = playerInfo[playerKey];
        
        // Get the command to know which region was asked
        const command = gameRef.commands?.[commandIndex];
        if (!command || command.action !== 'guess') continue;

        const timeTaken: number = command.duration || 0;
        const atlasName: string = command.atlas || gameRef.currentAtlas;
        const isBlind: boolean = command.blindMode || false;
        const regionId: number | null = command.regionId ?? null;

        await sql`
          INSERT INTO individual_clicks (
            is_authenticated,
            user_id,
            multiplayer_session_id,
            multiplayer_is_challenge,
            multiplayer_is_classic_challenge,
            multiplayer_classic_challenge_id,
            command_index,
            atlas,
            blind_mode,
            region_id,
            time_taken,
            is_correct,
            score_increment,
            attempts,
            has_clicked
          ) VALUES (
            ${player?.userId !== undefined},
            ${player?.userId || null},
            ${gameRef.id},
            ${gameRef.isChallenge || false},
            ${gameRef.isClassicChallenge || false},
            ${gameRef.classicChallengeId || null},
            ${commandIndex},
            ${atlasName},
            ${isBlind},
            ${regionId},
            ${timeTaken},
            ${false},
            ${0},
            ${(gameRef.individualAttempts[userName] || 0) + 1},
            ${false}
          )
        `;
        
        logger.info(`Recorded missing click for player ${userName} on command ${commandIndex}`);
      }
    }
  } catch (error) {
    logger.error("Error recording missing clicks:", error);
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
    if(command.action == "guess") {
      gameRef.currentRegionId = command.regionId || -1;
      scheduleBotGuess(gameRef, gameRef.currentCommandIndex);
    }
    
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
          // Check if timeout was already cleared (e.g., by classic challenge auto-advance)
          if (gameRef.commandTimeout === undefined) {
            return null; // Timeout was cancelled, skip progression
          }

          // Record missing clicks before progressing
          await recordMissingClicks(gameRef, gameRef.currentCommandIndex);
        
          gameRef.currentCommandIndex += 1;
          gameRef.commandTimeout = undefined;
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

export async function handleUpdateParameters(data: {
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

export async function handleValidateGuess(data: {
  sessionCode: string,
  userName: string,
  voxelProp: any,
  anonToken?: string,
  userToken?: string,
  pastRegionId?: number
}) : Promise<void> {
  try {
    const { sessionCode, userName, voxelProp, anonToken, userToken, pastRegionId } = data;
    
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

    const playerKey = `${sessionCode}:${userName}`;
    const player = playerInfo[playerKey];

    await sql`
        INSERT INTO individual_clicks (
            is_authenticated,
            user_id,
            multiplayer_session_id,
            multiplayer_is_challenge,
            multiplayer_is_classic_challenge,
            multiplayer_classic_challenge_id,
            command_index,
            atlas,
            blind_mode,
            region_id,
            clicked_x,
            clicked_y,
            clicked_z,
            clicked_x_mm,
            clicked_y_mm,
            clicked_z_mm,
            nearest_center_x_mm,
            nearest_center_y_mm,
            nearest_center_z_mm,
            boundary_point_x_mm,
            boundary_point_y_mm,
            boundary_point_z_mm,
            distance_to_target,
            time_taken,
            is_correct,
            score_increment,
            attempts,
            has_clicked
        ) VALUES (
            ${player?.userId !== undefined},
            ${player?.userId || null},
            ${gameRef.id},
            ${gameRef.isChallenge || false},
            ${gameRef.isClassicChallenge || false},
            ${gameRef.classicChallengeId || null},
            ${gameRef.currentCommandIndex},
            ${gameRef.currentAtlas},
            ${gameRef.isCurrentlyBlind},
            ${gameRef.currentRegionId},
            ${x},
            ${y},
            ${z},
            ${voxelProp.mm[0] ?? null},
            ${voxelProp.mm[1] ?? null},
            ${voxelProp.mm[2] ?? null},
            ${nearestCenter ? nearestCenter[0] : null},
            ${nearestCenter ? nearestCenter[1] : null},
            ${nearestCenter ? nearestCenter[2] : null},
            ${nearestBoundary ? nearestBoundary[0] : null},
            ${nearestBoundary ? nearestBoundary[1] : null},
            ${nearestBoundary ? nearestBoundary[2] : null},
            ${minDistance === Infinity ? null : minDistance},
            ${elapsed},
            ${isCorrect},
            ${scoreIncrement},
            ${(gameRef.individualAttempts[userName] || 0) + 1},
            ${true}
        )
    `;
    
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
      attempts: gameRef.individualAttempts[userName] || 0,
      regionCompleted: isCorrect,
      pastRegionId,
      regionCenter: nearestCenter,
      regionBoundary: nearestBoundary,
      clickedPosition: voxelProp
    })
    
    // For classic challenges, automatically advance to the next region
    if (gameRef.isClassicChallenge) {
      // Atomically clear timeout and advance to prevent race conditions
      const progressResult = await atomicGameUpdate(gameRef.sessionCode, async () => {
        // Clear the existing timeout inside atomic section
        if (gameRef.commandTimeout) {
          clearTimeout(gameRef.commandTimeout);
          gameRef.commandTimeout = undefined;
        }
        
        gameRef.currentCommandIndex += 1;
        return gameRef.currentCommandIndex;
      });
      
      if (progressResult !== null) {
        sendNextCommand(gameRef);
      } else {
        logger.warn(`Failed to progress command for classic challenge ${gameRef.sessionCode} due to concurrent access`);
      }
    }
    
  } catch (error) {
      logger.error("Error validating guess:", error);
      emitToUser(data.sessionCode, data.userName, "error", {message: error instanceof Error ? error.message : String(error) })
  }
}

export async function replayMultiSession (req: Request, res: Response) {
    const { challengeId } = req.params;
    const userId = (req as any).user.id;

    // Get individual clicks for this user and challenge, ordered by command_index
    const clicks = await sql`
        SELECT 
            command_index,
            atlas,
            blind_mode,
            region_id,
            clicked_x,
            clicked_y,
            clicked_z,
            clicked_x_mm,
            clicked_y_mm,
            clicked_z_mm,
            nearest_center_x_mm,
            nearest_center_y_mm,
            nearest_center_z_mm,
            boundary_point_x_mm,
            boundary_point_y_mm,
            boundary_point_z_mm,
            distance_to_target,
            is_correct,
            score_increment,
            time_taken,
            has_clicked
        FROM individual_clicks
        WHERE user_id = ${userId}
        AND multiplayer_classic_challenge_id = ${challengeId}
        ORDER BY command_index ASC
    `;

    if (clicks.length === 0) {
        return res.status(404).json({ error: 'No replay data found' });
    }

    // Transform clicks into pastRegions format
    const pastRegions : PastRegion[] = clicks.map((click: any, index: number) => ({
        id: index,
        regionId: click.region_id,
        atlas: click.atlas,
        target: click.region_id,
        clickedPosition: click.has_clicked ? {
            mm: [click.clicked_x_mm, click.clicked_y_mm, click.clicked_z_mm],
            vox: [click.clicked_x, click.clicked_y, click.clicked_z]
        } : undefined,
        regionCenter: click.nearest_center_x_mm !== null ? [
            click.nearest_center_x_mm,
            click.nearest_center_y_mm,
            click.nearest_center_z_mm
        ] : undefined,
        regionBoundary: click.boundary_point_x_mm !== null ? [
            click.boundary_point_x_mm,
            click.boundary_point_y_mm,
            click.boundary_point_z_mm
        ] : undefined,
        distance: click.distance_to_target,
        isCorrect: click.is_correct,
        score: click.score_increment,
        scoreIncrement: click.score_increment
    }));

    // Get atlas and blind mode from first click
    const atlas = clicks[0].atlas;
    const blindMode = clicks[0].blind_mode;

    // Get challenge name and creation date from multi_sessions
    const challenge = await sql`
        SELECT name, start_date FROM multi_sessions
        WHERE id = ${challengeId}
        LIMIT 1
    `;

    const sessionName = challenge.length > 0 && challenge[0].name ? challenge[0].name : `Challenge ${challengeId}`;
    const sessionDate = challenge.length > 0 ? challenge[0].start_date : null;

    res.json({
        pastRegions,
        atlas,
        blindMode,
        sessionName,
        sessionDate
    });
}

// Replay a multiplayer session by finished_session id
export async function replayMultiSessionById(req: Request, res: Response) {
    const { sessionId } = req.params;
    const userId = (req as any).user.id;

    // Verify the session belongs to this user
    const session = await sql`
        SELECT id, atlas, blind_mode, score, correct, created_at FROM finished_sessions
        WHERE id = ${sessionId} AND user_id = ${userId} AND mode = 'multiplayer'
        LIMIT 1
    `;
    if (session.length === 0) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const sessionAtlas: string = session[0].atlas;
    const sessionScore: number = session[0].score;
    const sessionCorrect: number = session[0].correct;

    // Find the matching multiplayer_session_id directly in individual_clicks
    // by matching user + atlas + total score + correct count
    const matchResult = await sql`
        SELECT multiplayer_session_id
        FROM individual_clicks
        WHERE user_id = ${userId}
          AND atlas = ${sessionAtlas}
          AND multiplayer_session_id IS NOT NULL
        GROUP BY multiplayer_session_id
        HAVING SUM(score_increment) = ${sessionScore}
           AND SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) = ${sessionCorrect}
        ORDER BY multiplayer_session_id DESC
        LIMIT 1
    `;

    const multiSessionId = matchResult.length > 0 ? matchResult[0].multiplayer_session_id : null;

    if (!multiSessionId) {
        return res.status(404).json({ error: 'No replay data found' });
    }

    const clicks = await sql`
        SELECT
            command_index, atlas, blind_mode, region_id,
            clicked_x, clicked_y, clicked_z,
            clicked_x_mm, clicked_y_mm, clicked_z_mm,
            nearest_center_x_mm, nearest_center_y_mm, nearest_center_z_mm,
            boundary_point_x_mm, boundary_point_y_mm, boundary_point_z_mm,
            distance_to_target, is_correct, score_increment, time_taken, has_clicked
        FROM individual_clicks
        WHERE user_id = ${userId}
          AND multiplayer_session_id = ${multiSessionId}
        ORDER BY command_index ASC
    `;

    if (clicks.length === 0) {
        return res.status(404).json({ error: 'No replay data found' });
    }

    const pastRegions: PastRegion[] = clicks.map((click: any, index: number) => ({
        id: index,
        regionId: click.region_id,
        atlas: click.atlas,
        target: click.region_id,
        clickedPosition: click.has_clicked ? {
            mm: [click.clicked_x_mm, click.clicked_y_mm, click.clicked_z_mm],
            vox: [click.clicked_x, click.clicked_y, click.clicked_z]
        } : undefined,
        regionCenter: click.nearest_center_x_mm !== null ? [
            click.nearest_center_x_mm,
            click.nearest_center_y_mm,
            click.nearest_center_z_mm
        ] : undefined,
        regionBoundary: click.boundary_point_x_mm !== null ? [
            click.boundary_point_x_mm,
            click.boundary_point_y_mm,
            click.boundary_point_z_mm
        ] : undefined,
        distance: click.distance_to_target,
        isCorrect: click.is_correct,
        score: click.score_increment,
        scoreIncrement: click.score_increment
    }));

    const atlas = clicks[0].atlas;
    const blindMode = clicks[0].blind_mode;
    const sessionDate = session[0].created_at;

    // Use multiplayer_session_id as sessionName (numeric ID)
    const sessionName = `Session ${multiSessionId}`;

    res.json({ pastRegions, atlas, blindMode, sessionName, sessionDate });
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

// Replay a single player session (streak/time-attack) by finished_session id
export async function replaySingleSessionById(req: Request, res: Response) {
    const { sessionId } = req.params;
    const userId = (req as any).user.id;

    try {
        // Verify the session belongs to this user and is a singleplayer mode
        const session = await sql`
            SELECT id, mode, atlas, blind_mode, score, correct, incorrect, created_at FROM finished_sessions
            WHERE id = ${sessionId} AND user_id = ${userId} AND mode IN ('streak', 'time-attack')
            LIMIT 1
        `;
        if (session.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const sessionMode: string = session[0].mode;
        const sessionDate = session[0].created_at;

        // Get individual clicks linked to this session via singleplayer_session_id
        const clicks = await sql`
            SELECT
                command_index, atlas, blind_mode, region_id,
                clicked_x, clicked_y, clicked_z,
                clicked_x_mm, clicked_y_mm, clicked_z_mm,
                nearest_center_x_mm, nearest_center_y_mm, nearest_center_z_mm,
                boundary_point_x_mm, boundary_point_y_mm, boundary_point_z_mm,
                distance_to_target, is_correct, score_increment, time_taken, has_clicked
            FROM individual_clicks
            WHERE singleplayer_session_id = ${sessionId}
            ORDER BY command_index ASC
        `;

        if (clicks.length === 0) {
            return res.status(404).json({ error: 'No replay data found' });
        }

        const pastRegions: PastRegion[] = clicks.map((click: any, index: number) => ({
            id: index,
            regionId: click.region_id,
            atlas: click.atlas,
            target: click.region_id,
            clickedPosition: click.has_clicked ? {
                mm: [click.clicked_x_mm, click.clicked_y_mm, click.clicked_z_mm],
                vox: [click.clicked_x, click.clicked_y, click.clicked_z]
            } : undefined,
            regionCenter: click.nearest_center_x_mm !== null ? [
                click.nearest_center_x_mm,
                click.nearest_center_y_mm,
                click.nearest_center_z_mm
            ] : undefined,
            regionBoundary: click.boundary_point_x_mm !== null ? [
                click.boundary_point_x_mm,
                click.boundary_point_y_mm,
                click.boundary_point_z_mm
            ] : undefined,
            distance: click.distance_to_target,
            isCorrect: click.is_correct,
            score: click.score_increment,
            scoreIncrement: click.score_increment
        }));

        const atlas = clicks[0].atlas;
        const blindMode = clicks[0].blind_mode;
        const modeLabel = sessionMode === 'time-attack' ? 'Time Attack' : 'Streak';
        const sessionName = `${modeLabel}`;

        res.json({ pastRegions, atlas, blindMode, sessionName, sessionDate });
    } catch (error) {
        logger.error("Error replaying single player session:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

setupInactiveGameCheck();

export async function handleChatMessage(data: {
  sessionCode: string;
  userToken: string;
  message: string;
}): Promise<void> {
  try {
    const { sessionCode, userToken, message } = data;

    // Only authenticated (non-anonymous) users may send chat messages
    let userName: string;
    let userId: number;
    try {
      const jwtPayload: any = jwt.verify(userToken, config.jwt_secret);
      if (!jwtPayload?.username || !jwtPayload?.id) {
        return;
      }
      userName = String(jwtPayload.username);
      userId = Number(jwtPayload.id);
    } catch {
      return;
    }

    // Sender must be in the session
    const playerKey = `${sessionCode}:${userName}`;
    if (!playerInfo[playerKey]) return;

    const gameRef = games[sessionCode];
    if (!gameRef || gameRef.hasEnded) return;

    // Sanitise: trim and limit length
    const trimmed = message?.trim?.();
    if (!trimmed || trimmed.length === 0 || trimmed.length > 500) return;

    const chatMsg: ChatMessage = {
      userName,
      userId,
      message: trimmed,
      timestamp: Date.now()
    };

    gameRef.chatMessages.push(chatMsg);
    updateGameActivity(sessionCode);

    // Broadcast to all players in the session
    broadcastToSession(sessionCode, 'chat-message', chatMsg);

    logger.info(`Chat in game ${sessionCode} from ${userName}: ${trimmed.substring(0, 80)}`);
  } catch (error) {
    logger.error('handleChatMessage error:', error);
  }
}


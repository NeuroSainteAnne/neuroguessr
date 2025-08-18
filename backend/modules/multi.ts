import type { AuthenticatedRequest, MultiValidateGuessRequest, UpdateMultiGameRequest } from "../interfaces/requests.interfaces.ts";
import { sql } from "./database_init.ts";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
type Config = import("../interfaces/config.interfaces.ts").Config;
import configJson from '../config.json' with { type: "json" };
const config: Config = configJson;
import { imageMetadata, imageRef, regionCenters, validRegions } from "./game.ts";
import { NVImage } from "@niivue/niivue";
import { MultiSession, User } from "interfaces/database.interfaces.ts";
import { ExternalGameCommands, GameCommands, MultiplayerGame, MultiplayerParametersType, PlayerInfo, PersistentGameState, Recurrence } from "interfaces/multi.interfaces.ts";
import crypto from "crypto";
import { getIO } from "./socket.io.ts";
import { Socket } from "socket.io";
import Joi from "joi";
import { logger } from "./logging.ts";
import { getDistance } from "./utils_compute.ts";

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

const validateExternalGameCommands = (commands: unknown): Joi.ValidationResult => {
  return externalGameCommandsSchema.validate(commands, { abortEarly: false });
};

const DEFAULT_REGION_NUMBER = 15;
const DEFAULT_DURATION_PER_REGION = 15;
const DEFAULT_GAMEOVER_ON_ERROR = false;
const DEFAULT_LOAD_ATLAS_DURATION = 5; // seconds to load atlas
const DEFAULT_COUNTDOWN_TIME = 5; // 5 seconds countdown before game start
const MAX_POINTS_PER_REGION = 50; // 1000 total points / 20 regions
const BONUS_POINTS_PER_SECOND = 1; // nombre de points bonus par seconde restante (max 100*10 = 1000 points)
const MAX_POINTS_WITH_PENALTY = 30 // 30 points max if clicked outside the region
const MAX_PENALTY_DISTANCE = 100; // Arbitrary distance in mm for max penalty (0 points)
const INACTIVE_GAME_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const BLIND_MODE_MULTIPLIER = 1.5; // Multiplier for points in blind mode
const DELAY_FOR_CHALLENGES_IN_PUBLIC = 5 * 60 * 1000; // 5 minutes

// In-memory maps
const socketClients: Record<string, string[]> = {}; // sessionCode:userName -> socketIds[]
const games: Record<string, MultiplayerGame> = {};
const playerInfo: Record<string, PlayerInfo> = {};
const socketInfo: Record<string, {sessionCode: string, userName: string}> = {};

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

        // Rest of join-lobby logic 
        const result = await joinLobby(socket, sessionCode, userName, isAnonymous, token, anonToken);
        
        const duration = Date.now() - startTime;
        if (result.success) {
          logger.info('Join lobby successful', {
            socketId: socket.id,
            sessionCode,
            userName,
            isAnonymous,
            clientIP,
            duration: `${duration}ms`
          });
        } else {
          logger.warn('Join lobby failed', {
            socketId: socket.id,
            sessionCode,
            userName,
            error: result.error || 'Unknown error',
            clientIP,
            duration: `${duration}ms`
          });
        }
        
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

    // Handle save as challenge
    socket.on('save-as-challenge', async (data: {
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
        const result = await handleSaveAsChallenge({...data, userName: info.userName});
      } catch (error) {
        logger.error("Save as challenge error:", error);
        socket.emit('error', { message: "Error saving challenge" });
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

  // Prevent new users from joining if countdown has finished (allow rejoining users)
  if (gameRef.hasFinishedCountdown && !rejoiningMode) {
    return { error: "Game has already started, cannot join lobby" };
  }

  if (isAnonymous && !rejoiningMode) {
    // Only add to anonymous usernames if not already present
    if (!gameRef.anonymousUsernames.includes(finalUserName)) {
      gameRef.anonymousUsernames.push(finalUserName);
    }
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

  // Initialize user in lobby
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

function updateGameActivity(sessionCode: string) {
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
  
  try {
    const sessionResult = await sql`
      SELECT is_challenge, persistent_config FROM multi_sessions 
      WHERE session_code = ${sessionCode} 
      LIMIT 1
    `;
    
    if (sessionResult.length > 0) {
      isChallenge = sessionResult[0].is_challenge || false;
      persistentConfig = sessionResult[0].persistent_config || null;
    }
  } catch (error) {
    logger.error("Error fetching session data for createEmptySession:", error);
  }

  // If we have persistent config, restore from it
  if (persistentConfig && isChallenge) {
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
    ...(creatorId !== undefined ? { creatorId } : {}),
    name: undefined,
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
  socket.emit('lobby-users', { users: userList });
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

  // Remove from socketClients
  if (socketClients[playerKey]) {
    socketClients[playerKey] = socketClients[playerKey].filter(id => id !== socketId);
    
    // If this was the last socket for this user
    if (socketClients[playerKey].length === 0) {
      delete socketClients[playerKey];
      
      const player = playerInfo[playerKey];
      if (player && player.isAnonymous && gameRef) {
        gameRef.anonymousUsernames = gameRef.anonymousUsernames.filter(name => name !== userName);
      }
      // If creator disconnects before game starts, destroy game and broadcast cancellation
      if (gameRef && !gameRef.hasStarted && gameRef.creatorId && player.userId && gameRef.creatorId == player.userId) {
        // Check if the disconnecting user matches the creator (when known in memory)
        // We don't have the userId on disconnect for anon users; this logic triggers for creator (non-anon) sessions
        getIO().to(`game:${sessionCode}`).emit('lobby-cancelled', {});
        cleanupGame(sessionCode);
        emitPublicLobbiesUpdate();
        // After cleanup, stop further processing
        delete socketInfo[socketId];
        return;
      }
      // Broadcast player left
      getIO().to(`game:${sessionCode}`).emit('player-left', { userName });
      // Clean up player info
      delete playerInfo[playerKey];
      emitPublicLobbiesUpdate();
    }
  }
  
  // Clean up socketInfo
  delete socketInfo[socketId];
}

// Helper to emit to all sockets for a specific user
function emitToUser(sessionCode: string, userName: string, event: string, data: any) {
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
function broadcastToSession(sessionCode: string, event: string, data: any) {
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

function getRandomLut(atlasName: string) : {lut: ColorMap|undefined, mapping: Record<number,number>|undefined, inverseMapping: Record<number,number>|undefined} {
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

function generateGameCommands(params: MultiplayerParametersType): GameCommands[]|undefined {
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

function cleanupExternalCommands(externalCommands: ExternalGameCommands[], isChallenge: boolean = false): GameCommands[]|undefined {
  try {
    const { error } = validateExternalGameCommands(externalCommands);
    if (error) throw error;
    const commands : GameCommands[] = [];
    let currentAtlas = undefined;
    let regionPool: number[] = [];
    let index = 0;
    
    for (const command of externalCommands) {
      if (command.action === "countdown") {
        if(index === 0) {
          let countdownCommand: any = {
            action: "countdown"
          };
          
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
        if(index === 0) {
          commands.push({
            action: "countdown",
            duration: DEFAULT_COUNTDOWN_TIME,
          });
        }
      }
      
      if (command.action === "load-atlas") {
        currentAtlas = command.atlas || Object.keys(validRegions)[Math.floor(Math.random() * Object.keys(validRegions).length)];
        if (!validRegions[currentAtlas || ""]) {
          throw `Atlas "${currentAtlas}" does not exist.`
        }
        const {lut, mapping, inverseMapping} = getRandomLut(currentAtlas)
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
          throw `Atlas "${currentAtlas}" does not exist.`
        }
        // If pool is empty, refill with all regions (to allow repeats only after all have been used)
        if (regionPool.length === 0) {
          regionPool = [...validRegions[currentAtlas]];
        }
        let idx = -1;
        let regionId = -1;
        if(command.regionId) {
          regionId = command.regionId;
          if(regionPool.includes(regionId)) {
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

async function handleLaunchGame(data: {
  sessionCode: string,
  sessionToken: string,
  userName: string
}) {
  try {
    const { sessionCode, sessionToken, userName } = data;
    const gameRef = games[sessionCode];
    if (!gameRef) {
      emitToUser(sessionCode, userName, "error", {message: "Lobby does not exist"})
      return {success: false};
    }
    updateGameActivity(sessionCode);
    
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
    if (gameRef.hasStarted) {
      emitToUser(sessionCode, userName, "error", {message: "Game already started"})
      return {success: false};
    }

    logger.info("Starting game", sessionCode)
    if(gameRef.parameters.commands){
      gameRef.commands = gameRef.parameters.commands;
      gameRef.totalGuessNumber = gameRef.commands.filter(command => command.action === "guess").length;
    } else {
      gameRef.commands = generateGameCommands(gameRef.parameters) || []
      gameRef.totalGuessNumber = gameRef.parameters.regionsNumber
    }
    gameRef.hasStarted = true;
    gameRef.duration = Date.now();

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

async function sendNextCommand(gameRef: MultiplayerGame) {
  try {
    if (!gameRef.commands) return;

    // If all commands sent, stop
    if (gameRef.currentCommandIndex >= gameRef.commands.length) {
      // Optionally broadcast game end
      const allScores = Object.values(gameRef.individualScores);
      const maxScore = Math.max(...allScores);
      Object.keys(gameRef.individualScores).forEach(userName => {
        emitToUser(gameRef.sessionCode, userName, "game-end", {
          scores: gameRef.individualScores,
          youWon: gameRef.individualScores[userName] === maxScore && maxScore > 0
        });
      });
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
    broadcastToSession(gameRef.sessionCode, 'all-scores-update', { scores: gameRef.individualScores });

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

    // Schedule next command
    if (gameRef.currentCommandIndex < gameRef.commands.length) {
      const nextDuration = (effectiveDuration || command.duration || 0) * 1000; // convert to ms
      gameRef.commandTimeout = setTimeout(() => { 
        gameRef.currentCommandIndex += 1; 
        sendNextCommand(gameRef)
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


    if(!gameRef.hasAnswered) gameRef.hasAnswered = {}
    if(!gameRef.hasAnswered[userName]) gameRef.hasAnswered[userName] = Array(gameRef.commands.length).fill(false);
    if(gameRef.hasAnswered[userName][gameRef.currentCommandIndex]){
      emitToUser(sessionCode, userName, "error", {message: "Answer already given"})
      return;
    }
    if(gameRef.commands[gameRef.currentCommandIndex].action != "guess"){
      emitToUser(sessionCode, userName, "error", {message: "Guess delay timed out"})
      return;
    }

    const [x, y, z] = voxelProp.vox;
    const atlasImage: NVImage = imageRef[gameRef.currentAtlas];
    const atlasMetadata = imageMetadata[gameRef.currentAtlas];
    if (x < 0 || x >= atlasMetadata.nx || y < 0 || y >= atlasMetadata.ny || z < 0 || z >= atlasMetadata.nz) {
      emitToUser(sessionCode, userName, "error", {message: "Coordinates out of bound"})
      return;
    }

    gameRef.hasAnswered[userName][gameRef.currentCommandIndex] = true; // mark that the user has answered
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
    gameRef.individualScores[userName] += scoreIncrement
    gameRef.individualAttempts[userName] += 1;
    if(isCorrect) gameRef.individualSuccesses[userName] += 1;
    gameRef.individualDurations[userName].push(elapsed);
    if(isCorrect) gameRef.individualCorrectDurations[userName].push(elapsed);
    
    // Broadcast score update to all users via SSE
    broadcastToSession(sessionCode, 'score-update', {
      user: userName,
      score: gameRef.individualScores[userName]
    });
    
    emitToUser(sessionCode, userName, "guess-result", {
      isCorrect,
      scoreIncrement,
      totalScore: gameRef.individualScores[userName],
      distance: minDistance,
      nearestCenter,
      nearestBoundary
    })
  } catch (error) {
      logger.error("Error validating guess:", error);
      emitToUser(data.sessionCode, data.userName, "error", {message: error instanceof Error ? error.message : String(error) })
  }
}

// Helper function to calculate the next start time based on recurrence settings
function calculateNextStartTime(currentStartTime: string, recurrence: Recurrence): Date {
  const current = new Date(currentStartTime);
  const next = new Date(current);
  
  switch (recurrence.type) {
    case "hour":
      next.setHours(current.getHours() + recurrence.interval);
      break;
    case "day":
      next.setDate(current.getDate() + recurrence.interval);
      break;
    case "week":
      next.setDate(current.getDate() + (7 * recurrence.interval));
      break;
    case "month":
      next.setMonth(current.getMonth() + recurrence.interval);
      break;
    case "year":
      next.setFullYear(current.getFullYear() + recurrence.interval);
      break;
  }
  
  return next;
}

// Helper function to generate session token
function generateSessionToken(sessionCode: string, creatorId?: number): string {
  return jwt.sign({ 
    sessionCode, 
    creatorId, 
    type: "multiplayer-creator" 
  }, config.jwt_secret, { expiresIn: "1h" });
}

async function handleGameRecurrence(gameBackup: MultiplayerGame): Promise<void> {
  try {
    if (!gameBackup.parameters.recurrence || !gameBackup.commands || gameBackup.commands.length === 0) {
      return;
    }

    // Find the countdown command with startTime
    const countdownCommand = gameBackup.commands.find(cmd => cmd.action === "countdown" && cmd.startTime);
    if (!countdownCommand || !countdownCommand.startTime) {
      logger.error(`No countdown command with startTime found for recurring session ${gameBackup.sessionCode}`);
      return;
    }

    // Calculate next start time
    const nextStartTime = calculateNextStartTime(countdownCommand.startTime, gameBackup.parameters.recurrence).toISOString();
    
    // Update the countdown command with the new start time
    const updatedCommands = gameBackup.commands.map(cmd => {
      if (cmd.action === "countdown" && cmd.startTime) {
        return { ...cmd, startTime: nextStartTime };
      }
      return cmd;
    });

    // Update the existing session in the database with the new start time
    const persistentState = extractPersistentState({
      ...gameBackup,
      commands: updatedCommands,
      parameters: {
        ...gameBackup.parameters,
        commands: updatedCommands
      }
    });

    await sql`
      UPDATE multi_sessions 
      SET created_at = NOW(), 
          persistent_config = ${JSON.stringify(persistentState)}
      WHERE session_code = ${gameBackup.sessionCode}
    `;

    // Recreate the game in memory with updated commands
    games[gameBackup.sessionCode] = {
      ...gameBackup,
      commands: updatedCommands,
      parameters: {
        ...gameBackup.parameters,
        commands: updatedCommands
      }
    };

    // Start the countdown for the next occurrence
    sendNextCommand(games[gameBackup.sessionCode]);
    
    logger.info(`Challenge ${gameBackup.sessionCode} has been rescheduled for next occurrence at ${nextStartTime}`);
    
    // Notify watchers that lobbies list may have changed
    emitPublicLobbiesUpdate();  
  } catch (error) {
    logger.error(`Error handling recurrence for session ${gameBackup.sessionCode}:`, error);
  }
}

// Helper function to backup game state for recurrence
function backupGameForRecurrence(gameRef: MultiplayerGame): MultiplayerGame | null {
  if (!gameRef.isChallenge || !gameRef.parameters.recurrence || !gameRef.commands || gameRef.commands.length === 0) {
    return null;
  }
  
  // Create a deep copy of the relevant game state
  return {
    sessionCode: gameRef.sessionCode,
    hasStarted: false, // Reset for next occurrence
    hasFinishedCountdown: false,
    hasEnded: false,
    parameters: { ...gameRef.parameters }, // Keep all parameters including recurrence
    commands: gameRef.commands ? [...gameRef.commands] : undefined, // Copy commands array
    currentCommandIndex: 0,
    currentAtlas: '',
    currentRegionId: -1,
    duration: 0,
    stepStartTime: undefined,
    commandTimeout: undefined,
    totalGuessNumber: gameRef.totalGuessNumber,
    hasAnswered: {},
    individualScores: {},
    individualAttempts: {},
    individualSuccesses: {},
    individualDurations: {},
    individualCorrectDurations: {},
    anonymousUsernames: [],
    lastActivity: Date.now(),
    isCurrentlyBlind: false,
    creatorId: gameRef.creatorId,
    isChallenge: gameRef.isChallenge,
    name: gameRef.name
  };
}

async function clotureMultiplayerGame(gameRef: MultiplayerGame) {
  try {
    if (gameRef.hasEnded) return;
    gameRef.hasEnded = true;

    const gameDuration = gameRef.duration ? (Date.now() - gameRef.duration) : 0;
    const allScores = Object.values(gameRef.individualScores);
    const maxScore = Math.max(...allScores);

    // 1. Backup the game state for potential recurrence
    const gameBackup = backupGameForRecurrence(gameRef);

    // Save data for authenticated users
    const savePromises = [];
    for (const username in gameRef.individualScores || {}) {
      // Skip anonymous users
      if (gameRef.anonymousUsernames && gameRef.anonymousUsernames.includes(username)) continue;
      const playerKey = `${gameRef.sessionCode}:${username}`;
      const player = playerInfo[playerKey];
      if(!player) continue; 
      let userId = player.userId
      if(!userId) continue; // If no userId, do not store anything for this user
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
      const avgTimePerRegion = durations.length > 0 ? Math.round(durations.reduce((a,b)=>a+b,0)/durations.length) : null;
      const minTimePerCorrectRegion = correctDurations.length > 0 ? Math.min(...correctDurations) : null;
      const maxTimePerCorrectRegion = correctDurations.length > 0 ? Math.max(...correctDurations) : null;
      const avgTimePerCorrectRegion = correctDurations.length > 0 ? Math.round(correctDurations.reduce((a,b)=>a+b,0)/correctDurations.length) : null;
      const quitReason = 'end';
      const multiplayerGamesWon = (score === maxScore && maxScore > 0) ? 1 : 0;

      // The rest of your database code...
      savePromises.push(
        sql`
          INSERT INTO finished_sessions (
            user_id, mode, atlas, blind_mode, score, attempts, correct, incorrect,
            min_time_per_region, max_time_per_region, avg_time_per_region,
            min_time_per_correct_region, max_time_per_correct_region, avg_time_per_correct_region,
            quit_reason, multiplayer_games_won, duration, created_at
          ) VALUES (
            ${userId}, ${mode}, ${atlas}, ${blindMode}, ${score}, ${attempts}, ${correct}, ${incorrect},
            ${minTimePerRegion}, ${maxTimePerRegion}, ${avgTimePerRegion},
            ${minTimePerCorrectRegion}, ${maxTimePerCorrectRegion}, ${avgTimePerCorrectRegion},
            ${quitReason}, ${multiplayerGamesWon}, ${gameDuration}, NOW()
          )
        `.catch(e => {
          logger.error(`Error saving stats for ${username}:`, e);
        })
      );
    }

    // Wait for all saves to complete before proceeding
    await Promise.allSettled(savePromises);
    
    // 2. Perform complete game cleanup (skip database deletion if we have recurrence)
    const sessionCode = gameRef.sessionCode;
    console.log(gameBackup, gameRef.isChallenge, gameRef.parameters.recurrence)
    const hasRecurrence = !!(gameBackup && gameRef.isChallenge && gameRef.parameters.recurrence);
    
    if (!hasRecurrence) {
      // Delete the session from database only if no recurrence
      await sql`DELETE FROM multi_sessions WHERE session_code = ${gameRef.sessionCode}`
        .catch(e => {
          logger.error(`Error deleting session ${sessionCode}:`, e);
        });
    }
    
    // Use the common cleanup function (skip DB deletion if we have recurrence)
    cleanupGame(gameRef.sessionCode, hasRecurrence);
    
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

// Add this function to check for inactive games
function setupInactiveGameCheck() {
  setInterval(() => {
    const now = Date.now();
    Object.keys(games).forEach(sessionCode => {
      const game = games[sessionCode];
      
      // Skip games that are active
      if (game.hasStarted && !game.hasEnded) return;
      
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

// Add this to your initialization code
setupInactiveGameCheck();

// Create a dedicated cleanup function
function cleanupGame(sessionCode: string, skipDatabaseDeletion: boolean = false) {
  logger.info("Cleaning up session", {
    sessionCode,
    skipDatabaseDeletion
  })
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
    sql`DELETE FROM multi_sessions WHERE session_code = ${sessionCode}`.catch(e => {
      logger.error(`Error deleting session ${sessionCode}:`, e);
    });
    // Notify watchers that lobbies list may have changed
    emitPublicLobbiesUpdate();  
  }
}

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

// Get next upcoming public challenge
export const getNextChallenge = async (req: Request, res: Response) => {
  try {
    const currentTime = new Date().toISOString();
    
    const result = await sql`
      SELECT ms.session_code, ms.created_at, ms.persistent_config, ms.name, u.username AS creator_name
      FROM multi_sessions ms
      LEFT JOIN users u ON u.id = ms.creator_id
      WHERE ms.is_challenge = TRUE 
      AND ms.public = TRUE
      AND ms.persistent_config IS NOT NULL
      AND (ms.persistent_config::jsonb->'commands'->0->>'startTime') > ${currentTime}
      ORDER BY (ms.persistent_config::jsonb->'commands'->0->>'startTime') ASC
      LIMIT 1
    ` as Array<{ 
      session_code: string, 
      created_at: Date, 
      persistent_config: string,
      name: string | null,
      creator_name: string | null
    }>;

    if (result.length === 0) {
      return res.status(200).json({ challenge: null, message: 'No upcoming challenges found' });
    }

    const session = result[0];
    const sessionCode = String(session.session_code).padStart(8, '0');
    
    try {
      const persistentState = JSON.parse(session.persistent_config);
      const startTime = persistentState.commands?.[0]?.startTime;
      
      const challenge = {
        sessionCode,
        startTime,
        atlas: persistentState.parameters?.atlas,
        totalDuration: persistentState.parameters?.totalDuration,
        name: session.name || undefined,
        creator: session.creator_name || 'Unknown',
        createdAt: session.created_at?.toISOString?.() || undefined
      };
      
      res.status(200).json({ challenge });
    } catch (parseError) {
      logger.error("Error parsing persistent config for next challenge:", parseError);
      res.status(500).json({ error: 'Error parsing challenge data' });
    }
    
  } catch (error) {
    logger.error("getNextChallenge error", error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export const getAllChallenges = async (req: Request, res: Response) => {
  try {
    const currentTime = new Date().toISOString();
    
    // Check if user is authenticated and admin
    const authHeader: string | undefined = req.headers['authorization'] as string | undefined;
    const token: string | undefined = authHeader && authHeader.split(' ')[1];
    let isAdmin = false;
    let userId = null;
    if(token){
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
        logger.warn("Invalid token in getAllChallenges:", jwtError);
      }
    }
    
    // Build query based on user permissions
    let query;
    if (isAdmin) {
      // Admin can see all challenges (public and private)
      query = sql`
        SELECT ms.session_code, ms.created_at, ms.persistent_config, ms.public, ms.name, u.username AS creator_name
        FROM multi_sessions ms
        LEFT JOIN users u ON u.id = ms.creator_id
        WHERE ms.is_challenge = TRUE 
        AND ms.persistent_config IS NOT NULL
        ORDER BY (ms.persistent_config::jsonb->'commands'->0->>'startTime') ASC
      `;
    } else {
      // Non-admin users can only see public challenges
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

    const challenges = [];
    
    for (const session of result) {
      const sessionCode = String(session.session_code).padStart(8, '0');
      
      try {
        const persistentState = JSON.parse(session.persistent_config);
        const startTime = persistentState.commands?.[0]?.startTime;
        
        const challenge = {
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
        
        challenges.push(challenge);
      } catch (parseError) {
        logger.error(`Error parsing persistent config for session ${session.session_code}:`, parseError);
        // Skip this challenge if parsing fails
        continue;
      }
    }
    
    res.status(200).json({ 
      challenges,
      userPermissions: {
        isAdmin,
        canSeePrivate: isAdmin
      }
    });
    
  } catch (error) {
    logger.error("getAllChallenges error", error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export const deleteChallenge = async (req: Request, res: Response) => {
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
      res.status(404).json({ error: 'Challenge not found' });
      return;
    }
    
    // Also remove from active games if it's running
    if (games[sessionCode]) {
      delete games[sessionCode];
      logger.info(`Removed active challenge session ${sessionCode} from memory`);
    }
    
    logger.info(`Admin ${userId} deleted challenge session ${sessionCode}`);
    res.status(200).json({ message: 'Challenge deleted successfully' });
    
  } catch (error) {
    logger.error("deleteChallenge error", error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

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

// Save persistent configuration for challenge mode
export const handleSaveAsChallenge = async ({sessionCode, sessionToken, userToken, userName, name, recurrent}: {sessionCode: string, sessionToken: string, userToken: string, userName: string, name?:string, recurrent?: Recurrence}) => {
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

    gameRef.commands = gameRef.parameters.commands

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
        emitToUser(sessionCode, userName, "error", { message: "Admin privileges required for challenge mode" });
        return;
      }
    } catch (err) {
      emitToUser(sessionCode, userName, "error", { message: "Invalid authentication token" });
      return;
    }

    // Validate session token
    const sessionResult = await sql`
      SELECT session_token FROM multi_sessions WHERE session_code = ${sessionCode}
    ` as { session_token: string }[];
    
    if (sessionResult.length === 0 || sessionResult[0].session_token !== sessionToken) {
      emitToUser(sessionCode, userName, "error", { message: "Invalid session token" });
      return;
    }

    if(recurrent){
      if(recurrent.type != "hour" && recurrent.type != "day" && recurrent.type != "week" && recurrent.type != "month" && recurrent.type != "year"){
        emitToUser(sessionCode, userName, "error", { message: "Invalid recurrence type" });
        return;
      } else if(!(recurrent.interval > 0)){
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
    
    logger.info(`Challenge configuration saved for session ${sessionCode}`);
    updateGameActivity(sessionCode);
    
    // Broadcast game preparation to all users
    broadcastToSession(sessionCode, 'challenge-prepared', {
      message: 'Challenge has been prepared and will start at the scheduled time'
    });
    
    // Start the first command (countdown with startTime)
    sendNextCommand(gameRef);
    
    emitToUser(sessionCode, userName, "save-as-challenge", { message: "success" });    
  } catch (error) {
    logger.error("saveChallengeConfig error", error);
    emitToUser(sessionCode, userName, "error", { message: "Internal server error" });
  }
};

// Helper to build current public lobbies list (shared by HTTP and sockets)
async function buildPublicLobbies() {
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

async function emitPublicLobbiesUpdate() {
  try {
    const io = getIO();
    const lobbies = await buildPublicLobbies();
    io.to('public-lobbies').emit('public-lobbies-update', { lobbies });
  } catch (e) {
    // no-op
  }
}

// Helper function to extract persistent state from gameRef
function extractPersistentState(gameRef: MultiplayerGame): PersistentGameState {
  return {
    sessionCode: gameRef.sessionCode,
    hasStarted: gameRef.hasStarted,
    hasFinishedCountdown: gameRef.hasFinishedCountdown,
    hasEnded: gameRef.hasEnded,
    parameters: gameRef.parameters,
    commands: gameRef.commands,
    duration: gameRef.duration,
    lastActivity: gameRef.lastActivity,
    creatorId: gameRef.creatorId,
    isChallenge: gameRef.isChallenge,
    name: gameRef.name
  };
}

// Helper function to restore game state from persistent state
function restoreFromPersistentState(persistentState: PersistentGameState, existingGameRef?: MultiplayerGame): MultiplayerGame {
  const baseState = existingGameRef || {
    currentCommandIndex: 0,
    currentAtlas: "",
    currentRegionId: -1,
    stepStartTime: undefined,
    commandTimeout: undefined,
    totalGuessNumber: 0,
    hasAnswered: {},
    individualScores: {},
    individualAttempts: {},
    individualSuccesses: {},
    individualDurations: {},
    individualCorrectDurations: {},
    anonymousUsernames: [],
    isCurrentlyBlind: false
  };

  return {
    ...baseState,
    ...persistentState,
    totalGuessNumber: persistentState.commands?.filter(cmd => cmd.action === "guess").length || 0
  };
}

// Function to restore all persistent challenge sessions on server startup
export async function restorePersistentChallengeSessions() {
  try {
    logger.info("Restoring persistent challenge sessions...");
    
    const persistentSessions = await sql`
      SELECT session_code, persistent_config, creator_id, is_challenge 
      FROM multi_sessions 
      WHERE is_challenge = TRUE AND persistent_config IS NOT NULL
    ` as Array<{ 
      session_code: string, 
      persistent_config: string, 
      creator_id: number, 
      is_challenge: boolean 
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
          logger.info(`Skipping ended challenge session ${sessionCode}`);
          skippedCount++;
          continue;
        }
        
        // Check if this challenge has a countdown with startTime
        const countdownCommand = persistentState.commands?.find(cmd => cmd.action === "countdown" && cmd.startTime);
        if (!countdownCommand || !countdownCommand.startTime) {
          logger.info(`Skipping challenge session ${sessionCode} - no countdown with startTime`);
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
          lastActivity: Date.now()
        };
        
        // If the start time has passed
        if (startTime.getTime() <= now.getTime()) {
          if (hasRecurrence) {
            // For recurring challenges, calculate the next occurrence
            logger.info(`Rescheduling recurring challenge session ${sessionCode} - start time has passed`);
            
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
            logger.info(`Rescheduled recurring challenge session ${sessionCode} to ${nextStartTime.toISOString()}`);
          } else {
            // For non-recurring challenges that have passed, delete them
            logger.info(`Deleting expired non-recurring challenge session ${sessionCode}`);
            await sql`DELETE FROM multi_sessions WHERE session_code = ${sessionCode}`;
            deletedCount++;
            continue; // Skip further processing for deleted sessions
          }
        }

        // Restore the game state in memory and start it
        games[sessionCode] = baseGameState;
        sendNextCommand(games[sessionCode]);
        restoredCount++;
        logger.info(`Restored challenge session ${sessionCode} - scheduled for ${startTime.toISOString()}`);
      } catch (parseError) {
        logger.error(`Error parsing persistent config for session ${sessionCode}:`, parseError);
        skippedCount++;
      }
    }
    
    logger.info(`Challenge session restoration complete: ${restoredCount} restored, ${rescheduledCount} rescheduled, ${deletedCount} deleted, ${skippedCount} skipped`);
    
  } catch (error) {
    logger.error("Error restoring persistent challenge sessions:", error);
  }
}

const handleDestroySession = async (data: {
      sessionCode: string,
      sessionToken: string,
      userToken: string
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
    ` as { id: number; creator_id: number }[];
    
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
}
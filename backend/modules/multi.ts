import type { AuthenticatedRequest, MultiValidateGuessRequest, UpdateMultiGameRequest } from "../interfaces/requests.interfaces.ts";
import { sql } from "./database_init.ts";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
type Config = import("../interfaces/config.interfaces.ts").Config;
import configJson from '../config.json' with { type: "json" };
const config: Config = configJson;
import { imageMetadata, imageRef, regionCenters, validRegions } from "./game.ts";
import { NVImage } from "@niivue/niivue";
import { MultiSession } from "interfaces/database.interfaces.ts";
import { ExternalGameCommands, GameCommands, MultiplayerGame, MultiplayerParametersType, PlayerInfo } from "interfaces/multi.interfaces.ts";
import crypto from "crypto";
import { getIO } from "./socket.io.ts";
import { Socket } from "socket.io";
import Joi from "joi";
import { logger } from "./logging.ts";

const externalGameCommandsSchema = Joi.array().items(
  Joi.object({
    action: Joi.string().valid("load-atlas", "guess").required(),
    atlas: Joi.string().optional(),
    regionId: Joi.number().integer().optional(),
    duration: Joi.number().integer().min(5).required(),
    blindMode: Joi.boolean().optional(),
  }).required()
);

const validateExternalGameCommands = (commands: unknown): Joi.ValidationResult => {
  return externalGameCommandsSchema.validate(commands, { abortEarly: false });
};

const DEFAULT_REGION_NUMBER = 15;
const DEFAULT_DURATION_PER_REGION = 15;
const DEFAULT_GAMEOVER_ON_ERROR = false;
const LOAD_ATLAS_DURATION = 10;
const MAX_POINTS_PER_REGION = 50; // 1000 total points / 20 regions
const BONUS_POINTS_PER_SECOND = 1; // nombre de points bonus par seconde restante (max 100*10 = 1000 points)
const MAX_POINTS_WITH_PENALTY = 30 // 30 points max if clicked outside the region
const MAX_PENALTY_DISTANCE = 100; // Arbitrary distance in mm for max penalty (0 points)
const INACTIVE_GAME_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const BLIND_MODE_MULTIPLIER = 1.5; // Multiplier for points in blind mode

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

function getDistance(centers: number[][], coordinates: {mm: number[], vox: number[]}): {distance: number, center: number[]|undefined} {
    const [xMm, yMm, zMm] = coordinates.mm;
    let minDistance = Infinity;
    let nearestCenter: number[]|undefined = undefined;
    for (const center of centers) {
        const dist = Math.sqrt(
            Math.pow(center[0] - xMm, 2) +
            Math.pow(center[1] - yMm, 2) +
            Math.pow(center[2] - zMm, 2)
        );
        if (dist < minDistance) {
            minDistance = dist;
            nearestCenter = center;
        }
    }
    return { distance: minDistance, center: nearestCenter };
}

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
    
    finalUserName = userName;
    
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
    createEmptySession(sessionCode, creatorId ?? undefined);
  }
  
  const gameRef = games[sessionCode];
  const playerKey = `${sessionCode}:${finalUserName}`;

  // Prevent duplicate user in lobby
  if (playerInfo[playerKey] && !anonToken) {
    return { error: "User already in lobby" };
  }

  if (isAnonymous) {
    gameRef.anonymousUsernames.push(finalUserName);
  }

  // Add socket to room
  socket.join(`game:${sessionCode}`);
  
  // Register socket client
  if (!socketClients[playerKey]) {
    socketClients[playerKey] = [];
  }
  socketClients[playerKey].push(socket.id);

  // Update player info
  updatePlayerInfo(sessionCode, finalUserName, {
    isAnonymous,
    userName: finalUserName,
    sessionCode,
    anonToken: newAnonToken || anonToken,
    userId: userId
  });

  // Initialize user in lobby
  initUserInLobby(socket, finalUserName, gameRef, sessionCode);

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

// Helper to generate a unique 8-digit code
function generateCode(): string {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

async function getUniqueCode(): Promise<string> {
    let code: string;
    let exists: boolean = true;
    do {
        code = generateCode();
        const result = await sql`
            SELECT COUNT(*) as count 
            FROM multi_sessions 
            WHERE session_code = ${code}
        `;
        exists = result[0]?.count > 0;
    } while (exists);
    return code;
}

function generateRandomInts(quantity: number, max: number) {
  const arr = []
  while (arr.length < quantity) {
    var candidateInt = Math.floor(Math.random() * max) + 1
    if (arr.indexOf(candidateInt) === -1) arr.push(candidateInt)
  }
  return (arr)
}

export const createMultiplayerSession = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id; 
    const sessionCode = await getUniqueCode();
    const sessionToken = jwt.sign({ userId, sessionCode, type: "multiplayer-creator" }, config.jwt_secret, { expiresIn: "1h" });
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

function createEmptySession(sessionCode: string, creatorId?: number){
    games[sessionCode] = {
      sessionCode: sessionCode,
      hasStarted: false,
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
        commands: undefined
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
      ...(creatorId !== undefined ? { creatorId } : {})
    }
}

function initUserInLobby(socket: Socket, userName: string, gameRef: MultiplayerGame, sessionCode: string) {
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

  logger.info("broadcast player joined")
  
  // Broadcast to others that a new player joined
  socket.to(`game:${sessionCode}`).emit('player-joined', { userName });
  
  // If game is already in progress, send current state
  if (gameRef.hasStarted) {
    socket.emit('game-start');
    
    if (gameRef.commands && gameRef.currentCommandIndex < gameRef.commands.length) {
      socket.emit('game-command', { 
        command: gameRef.commands[gameRef.currentCommandIndex] 
      });
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
        gameRef.anonymousUsernames = 
          gameRef.anonymousUsernames.filter(name => name !== userName);
      }
      // If creator disconnects before game starts, destroy game and broadcast cancellation
      if (gameRef && !gameRef.hasStarted && typeof gameRef.creatorId === 'number') {
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
    const {lut, mapping, inverseMapping} = getRandomLut(params.atlas)
    // 1. Load atlas
    commands.push({
      action: "load-atlas",
      atlas: params.atlas,
      lut, mapping, inverseMapping,
      duration: LOAD_ATLAS_DURATION,
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

function cleanupExternalCommands(externalCommands: ExternalGameCommands[]): GameCommands[]|undefined {
  try {
    const { error } = validateExternalGameCommands(externalCommands);
    if (error) throw error;
    const commands : GameCommands[] = [];
    let currentAtlas = undefined;
    let regionPool: number[] = [];
    for (const command of externalCommands) {
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
          duration: command.duration || LOAD_ATLAS_DURATION,
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

function sendNextCommand(gameRef: MultiplayerGame) {
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
    if(command.action == "load-atlas"){
      gameRef.currentAtlas = command.atlas || "";
      gameRef.isCurrentlyBlind = command.blindMode || false;
    }
    if(command.action == "guess") gameRef.currentRegionId = command.regionId || -1;
    // Broadcast command and scores to all users via SSE
    broadcastToSession(gameRef.sessionCode, 'game-command', { command });
    broadcastToSession(gameRef.sessionCode, 'all-scores-update', { scores: gameRef.individualScores });

    // Schedule next command
    if (gameRef.currentCommandIndex < gameRef.commands.length) {
      const nextDuration = command.duration * 1000; // convert to ms
      gameRef.commandTimeout = setTimeout(() => { 
        gameRef.currentCommandIndex += 1; 
        sendNextCommand(gameRef)
      }, nextDuration);
    }
  } catch (error) {
      logger.error("Error sending next command:", error);
  }
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
      const commands = cleanupExternalCommands(parameters.commands)
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
      gameRef.parameters.totalDuration = (regions > 0 && dur > 0) ? (LOAD_ATLAS_DURATION + regions * dur) : 0;
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
}) {
  try {
    const { sessionCode, userName, voxelProp, anonToken, userToken } = data;
    
    // Authentication check
    if (!verifyUserAccess(sessionCode, userName, userToken, anonToken)) {
      return { error: "Authentication failed" };
    }

    const gameRef = games[sessionCode];
    if (!gameRef || !gameRef.commands) {
      return { error: "Game not available" };
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
    let nearestCenter: number[]|undefined = undefined;
    if (regionCenters[gameRef.currentAtlas] && regionCenters[gameRef.currentAtlas][gameRef.currentRegionId]) {
      const { distance, center } = getDistance(
        regionCenters[gameRef.currentAtlas][gameRef.currentRegionId],
        voxelProp
      );
      minDistance = distance;
      nearestCenter = center;
    }

    if (isCorrect) {
      let bonus = 0;
      minDistance = 0;
      if (gameRef.commands && gameRef.commands[gameRef.currentCommandIndex]) {
        if (gameRef.stepStartTime) {
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
      nearestCenter
    })
    return { success: true };
  } catch (error) {
      logger.error("Error validating guess:", error);
      emitToUser(data.sessionCode, data.userName, "error", {message: error instanceof Error ? error.message : String(error) })
  }
}

async function clotureMultiplayerGame(gameRef: MultiplayerGame) {
  try {
    if (gameRef.hasEnded) return;
    gameRef.hasEnded = true;

    const gameDuration = gameRef.duration ? (Date.now() - gameRef.duration) : 0;
    const allScores = Object.values(gameRef.individualScores);
    const maxScore = Math.max(...allScores);

    // Save data for authenticated users
    const savePromises = [];
    for (const username in gameRef.individualScores || {}) {
      // Skip anonymous users
      if (gameRef.anonymousUsernames && gameRef.anonymousUsernames.includes(username)) continue;
      const playerKey = `${gameRef.sessionCode}:${username}`;
      const player = playerInfo[playerKey];
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
    
    // Delete the session from the database
    const sessionCode = gameRef.sessionCode;
    await sql`DELETE FROM multi_sessions WHERE session_code = ${gameRef.sessionCode}`
      .catch(e => {
        logger.error(`Error deleting session ${sessionCode}:`, e);
      });
    
    // Use the common cleanup function
    cleanupGame(gameRef.sessionCode);
    
    // broadcast a final message to all clients
    broadcastToSession(sessionCode, 'game-closed', {});

    // Cleanup: close all SSE connections for this session
    cleanupGame(sessionCode);
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
function cleanupGame(sessionCode: string) {
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
  
  // Delete from database if it exists
  sql`DELETE FROM multi_sessions WHERE session_code = ${sessionCode}`.catch(e => {
    logger.error(`Error deleting session ${sessionCode}:`, e);
  });
  // Notify watchers that lobbies list may have changed
  emitPublicLobbiesUpdate();
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
    if (!gameRef || gameRef.hasStarted) return undefined;
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
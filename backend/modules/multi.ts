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
import { GameCommands, MultiplayerGame, MultiplayerParametersType, PlayerInfo } from "interfaces/multi.interfaces.ts";

const DEFAULT_REGION_NUMBER = 15;
const DEFAULT_DURATION_PER_REGION = 15;
const DEFAULT_GAMEOVER_ON_ERROR = false;
const LOAD_ATLAS_DURATION = 3;
const MAX_POINTS_PER_REGION = 50; // 1000 total points / 20 regions
const BONUS_POINTS_PER_SECOND = 1; // nombre de points bonus par seconde restante (max 100*10 = 1000 points)
const MAX_POINTS_WITH_PENALTY = 30 // 30 points max if clicked outside the region
const MAX_PENALTY_DISTANCE = 100; // Arbitrary distance in mm for max penalty (0 points)


// In-memory map of SSE connections
const sseClients: Record<string, Response[]> = {};
const games: Record<string, MultiplayerGame> = {};
const playerInfo: Record<string, PlayerInfo> = {};

export const createSSEClient = async (req: Request, res: Response) => {
  const { sessionCode, userName } = req.params;
  const isAnonymous = req.query.anonymous === "true" || req.query.anonymous === "1";
  const token = typeof req.query.token === "string" ? req.query.token : undefined;

  let finalUserName = userName;
  let authenticated = false;

  const sessionResult = await sql`
      SELECT * FROM multi_sessions WHERE session_code = ${sessionCode}
  ` as MultiSession[];
  if (!sessionResult.length){
      res.status(403).send({ message: "Lobby does not exist" });
      return
  }

  if (!isAnonymous) {
    if(!token){
      res.status(403).send({ message: "Please connect or choose anonymous mode" });
      return
    }
    try {
      const jwtpayload: any = jwt.verify(token, config.jwt_secret);
      if (jwtpayload && jwtpayload.username) {
        finalUserName = String(jwtpayload.username);
        authenticated = true;
      }
    } catch (err) {
      res.status(403).send({ message: "Error: invalid token provided" });
      return
    }
  } else {
    if (!config.allowAnonymousInMultiplayer) {
      res.status(403).send({ message: "Anonymous mode not allowed" });
      return;
    }
    const userResult = await sql`
        SELECT id FROM users WHERE username = ${userName}
    `;
    if (userResult.length > 0) {
      res.status(403).send({ message: "Username already exists" });
      return;
    }
    finalUserName = userName;
  }
  
  if (!games[sessionCode]){
    createEmptySession(sessionCode)
  }
  const gameRef = games[sessionCode];

  // Prevent duplicate user in lobby
  const playerKey = `${sessionCode}:${finalUserName}`;
  if (playerInfo[playerKey]) {
    res.status(403).send({ message: "User already in lobby." });
    return;
  }

  if(isAnonymous) gameRef.anonymousUsernames.push(finalUserName);

  req.socket.setTimeout(0); // Keep connection open
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.flushHeaders();

  // Register SSE client
  const key = `${sessionCode}:${userName}`;
  if (!sseClients[key]) sseClients[key] = [];
  sseClients[key].push(res);

  // Update player info on connect
  updatePlayerInfo(sessionCode, finalUserName, {
    isAnonymous,
    userName: finalUserName,
    sessionCode
  });

  initUserInLobby(finalUserName, gameRef, sessionCode)

  req.on('close', () => {
    sseClients[key] = sseClients[key].filter(r => r !== res);
    delete playerInfo[key]; // Cleanup player info
    broadcastSSE(sessionCode, { type: 'player-left', userName: finalUserName });
  });
}

function sendSSE(sessionCode: string, userName: string, event: any) {
  const key = `${sessionCode}:${userName}`;
  if (sseClients[key]) {
    sseClients[key].forEach(res => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
  }
}

function broadcastSSE(sessionCode: string, event: any) {
  Object.keys(sseClients)
    .filter(key => key.startsWith(sessionCode + ":"))
    .forEach(key => {
      sseClients[key].forEach(res => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      });
    });
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
        console.error("Error creating multiplayer session:", error);
        res.status(500).send({ message: "Internal Server Error" });
  }
};

function createEmptySession(sessionCode: string){
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
        gameoverOnError: DEFAULT_GAMEOVER_ON_ERROR
      },
      hasAnswered: {},
      individualScores: {},
      individualAttempts: {},
      individualSuccesses: {},
      individualDurations: {},
      individualCorrectDurations: {},
      anonymousUsernames: []
    }
}

function initUserInLobby(userName: string, gameRef: MultiplayerGame, sessionCode: string){
  if (!(userName in gameRef.individualScores)) {
    gameRef.individualScores[userName] = 0;
    gameRef.individualAttempts[userName] = 0;
    gameRef.individualSuccesses[userName] = 0;
    gameRef.individualDurations[userName] = [];
    gameRef.individualCorrectDurations[userName] = [];
  }
    
  // Build the current user list from playerInfo for this session
  const userList = Object.values(playerInfo)
    .filter(info => info.sessionCode === sessionCode)
    .map(info => info.userName)
    .filter(Boolean);

  // Send the updated user list and parameters to the new user
  sendSSE(sessionCode, userName, { type: 'lobby-users', users: userList });
  sendSSE(sessionCode, userName, { type: 'parameters-updated', parameters: gameRef.parameters });
  
  // Broadcast to others in the lobby that a new player has joined
  userList.forEach(otherUser => {
    if (otherUser !== userName) {
      sendSSE(sessionCode, otherUser, { type: 'player-joined', userName });
    }
  });
}

function generateGameCommands(params: MultiplayerParametersType): GameCommands[]|undefined {
  try {
    const commands = [];
    if(!params.atlas) return;
    // 1. Load atlas
    const atlasNumberRegions = validRegions[params.atlas].length
    commands.push({
      action: "load-atlas",
      atlas: params.atlas,
      lut:{
            "R":generateRandomInts(atlasNumberRegions || 0, 255),
            "G":generateRandomInts(atlasNumberRegions || 0, 255),
            "B":generateRandomInts(atlasNumberRegions || 0, 255),
            "A":Array(1).fill(0).concat(Array((atlasNumberRegions || 0)-1).fill(255)),
            "I":Array.from(Array(atlasNumberRegions || 0).keys()),
            "labels": (validRegions[params.atlas] || []).map(String) || [],
          },
      duration: LOAD_ATLAS_DURATION
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
      console.error("Error creating commands:", error);
      return []
  }
}

export const launchGame = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionCode, sessionToken } = req.body;
    const gameRef = games[sessionCode];
    if (!gameRef) {
      res.status(404).send({ message: "Lobby does not exist." });
      return;
    }
    
    // Check that the sessionToken matches the one in the multisessions table
    const sessionResult = await sql`
      SELECT session_token FROM multi_sessions WHERE session_code = ${sessionCode}
    ` as { session_token: string }[];
    if (sessionResult.length === 0 || sessionResult[0].session_token !== sessionToken) {
      res.status(403).send({ message: "Invalid session token for this lobby." });
      return;
    }

    // Get all users in the lobby from playerInfo
    const userList = Object.values(playerInfo)
      .filter(info => info.sessionCode === sessionCode)
      .map(info => info.userName)
      .filter(Boolean);
      
    if (userList.length <= 1) {
      res.status(400).send({ message: "Insufficient users in lobby." });
      return;
    }
    if (gameRef.hasStarted) {
      res.status(400).send({ message: "Game already started." });
      return;
    }

    console.log("Starting game", sessionCode)
    gameRef.commands = generateGameCommands(gameRef.parameters) || []
    gameRef.hasStarted = true;
    gameRef.duration = Date.now();
    gameRef.totalGuessNumber = gameRef.parameters.regionsNumber

    // broadcast gamestart to all users and start
    broadcastSSE(sessionCode, { type: 'game-start' });
    sendNextCommand(gameRef);
  } catch (error) {
    console.error("Error starting game:", error);
    res.status(500).send({ message: error instanceof Error ? error.message : String(error) });
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
        sendSSE(gameRef.sessionCode, userName, {
          type: 'game-end',
          scores: gameRef.individualScores,
          youWon: gameRef.individualScores[userName] === maxScore && maxScore > 0
        });
      });
      clotureMultiplayerGame(gameRef)
      return;
    }

    gameRef.stepStartTime = Date.now();
    const command = gameRef.commands[gameRef.currentCommandIndex];
    if(command.action == "load-atlas") gameRef.currentAtlas = command.atlas || ""
    if(command.action == "guess") gameRef.currentRegionId = command.regionId || -1;
    // Broadcast command and scores to all users via SSE
    broadcastSSE(gameRef.sessionCode, { type: 'game-command', command });
    broadcastSSE(gameRef.sessionCode, { type: 'all-scores-update', scores: gameRef.individualScores });

    // Schedule next command
    if (gameRef.currentCommandIndex < gameRef.commands.length) {
      const nextDuration = command.duration * 1000; // convert to ms
      gameRef.commandTimeout = setTimeout(() => { 
        gameRef.currentCommandIndex += 1; 
        sendNextCommand(gameRef)
      }, nextDuration);
    }
  } catch (error) {
      console.error("Error sending next command:", error);
  }
}

export const updateParameters = async (req: UpdateMultiGameRequest, res: Response) => {
  try {
    const { sessionCode, sessionToken, parameters } = req.body;
    const gameRef = games[sessionCode];
    if (!gameRef) {
      res.status(404).send({ message: "Lobby does not exist." });
      return;
    }
    
    // Check session token
    const sessionResult = await sql`
      SELECT session_token FROM multi_sessions WHERE session_code = ${sessionCode}
    ` as { session_token: string }[];
    if (sessionResult.length === 0 || sessionResult[0].session_token !== sessionToken) {
      res.status(403).send({ message: "Invalid session token for this lobby." });
      return;
    }

    gameRef.parameters = {
      ...gameRef.parameters,
      ...parameters
    };
    // Broadcast updated parameters to all lobby members
    broadcastSSE(sessionCode, { type: 'parameters-updated', parameters: gameRef.parameters });
    res.status(200).send({ message: "Parameters updated." });
  } catch (error) {
    console.error("Error updating parameters:", error);
    res.status(500).send({ message: error instanceof Error ? error.message : String(error) });
  }
}

export const validateGuess = async (req: MultiValidateGuessRequest, res: Response) => {
  try {
    const { sessionCode, userName, voxelProp } = req.body;
    const gameRef = games[sessionCode];
    if (!gameRef || !gameRef.commands) {
      res.status(404).send({ message: 'Game not available.' });
      return;
    }
    if (!userName) { // TODO SECURE THE CONNEXION WITH A UNIQUE TOKEN
      res.status(400).send({ message: 'Username not found.' });
      return;
    }
    if(!gameRef.hasAnswered) gameRef.hasAnswered = {}
    if(!gameRef.hasAnswered[userName]) gameRef.hasAnswered[userName] = Array(gameRef.commands.length).fill(false);
    if(gameRef.hasAnswered[userName][gameRef.currentCommandIndex]){
      res.status(400).send({ message: 'Answer already given.' });
      return;
    }
    if(gameRef.commands[gameRef.currentCommandIndex].action != "guess"){
      res.status(400).send({ message: 'Guess delay timed out.' });
      return;
    }

    const [x, y, z] = voxelProp.vox;
    const atlasImage: NVImage = imageRef[gameRef.currentAtlas];
    const atlasMetadata = imageMetadata[gameRef.currentAtlas];
    if (x < 0 || x >= atlasMetadata.nx || y < 0 || y >= atlasMetadata.ny || z < 0 || z >= atlasMetadata.nz) {
      res.status(400).send({ message: 'Coordinates out of bound.' });
      return;
    }

    gameRef.hasAnswered[userName][gameRef.currentCommandIndex] = true; // mark that the user has answered
    const voxelValue: number = atlasImage.getValue(x, y, z);
    const isCorrect: boolean = voxelValue === gameRef.currentRegionId;
    let scoreIncrement = 0
    const command = gameRef.commands[gameRef.currentCommandIndex];
    const now = Date.now();
    const elapsed = (now - (gameRef.stepStartTime || 0));
    if (isCorrect) {
      let bonus = 0;
      if (gameRef.commands && gameRef.commands[gameRef.currentCommandIndex]) {
        if (gameRef.stepStartTime) {
          const bonusTime = Math.max(0, command.duration - (elapsed/1000));
          bonus = Math.floor(bonusTime * BONUS_POINTS_PER_SECOND);
        }
      }
      scoreIncrement = MAX_POINTS_PER_REGION + bonus;
    } else {
        if (regionCenters[gameRef.currentAtlas] && regionCenters[gameRef.currentAtlas][gameRef.currentRegionId]) {
            const centers: number[][] = regionCenters[gameRef.currentAtlas][gameRef.currentRegionId];
            const [xMm, yMm, zMm] = voxelProp.mm;
            // Find the minimum distance to any center of the region
            let minDistance = Infinity;
            for (const center of centers) {
                const distance = Math.sqrt(
                    Math.pow(center[0] - xMm, 2) +
                    Math.pow(center[1] - yMm, 2) +
                    Math.pow(center[2] - zMm, 2)
                );
                if (distance < minDistance) {
                    minDistance = distance;
                }
            }
            // Calculate score based on distance
            if (minDistance <= MAX_PENALTY_DISTANCE) {
                scoreIncrement = Math.floor((1 - (minDistance / MAX_PENALTY_DISTANCE)) * MAX_POINTS_WITH_PENALTY);
            } else {
                scoreIncrement = 0; // No points for too far away
            }
        }
    }
    gameRef.individualScores[userName] += scoreIncrement
    gameRef.individualAttempts[userName] += 1;
    if(isCorrect) gameRef.individualSuccesses[userName] += 1;
    gameRef.individualDurations[userName].push(elapsed);
    if(isCorrect) gameRef.individualCorrectDurations[userName].push(elapsed);
    
    // Broadcast score update to all users via SSE
    broadcastSSE(sessionCode, {
      type: 'score-update',
      user: userName,
      score: gameRef.individualScores[userName]
    });

    res.status(200).send({
      type: 'guess-result',
      isCorrect,
      scoreIncrement,
      totalScore: gameRef.individualScores[userName]
    });
  } catch (error) {
      console.error("Error validating guess:", error);
      res.status(500).send({ message: error instanceof Error ? error.message : String(error) });
  }
}

async function clotureMultiplayerGame(gameRef: MultiplayerGame) {
  try {
    const gameDuration = gameRef.duration ? (Date.now() - gameRef.duration) : 0;
    const allScores = Object.values(gameRef.individualScores);
    const maxScore = Math.max(...allScores);

    for (const username in gameRef.individualScores) {
      // TODO MANAGE ANONYMOUS USERS
      const userResult = await sql`
        SELECT id FROM users WHERE username = ${username}
      ` as { id: number }[];
      if (userResult.length === 0) continue;
      const userId = userResult[0].id;
      const mode = 'multiplayer';
      const atlas = gameRef.currentAtlas;
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

      // Insert into finished_sessions
      await sql`
        INSERT INTO finished_sessions (
          user_id, mode, atlas, score, attempts, correct, incorrect,
          min_time_per_region, max_time_per_region, avg_time_per_region,
          min_time_per_correct_region, max_time_per_correct_region, avg_time_per_correct_region,
          quit_reason, multiplayer_games_won, duration, created_at
        ) VALUES (
          ${userId}, ${mode}, ${atlas}, ${score}, ${attempts}, ${correct}, ${incorrect},
          ${minTimePerRegion}, ${maxTimePerRegion}, ${avgTimePerRegion},
          ${minTimePerCorrectRegion}, ${maxTimePerCorrectRegion}, ${avgTimePerCorrectRegion},
          ${quitReason}, ${multiplayerGamesWon}, ${gameDuration}, NOW()
        )
      `;
    }

    const sessionCode = gameRef.sessionCode 
    await sql`DELETE FROM multi_sessions WHERE session_code = ${sessionCode}`;
    
    // Optionally, broadcast a final message to all clients
    broadcastSSE(sessionCode, { type: 'game-closed' });

    // Cleanup: close all SSE connections for this session
    Object.keys(sseClients)
      .filter(key => key.startsWith(sessionCode + ":"))
      .forEach(key => {
        sseClients[key].forEach(res => {
          try { res.end(); } catch (e) { /* ignore */ }
        });
        delete sseClients[key];
      });

    // Cleanup playerInfo for this session
    Object.keys(playerInfo)
      .filter(key => key.startsWith(sessionCode + ":"))
      .forEach(key => {
        delete playerInfo[key];
      });
      
    // Cleanup game state
    if (gameRef.commandTimeout) {
      clearTimeout(gameRef.commandTimeout);
      gameRef.commandTimeout = undefined;
    }
    for (const key in gameRef) {
      // @ts-ignore
      delete gameRef[key];
    }
    delete games[sessionCode];
  } catch (error) {
      console.error("Error cloturing game:", error);
  }
}

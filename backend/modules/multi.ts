import type { AuthenticatedRequest } from "../interfaces/requests.interfaces.ts";
import { db } from "./database_init.ts";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
type Config = import("../interfaces/config.interfaces.ts").Config;
import configJson from '../config.json' with { type: "json" };
const config: Config = configJson;
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import express from 'express';
import { imageMetadata, imageRef, regionCenters, validRegions } from "./game.ts";
import { NVImage } from "@niivue/niivue";

const DEFAULT_REGION_NUMBER = 15;
const DEFAULT_DURATION_PER_REGION = 15;
const DEFAULT_GAMEOVER_ON_ERROR = false;
const LOAD_ATLAS_DURATION = 3;
const MAX_POINTS_PER_REGION = 50; // 1000 total points / 20 regions
const BONUS_POINTS_PER_SECOND = 1; // nombre de points bonus par seconde restante (max 100*10 = 1000 points)
const MAX_POINTS_WITH_PENALTY = 30 // 30 points max if clicked outside the region
const MAX_PENALTY_DISTANCE = 100; // Arbitrary distance in mm for max penalty (0 points)

interface WSGame extends WebSocket {
  userName?: string;
  gameRef?: MultiplayerGame;
  sessionCode?: string;
} 

interface MultiplayerParametersType {
  atlas?: string
  regionsNumber: number;
  durationPerRegion: number;
  gameoverOnError: boolean;
}

interface MultiplayerGame {
  lobby: Set<WebSocket>;
  sessionCode: string;
  hasStarted: boolean;
  hasEnded: boolean;
  parameters: MultiplayerParametersType;
  commands?: GameCommands[];
  currentCommandIndex: number;
  currentAtlas: string;
  currentRegionId: number;
  duration: number;
  stepStartTime?: number;
  commandTimeout?: NodeJS.Timeout;
  totalGuessNumber: number;
  hasAnswered: Record<string,boolean[]>;
  individualScores: Record<string,number>;
  individualAttempts: Record<string,number>;
  individualSuccesses: Record<string,number>;
  individualDurations: Record<string,number[]>;
  individualCorrectDurations: Record<string,number[]>;
} 

interface AtlasLUT {
  R: number[];
  G: number[];
  B: number[];
  A: number[];
  I: number[];
  labels: string[];
}

interface GameCommands {
  action: string;
  atlas?: string;
  lut?: AtlasLUT;
  regionId?: number;
  duration: number;
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const games: Record<string, MultiplayerGame> = {};

// Helper to generate a unique 8-digit code
function generateCode(): string {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

async function getUniqueCode(): Promise<string> {
    let code: string;
    let exists: { count: number };
    do {
        code = generateCode();
        exists = db.prepare("SELECT COUNT(*) as count FROM multisessions WHERE sessionCode = ?").get(code) as { count: number };
    } while (exists.count > 0);
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
    const userId = (req as AuthenticatedRequest).user.id; 
    const sessionCode = await getUniqueCode();
    const sessionToken = jwt.sign({ userId, sessionCode, type: "multiplayer-creator" }, config.jwt_secret, { expiresIn: "1h" });
    const stmt = db.prepare("INSERT INTO multisessions (sessionCode, sessionToken, creatorId, createdAt) VALUES (?, ?, ?, ?)");
    const result = stmt.run(sessionCode, sessionToken, userId, Date.now());
    res.status(200).send({
        message: "Multiplayer session created.",
        sessionCode,
        sessionId: result.lastInsertRowid,
        sessionToken
    });
};

function joinLobby(ws: WebSocket, usertoken: string, sessionCode: string) {
  let jwtpayload: any;
  try {
    jwtpayload = jwt.verify(usertoken, config.jwt_secret);
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token.' }));
    ws.close();
    return;
  }
  const userName = String(jwtpayload.username);
  (ws as WSGame).userName = userName;
  const session = db.prepare("SELECT * FROM multisessions WHERE sessionCode = ?").get(sessionCode);
  if (!session) {
    ws.send(JSON.stringify({ type: 'error', message: 'Lobby does not exist.' }));
    ws.close();
    return;
  }
  if (!games[sessionCode]){
    games[sessionCode] = {
      lobby: new Set(),
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
      individualCorrectDurations: {}
    }
  }
  const gameRef = games[sessionCode];
  gameRef.lobby.add(ws);
  gameRef.individualScores[userName] = 0;
  gameRef.individualAttempts[userName] = 0;
  gameRef.individualSuccesses[userName] = 0;
  gameRef.individualDurations[userName] = [];
  gameRef.individualCorrectDurations[userName] = [];
  (ws as WSGame).gameRef = gameRef;
  (ws as WSGame).sessionCode = sessionCode;
  
  // Send the list to the newly joined client
  const userList = Array.from(gameRef.lobby)
    .map(client => (client as any).userName)
    .filter(Boolean);
  ws.send(JSON.stringify({ type: 'lobby-users', users: userList }));
  ws.send(JSON.stringify({ type: 'parameters-updated', parameters: gameRef.parameters }));

  // Broadcast to others in the lobby
  gameRef.lobby.forEach(client => {
    if (client !== ws && client.readyState === ws.OPEN) {
      client.send(JSON.stringify({ type: 'player-joined', userName: userName }));
    }
  });
}

function generateGameCommands(params: MultiplayerParametersType): GameCommands[]|undefined {
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
}

function launchGame(ws: WebSocket, sessionToken: string){
  const lobby = (ws as WSGame).gameRef?.lobby;
  const userName = (ws as WSGame).userName;
  const sessionCode = (ws as WSGame).sessionCode
  if (!lobby || !userName || !sessionCode || !Array.from(lobby).some(client => (client as any).userName === userName)) {
    ws.send(JSON.stringify({ type: 'error', message: 'You are not in the lobby.' }));
    return;
  }
  if (lobby.size <= 1) {
    ws.send(JSON.stringify({ type: 'error', message: 'Insufficient users in lobby.' }));
    return;
  }
  const gameRef = games[sessionCode];
  // Check that the sessionToken matches the one in the multisessions table
  const session = db.prepare("SELECT sessionToken FROM multisessions WHERE sessionCode = ?").get(sessionCode) as { sessionToken: string };
  if (!session || session.sessionToken !== sessionToken) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid session token for this lobby.' }));
    return;
  }
  if (gameRef.hasStarted) {
    ws.send(JSON.stringify({ type: 'error', message: 'Game already started.' }));
    return;
  }
  console.log("Starting game", sessionCode)
  gameRef.commands = generateGameCommands(gameRef.parameters) || []
  gameRef.hasStarted = true;
  gameRef.duration = Date.now();
  gameRef.totalGuessNumber = gameRef.parameters.regionsNumber
  // broadcast gamestart to all users
  gameRef.lobby.forEach(client => {
    if (client.readyState === ws.OPEN) {
      client.send(JSON.stringify({ type: 'game-start' }));
    }
  });
  sendNextCommand(gameRef);
}

function sendNextCommand(gameRef: MultiplayerGame) {
  if (!gameRef.commands) return;

  // If all commands sent, stop
  if (gameRef.currentCommandIndex >= gameRef.commands.length) {
    // Optionally broadcast game end
    const allScores = Object.values(gameRef.individualScores);
    const maxScore = Math.max(...allScores);
    gameRef.lobby.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        const userName = (client as WSGame).userName;
        const userScore = userName ? gameRef.individualScores[userName] : undefined;
        const youWon = userScore !== undefined && userScore === maxScore && maxScore > 0;
        client.send(JSON.stringify({ type: 'game-end', scores: gameRef.individualScores, youWon }));
      }
    });
    clotureMultiplayerGame(gameRef)
    return;
  }

  gameRef.stepStartTime = Date.now();
  const command = gameRef.commands[gameRef.currentCommandIndex];
  if(command.action == "load-atlas") gameRef.currentAtlas = command.atlas || ""
  if(command.action == "guess") gameRef.currentRegionId = command.regionId || -1;
  gameRef.lobby.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'game-command', command }));
      client.send(JSON.stringify({ type: 'all-scores-update', scores: gameRef.individualScores }));
    }
  });

  // Schedule next command
  if (gameRef.currentCommandIndex < gameRef.commands.length) {
    const nextDuration = command.duration * 1000; // convert to ms
    gameRef.commandTimeout = setTimeout(() => { 
      gameRef.currentCommandIndex += 1; 
      sendNextCommand(gameRef)
    }, nextDuration);
  }
}

function updateParameters(ws: WebSocket, parameters: MultiplayerParametersType) {
  // Update the game parameters for this lobby
  const gameRef = (ws as WSGame).gameRef;
  if (!gameRef) {
    ws.send(JSON.stringify({ type: 'error', message: 'Game not available.' }));
    return;
  }
  gameRef.parameters = {
    ...gameRef.parameters,
    ...parameters
  };
  // Broadcast updated parameters to all lobby members
  gameRef.lobby.forEach(client => {
    if (client.readyState === ws.OPEN) {
      client.send(JSON.stringify({ type: 'parameters-updated', parameters: gameRef.parameters }));
    }
  });
}

const validateGuess = (ws: WebSocket, voxel: number[]) => {
  const gameRef = (ws as WSGame).gameRef;
  const userName = (ws as WSGame).userName;
  if (!gameRef || !gameRef.commands) {
    ws.send(JSON.stringify({ type: 'error', message: 'Game not available.' }));
    return;
  }
  if (!userName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Username not found.' }));
    return;
  }
  if(!gameRef.hasAnswered) gameRef.hasAnswered = {}
  if(!gameRef.hasAnswered[userName]) gameRef.hasAnswered[userName] = Array(gameRef.commands.length).fill(false);
  if(gameRef.hasAnswered[userName][gameRef.currentCommandIndex]){
    ws.send(JSON.stringify({ type: 'error', message: 'Answer already given.' }));
    return;
  }
  if(gameRef.commands[gameRef.currentCommandIndex].action != "guess"){
    ws.send(JSON.stringify({ type: 'error', message: 'Guess delay timed out.' }));
    return;
  }

  const [x, y, z] = voxel;
  const atlasImage: NVImage = imageRef[gameRef.currentAtlas];
  const atlasMetadata = imageMetadata[gameRef.currentAtlas];
  if (x < 0 || x >= atlasMetadata.nx || y < 0 || y >= atlasMetadata.ny || z < 0 || z >= atlasMetadata.nz) {
    ws.send(JSON.stringify({ type: 'error', message: 'Coordinates out of bound.' }));
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
          const center: number[] = regionCenters[gameRef.currentAtlas][gameRef.currentRegionId];
          const distance = Math.sqrt(
              Math.pow(center[0] - x, 2) +
              Math.pow(center[1] - y, 2) +
              Math.pow(center[2] - z, 2)
          );
          // Calculate score based on distance
          if (distance <= MAX_PENALTY_DISTANCE) {
              scoreIncrement = Math.floor((1 - (distance / MAX_PENALTY_DISTANCE)) * MAX_POINTS_WITH_PENALTY);
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
  ws.send(JSON.stringify({ type: 'guess-result', isCorrect, scoreIncrement, totalScore: gameRef.individualScores[userName] }));
  gameRef.lobby.forEach(client => {
    if (client.readyState === ws.OPEN) {
      client.send(JSON.stringify({ type: 'score-update', user: userName, score: gameRef.individualScores[userName] }));
    }
  });
}

function clotureMultiplayerGame(gameRef: MultiplayerGame) {
  const gameDuration = gameRef.duration ? (Date.now() - gameRef.duration) : 0;
  const allScores = Object.values(gameRef.individualScores);
  const maxScore = Math.max(...allScores);

  // Prepare SQL statements
  const insertFinishedStmt = db.prepare(`
    INSERT INTO finishedsessions (
      userId, mode, atlas, score, attempts, correct, incorrect,
      minTimePerRegion, maxTimePerRegion, avgTimePerRegion,
      minTimePerCorrectRegion, maxTimePerCorrectRegion, avgTimePerCorrectRegion,
      quitReason, multiplayerGamesWon, duration
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // Map usernames to userIds
  const getUserIdStmt = db.prepare('SELECT id FROM users WHERE username = ?');

  for (const username in gameRef.individualScores) {
    const userRow = getUserIdStmt.get(username) as {id: number};
    if (!userRow) continue;
    const userId = userRow.id;
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
    insertFinishedStmt.run(
      userId, mode, atlas, score, attempts, correct, incorrect,
      minTimePerRegion, maxTimePerRegion, avgTimePerRegion,
      minTimePerCorrectRegion, maxTimePerCorrectRegion, avgTimePerCorrectRegion,
      quitReason, multiplayerGamesWon, gameDuration
    );
  }

  const sessionCode = gameRef.sessionCode
  gameRef.lobby.forEach(client => {
    try {
      client.close();
    } catch (e) {
      // Ignore errors
    }
  });
  gameRef.lobby.clear();
  if (gameRef.commandTimeout) {
    clearTimeout(gameRef.commandTimeout);
    gameRef.commandTimeout = undefined;
  }
  for (const key in gameRef) {
    // @ts-ignore
    delete gameRef[key];
  }
  delete games[sessionCode];
}

wss.on('connection', (ws, req) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'join' && data.sessionCode && data.token) {
        joinLobby(ws, data.token, data.sessionCode)
      } else if (data.type === 'launch-game' && data.sessionToken) {
        launchGame(ws, data.sessionToken)
      } else if (data.type === 'update-parameters' && (ws as WSGame).gameRef && typeof data.parameters === 'object') {
        updateParameters(ws, data.parameters)
      } else if (data.type === 'validate-guess' && (ws as WSGame).gameRef && data.voxel) {
        validateGuess(ws, data.voxel)
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: e }));
    }
  });

  ws.on('close', () => {
    // Remove from current lobby
    const gameRef = (ws as WSGame).gameRef;
    if(!gameRef) return;
    const lobby = gameRef.lobby;
    if (lobby && lobby.has(ws)) {
      lobby.delete(ws);
      const userName = (ws as WSGame).userName;
      // Notify remaining clients in this lobby
      lobby.forEach(client => {
        if (client.readyState === ws.OPEN) {
          client.send(JSON.stringify({ type: 'player-left', userName }));
        }
      });
    }
  });
});

server.listen(config.server.websocket_port, () => {
  console.log(`WebSocket running on port ${config.server.websocket_port}`);
});
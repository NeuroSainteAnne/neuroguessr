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
import { validRegions } from "./game.ts";

const DEFAULT_REGION_NUMBER = 15;
const DEFAULT_DURATION_PER_REGION = 15;
const DEFAULT_GAMEOVER_ON_ERROR = false;
const LOAD_ATLAS_DURATION = 5;

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
  hasStarted: boolean;
  hasEnded: boolean;
  parameters: MultiplayerParametersType;
  commands?: GameCommands[];
  currentCommandIndex?: number;
  commandTimeout?: NodeJS.Timeout;
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
  const userName = jwtpayload.username;
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
      hasStarted: false,
      hasEnded: false,
      currentCommandIndex: 0,
      parameters: {
        regionsNumber: DEFAULT_REGION_NUMBER,
        durationPerRegion: DEFAULT_DURATION_PER_REGION,
        gameoverOnError: DEFAULT_GAMEOVER_ON_ERROR
      }
    }
  }
  const gameRef = games[sessionCode];
  gameRef.lobby.add(ws);
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
  // broadcast gamestart to all users
  gameRef.lobby.forEach(client => {
    if (client.readyState === ws.OPEN) {
      client.send(JSON.stringify({ type: 'game-start' }));
    }
  });
  sendNextCommand(gameRef);
}

function sendNextCommand(gameRef: MultiplayerGame) {
  if (!gameRef.commands || gameRef.currentCommandIndex === undefined) return;

  // If all commands sent, stop
  if (gameRef.currentCommandIndex >= gameRef.commands.length) {
    // Optionally broadcast game end
    gameRef.lobby.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'game-end' }));
      }
    });
    return;
  }

  const command = gameRef.commands[gameRef.currentCommandIndex];
  gameRef.lobby.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'game-command', command }));
    }
  });

  // Schedule next command
  gameRef.currentCommandIndex++;
  if (gameRef.currentCommandIndex < gameRef.commands.length + 1) {
    const nextDuration = command.duration * 1000; // convert to ms
    gameRef.commandTimeout = setTimeout(() => sendNextCommand(gameRef), nextDuration);
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
    if (lobby.has(ws)) {
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

server.listen(3001, () => {
  console.log('WebSocket running on port 3001');
});
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

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const lobbies: Record<string, Set<WebSocket>> = {};

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

wss.on('connection', (ws, req) => {
  // Expect the client to send a JSON message with { type: 'join', sessionCode: '12345678', userId: ... }
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'join' && data.sessionCode && data.token) {
        let jwtpayload: any;
        try {
          jwtpayload = jwt.verify(data.token, config.jwt_secret);
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token.' }));
          ws.close();
          return;
        }
        const userName = jwtpayload.username;
        (ws as any).userName = userName;
        const session = db.prepare("SELECT * FROM multisessions WHERE sessionCode = ?").get(data.sessionCode);
        if (!session) {
          ws.send(JSON.stringify({ type: 'error', message: 'Lobby does not exist.' }));
          ws.close();
          return;
        }
        if (!lobbies[data.sessionCode]) lobbies[data.sessionCode] = new Set();
        lobbies[data.sessionCode].add(ws);
        (ws as any).lobby = lobbies[data.sessionCode];
        (ws as any).sessionCode = data.sessionCode;
        
        // Send the list to the newly joined client
        const userList = Array.from(lobbies[data.sessionCode])
          .map(client => (client as any).userName)
          .filter(Boolean);
        ws.send(JSON.stringify({ type: 'lobby-users', users: userList }));

        // Optionally broadcast to others in the lobby
        lobbies[data.sessionCode].forEach(client => {
          if (client !== ws && client.readyState === ws.OPEN) {
            client.send(JSON.stringify({ type: 'player-joined', userName: userName }));
          }
        });
      } else if (data.type === 'launch-game' && data.sessionToken) {
        const lobby = (ws as any).lobby;
        const userName = (ws as any).userName;
        const sessionCode = (ws as any).sessionCode
        if (!lobby || !userName || !Array.from(lobby).some(client => (client as any).userName === userName)) {
          ws.send(JSON.stringify({ type: 'error', message: 'You are not in the lobby.' }));
          return;
        }
        // Check that the sessionToken matches the one in the multisessions table
        const session = db.prepare("SELECT sessionToken FROM multisessions WHERE sessionCode = ?").get(sessionCode) as {sessionToken: string};
        if (!session || session.sessionToken !== data.sessionToken) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid session token for this lobby.' }));
          return;
        }
        console.log("Starting game", sessionCode)
        // broadcast gamestart to all users
        lobbies[sessionCode].forEach(client => {
          if (client.readyState === ws.OPEN) {
            client.send(JSON.stringify({ type: 'game-start' }));
          }
        });
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: e }));
    }
  });

  ws.on('close', () => {
    // Remove from all lobbies
    Object.entries(lobbies).forEach(([code, set]) => {
      if (set.has(ws)) {
        set.delete(ws);
        const userName = (ws as any).userName;
        // Notify remaining clients in this lobby
        set.forEach(client => {
          if (client.readyState === ws.OPEN) {
            client.send(JSON.stringify({ type: 'player-left', userName }));
          }
        });
      }
    });
  });
});

server.listen(3001, () => {
  console.log('Server and WebSocket running on port 3001');
});
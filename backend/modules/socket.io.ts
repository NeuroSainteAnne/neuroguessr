import { Server as SocketServer } from 'socket.io';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { Config } from '../interfaces/config.interfaces.ts';
import configJson from '../config.json' with { type: "json" };
import { logger } from './logging.ts';

const config: Config = configJson;

// Will store Socket.io server instance
let io: SocketServer;

// Initialize Socket.io with your HTTP server
export function initSocketIO(server: Server) {
  io = new SocketServer(server, {
    path: '/socket.io',
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    // Socket.io settings to help with proxies
    transports: ['polling', 'websocket'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.on('connection', (socket) => {
    logger.info('New socket connection:', socket.id);

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info('Client disconnected:', socket.id);
    });
  });

  return io;
}

// Access io instance from other modules
export function getIO(): SocketServer {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}
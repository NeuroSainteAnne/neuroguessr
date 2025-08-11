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
  logger.info('Initializing Socket.IO server');

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
    const clientIP = socket.handshake.address || 'unknown';
    const userAgent = socket.handshake.headers['user-agent'] || 'unknown';
    const connectTime = Date.now();
    
    logger.info('New socket connection established', {
      socketId: socket.id,
      clientIP,
      userAgent,
      transport: socket.conn.transport.name,
      timestamp: new Date().toISOString()
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      const connectionDuration = Date.now() - connectTime;
      logger.info('Socket client disconnected', {
        socketId: socket.id,
        clientIP,
        reason,
        connectionDuration: `${connectionDuration}ms`,
        timestamp: new Date().toISOString()
      });
    });

    // Handle connection errors
    socket.on('error', (error) => {
      logger.error('Socket connection error', {
        socketId: socket.id,
        clientIP,
        error: error.message || 'Unknown socket error',
        stack: error.stack
      });
    });
  });

  logger.info('Socket.IO server initialized successfully');

  return io;
}

// Access io instance from other modules
export function getIO(): SocketServer {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}
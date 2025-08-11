import React, { createContext, useContext, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { consoleLog } from '../utils/logging';

interface SocketContextType {
  getSocket: () => Socket | null;
  createSocket: (socketEmission : (newSocket: Socket) => void) => Socket;
  disconnectSocket: () => void;
  isSocketConnected: () => boolean;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const socketRef = useRef<Socket | null>(null);

  const createSocket = (socketEmission : (newSocket: Socket) => void): Socket => {
    // If we already have a connected socket, return it
    if (socketRef.current && socketRef.current.connected) {
      consoleLog('verbose', 'Reusing existing socket connection');
      socketEmission(socketRef.current);
      return socketRef.current;
    }

    // Disconnect existing socket if it exists but isn't connected
    if (socketRef.current) {
      consoleLog('verbose', 'Cleaning up disconnected socket');
      socketRef.current.disconnect();
    }

    consoleLog('verbose', 'Creating new socket connection');
    const socket = io('/', {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      forceNew: false // Don't force new connection if one exists
    });

    socketRef.current = socket;

    // Add basic connection logging
    socket.on('connect', () => {
      consoleLog('verbose', 'Global socket connected');
      socketEmission(socket);
    });

    socket.on('disconnect', (reason) => {
      consoleLog('verbose', `Global socket disconnected: ${reason}`);
    });

    socket.on('connect_error', (error) => {
      consoleLog('verbose', `Global socket connection error: ${error.message}`);
    });

    return socket;
  };

  const getSocket = (): Socket | null => {
    return socketRef.current;
  };

  const disconnectSocket = () => {
    if (socketRef.current) {
      consoleLog('verbose', 'Manually disconnecting socket');
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  const isSocketConnected = (): boolean => {
    return socketRef.current?.connected || false;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const contextValue: SocketContextType = {
    getSocket,
    createSocket,
    disconnectSocket,
    isSocketConnected
  };

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};

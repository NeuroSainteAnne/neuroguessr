import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { useApp } from '../context/AppContext';
import { useSocket } from '../context/SocketContext';
import { consoleLog } from '../utils/logging';

export interface SingleGameState {
  atlas: string;
  mode: string;
  blindMode: boolean;
  score: number;
  streak: number;
}

export interface GuessResult {
  isCorrect: boolean;
  scoreIncrement: number;
  totalScore: number;
  streak: number;
  distance: number;
  attempts: number;
  regionCompleted: boolean;
}

export interface NextRegionData {
  regionId: number;
  attempts: number;
}

export interface GameEndedData {
  reason: string;
  finalScore: number;
  elapsedTime?: number;
  regionsAnswered?: number;
}

export function useSinglePlayerSocket() {
  const { authToken } = useApp();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [gameState, setGameState] = useState<SingleGameState | null>(null);
  const [currentRegion, setCurrentRegion] = useState<NextRegionData | null>(null);
  const [lastGuessResult, setLastGuessResult] = useState<GuessResult | null>(null);
  const [gameEnded, setGameEnded] = useState<GameEndedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { createSocket } = useSocket();
  const joiningInProgressRef = useRef<boolean>(false);

  useEffect(() => {
    if (isConnected || joiningInProgressRef.current) return;

    joiningInProgressRef.current = true;
    // Initialize socket connection
    const socket =  createSocket(() => {
        consoleLog('verbose', 'Socket connected in singleplayer lobby');
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      joiningInProgressRef.current = false;
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      joiningInProgressRef.current = false;
    });

    // Game events
    socket.on('single-game-started', (data: { message: string; gameState: SingleGameState }) => {
        consoleLog('verbose', 'Single player game started:', data.gameState);
      setGameState(data.gameState);
      setCurrentRegion(null);
      setLastGuessResult(null);
      setGameEnded(null);
      setError(null);
      joiningInProgressRef.current = false;
    });

    socket.on('next-region', (data: NextRegionData) => {
      setCurrentRegion(data);
      setLastGuessResult(null);
      joiningInProgressRef.current = false;
    });

    socket.on('guess-result', (data: GuessResult) => {
      setLastGuessResult(data);
      setGameState(prev => prev ? { ...prev, score: data.totalScore, streak: data.streak } : prev);
      joiningInProgressRef.current = false;
    });

    socket.on('single-game-ended', (data: GameEndedData) => {
      setGameEnded(data);
      setGameState(null);
      setCurrentRegion(null);
      joiningInProgressRef.current = false;
    });

    socket.on('single-game-error', (data: { message: string }) => {
      setError(data.message);
      joiningInProgressRef.current = false;
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setGameState(null);
      setCurrentRegion(null);
      setLastGuessResult(null);
      setGameEnded(null);
      setError(null);
    };
  }, [authToken]);

  const startGame = useCallback((atlas: string, mode: string, blindMode: boolean) => {
    if (!socketRef.current) return;

    const data: any = {
      atlas,
      mode,
      blindMode
    };
    if (authToken) {
      data.authToken = authToken;
    }

    socketRef.current.emit('start-single-game', data);
  }, [authToken]);

  const getNextRegion = useCallback(() => {
    if (!socketRef.current) return;

    const data: any = {};
    if (authToken) {
      data.authToken = authToken;
    }

    socketRef.current.emit('get-next-single-region', data);
  }, [authToken]);

  const validateGuess = useCallback((coordinates: { mm: number[]; vox: number[] }) => {
    if (!socketRef.current) return;

    const data: any = {
      coordinates
    };
    if (authToken) {
      data.authToken = authToken;
    }

    socketRef.current.emit('validate-single-guess', data);
  }, [authToken]);

  const endGame = useCallback(() => {
    if (!socketRef.current || !authToken) return;

    // For now, we'll just clear the local state
    // The server will handle cleanup on disconnect or timeout
    setGameState(null);
    setCurrentRegion(null);
    setLastGuessResult(null);
    setGameEnded(null);
  }, [authToken]);

  return {
    isConnected,
    gameState,
    currentRegion,
    lastGuessResult,
    gameEnded,
    error,
    startGame,
    getNextRegion,
    validateGuess,
    endGame
  };
}
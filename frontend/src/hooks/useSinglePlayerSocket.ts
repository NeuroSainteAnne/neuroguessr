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
  endDate?: Date;
  maxScore?: number; // For time-attack mode: theoretical maximum possible score
}

export interface GuessResult {
  isCorrect: boolean;
  scoreIncrement: number;
  totalScore: number;
  streak: number;
  distance: number;
  attempts: number;
  regionCompleted: boolean;
  consecutiveErrors: number;
  maxErrorsStreak: number;
  pastRegionId?: number;
  regionCenter?: number[];
  regionBoundary?: number[];
  clickedPosition?: {
    mm: number[];
    vox: number[];
  };
}

export interface NextRegionData {
  regionId: number;
  attempts: number;
  askedId?: number; // For time-attack mode: current question number
  totalNumRegions?: number // For time-attack mode: total number of questions
}

export interface GameEndedData {
  reason: string;
  finalScore: number;
  correct: number;
  attempts: number;
  incorrect: number;
  elapsedTime?: number;
  regionsAnswered?: number;
  consecutiveErrors?: number;
  lastDistance?: number;
}

export interface RegionHighlightData {
  regionId: number;
  reason: string;
}

export function useSinglePlayerSocket(isReplay?: number) {
  const { authToken } = useApp();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [gameState, setGameState] = useState<SingleGameState | null>(null);
  const [currentRegion, setCurrentRegion] = useState<NextRegionData | null>(null);
  const [lastGuessResult, setLastGuessResult] = useState<GuessResult | null>(null);
  const [gameEnded, setGameEnded] = useState<GameEndedData | null>(null);
  const [regionHighlight, setRegionHighlight] = useState<RegionHighlightData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { createSocket, getSocket } = useSocket();
  const joiningInProgressRef = useRef<boolean>(false);

  useEffect(() => {
    // Skip socket initialization if in replay mode
    if (isReplay) return;
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
      consoleLog('verbose', 'Single player game started');
      // Parse endDate if it exists (comes as ISO string from server)
      const gameStateData = { ...data.gameState };
      if (gameStateData.endDate) {
        gameStateData.endDate = new Date(gameStateData.endDate);
      }
      setGameState(gameStateData);
      setCurrentRegion(null);
      setLastGuessResult(null);
      setGameEnded(null);
      setRegionHighlight(null);
      setError(null);
      joiningInProgressRef.current = false;
    });

    socket.on('next-region', (data: NextRegionData) => {
      consoleLog('verbose', 'Received next region');
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

    socket.on('region-highlight', (data: RegionHighlightData) => {
      setRegionHighlight(data);
      joiningInProgressRef.current = false;
    });

    // Cleanup on unmount
    return () => {
      joiningInProgressRef.current = false;
        const socketsToClean = [socketRef.current, getSocket()].filter(Boolean);
        
        socketsToClean.forEach(socket => {
        if (socket) {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('single-game-started');
            socket.off('next-region');
            socket.off('guess-result');
            socket.off('single-game-ended');
            socket.off('single-game-error');
            socket.off('region-highlight');
        }
      });
      
      // End any active game before cleanup
      if (socketRef.current) {
          socketRef.current!.emit('end-single-game', {authToken});
      }
      
      setIsConnected(false);
      setGameState(null);
      setCurrentRegion(null);
      setLastGuessResult(null);
      setGameEnded(null);
      setRegionHighlight(null);
      setError(null);
    };
  }, [authToken, isReplay]);

  // Ensure game cleanup when user leaves the page
  useEffect(() => {
    const handleBeforeUnload = () => {
      if(socketRef.current){
        socketRef.current.emit('end-single-game', {authToken});
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [authToken, gameState]);

  const startGame = useCallback((atlas: string, mode: string, blindMode: boolean) => {
    consoleLog("verbose", "Start game called")
    if (!socketRef.current) return;

    const emitStartGame = () => {
      const data: any = {
        atlas,
        mode,
        blindMode
      };
      if (authToken) {
        data.authToken = authToken;
      }
      socketRef.current!.emit('start-single-game', data);
    };

    // If socket is already connected, emit immediately
    if (socketRef.current.connected) {
      emitStartGame();
    } else {
      // Wait for connection and then emit
      const onConnect = () => {
        socketRef.current!.off('connect', onConnect);
        emitStartGame();
      };
      socketRef.current.on('connect', onConnect);
    }
  }, [authToken]);

  const getNextRegion = useCallback(() => {
    if (!socketRef.current) return;

    const emitGetNextRegion = () => {
      const data: any = {};
      if (authToken) {
        data.authToken = authToken;
      }
      socketRef.current!.emit('get-next-single-region', data);
    };

    // If socket is already connected, emit immediately
    if (socketRef.current.connected) {
      emitGetNextRegion();
    } else {
      // Wait for connection and then emit
      const onConnect = () => {
        socketRef.current!.off('connect', onConnect);
        emitGetNextRegion();
      };
      socketRef.current.on('connect', onConnect);
    }
  }, [authToken]);

  const validateGuess = useCallback((coordinates: { mm: number[]; vox: number[] }, pastRegionId?: number) => {
    if (!socketRef.current) return;

    const emitValidateGuess = () => {
      const data: any = {
        coordinates
      };
      if (authToken) {
        data.authToken = authToken;
      }
      if (pastRegionId !== undefined) {
        data.pastRegionId = pastRegionId;
      }
      socketRef.current!.emit('validate-single-guess', data);
    };

    // If socket is already connected, emit immediately
    if (socketRef.current.connected) {
      emitValidateGuess();
    } else {
      // Wait for connection and then emit
      const onConnect = () => {
        socketRef.current!.off('connect', onConnect);
        emitValidateGuess();
      };
      socketRef.current.on('connect', onConnect);
    }
  }, [authToken]);

  const endGame = useCallback(() => {
    if (!socketRef.current) return;

    socketRef.current!.emit('end-single-game', {authToken});

    // Clear local state immediately
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
    regionHighlight,
    error,
    startGame,
    getNextRegion,
    validateGuess,
    endGame
  };
}
export type CanvasInteractionContent = {
    mm: number[];
    vox: number[];
    idx: number | undefined;
} | undefined;

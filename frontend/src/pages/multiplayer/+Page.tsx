import React, { useEffect, useRef, useState } from 'react';
import "./MultiplayerGameScreen.css"
import "../../components/BrainViewer.css"
import { useApp } from '../../context/AppContext';
import ChallengeEmailOptIn from '../../components/ChallengeEmailOptIn';
import { useSocket } from '../../context/SocketContext';
import {  MultiplayerParametersType } from '../../types/types';
import config from "../../../config.json"
import { Socket } from 'socket.io-client';
import { PublishToLeaderboardBox } from '../../components/PublishToLeaderboardBox';
import { BrainViewer, GameProvider, useGame } from '../../components/BrainViewer';
import { consoleLog } from '../../utils/logging';
import { prefetchAtlasJSON, preloadAtlas } from '../../utils/nifti_cache';
import { formatTime } from '../../utils/formatters';

export function Page() {
    const cleanGameCallbackRef = useRef<(() => void)>(() => { consoleLog("verbose", "Clean game callback not initialized") });
    const startGameCallbackRef = useRef<(() => void)>(() => { consoleLog("verbose", "Start game callback not initialized") });
    const resetGameCallbackRef = useRef<(() => void)>(() => {});
    const validateGuessCallbackRef = useRef<(() => void)>(() => { consoleLog("verbose", "Validate guess callback not initialized") });
    const genericKeyPressCallbackRef = useRef<((e: KeyboardEvent) => void)>(() => {});
    const canvasInteractionRef = useRef<((e: { mm: number[]; vox: number[]; idx: number | undefined; } | undefined) => void)>(() => { });
    return (
        <GameProvider gameMode="multiplayer" blindMode={false} 
            cleanGameCallbackRef={cleanGameCallbackRef} startGameCallbackRef={startGameCallbackRef} resetGameCallbackRef={resetGameCallbackRef}
            validateGuessCallbackRef={validateGuessCallbackRef} genericKeyPressCallbackRef={genericKeyPressCallbackRef} canvasInteractionRef={canvasInteractionRef}>
            <MultiPlayer 
                cleanGameCallbackRef={cleanGameCallbackRef} startGameCallbackRef={startGameCallbackRef} resetGameCallbackRef={resetGameCallbackRef}
                validateGuessCallbackRef={validateGuessCallbackRef} genericKeyPressCallbackRef={genericKeyPressCallbackRef} canvasInteractionRef={canvasInteractionRef} />
        </GameProvider>
    )
}

const MultiPlayer = ({
    cleanGameCallbackRef, startGameCallbackRef,
    validateGuessCallbackRef, 
}: {
    cleanGameCallbackRef: React.RefObject<() => void>,
    startGameCallbackRef: React.RefObject<() => void>,
    resetGameCallbackRef: React.RefObject<() => void>,
    validateGuessCallbackRef: React.RefObject<() => void>,
    genericKeyPressCallbackRef: React.RefObject<(e: KeyboardEvent) => void>,
    canvasInteractionRef: React.RefObject<(e: { mm: number[]; vox: number[]; idx: number | undefined; } | undefined) => void>,
}) => {
  const { 
      t, authToken, isLoggedIn, userUsername, 
      pageContext,
      userPublishToLeaderboard,
      addHeaderMessage, clearHeaderMessages, setHeaderTime, setHeaderScore, setAllHeaderMessagesColor,
      showNotification, setAskedAtlas
   } = useApp();

  // Get the current path from pageContext
  const currentPath = pageContext?.urlPathname || '';
  const { 
    guessButtonRef, currentTarget, setPastRegions,
    atlasRef, setHasEnded, hasEndedRef,
    selectedVoxelProp, isGameRunning, setIsGameRunning,
    isConnected, setIsConnected
   } = useGame()
  const { createSocket, getSocket } = useSocket();
  const { askedSessionCode, askedSessionToken } = pageContext.routeParams;
  const [inputCode, setInputCode] = useState<string>("");
  const inputCodeRef = useRef(inputCode);
  const implicitCodeRef = useRef(0);
  const implicitTokenRef = useRef("");
  const [error, setError] = useState<string | null>(null);
  const [lobbyUsers, setLobbyUsers] = useState<string[]>([]);
  const [playerScores, setPlayerScores] = useState<Record<string,number>>({});
  const [maximumScore, setMaximumScore] = useState<number>(0);
  const socketRef = useRef<Socket | null>(null);
  const anonTokenRef = useRef<string|null>(null)
  const [parameters, setParameters] = useState<MultiplayerParametersType|null>(null)
  const countdownInterval = useRef<number | ReturnType<typeof setTimeout> | null>(null);
  const stepEndTime = useRef<number | null>(null);
  const [currentAttempts, setCurrentAttempts] = useState<number>(0);
  const [forceDisplayUpdate, setForceDisplayUpdate] = useState<number>(0);
  const isFirstGuess = useRef<boolean>(true);
  const hasAnswered = useRef<boolean>(false);
  const [showMultiplayerOverlay, setShowMultiplayerOverlay] = useState<boolean>(false)
  const multiplayerOverlayRef = useRef<HTMLDivElement>(null);
  const [hasWon, setHasWon] = useState<boolean>(false)
  const isGuessCooldownRef = useRef<boolean>(false);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const [classicChallengeId, setClassicChallengeId] = useState<number | null>(null);
  const [classicChallengeRankings, setClassicChallengeRankings] = useState<Array<{username: string, score: number, ranking?: number}>>([]);
  const [classicChallengeTotalParticipants, setClassicChallengeTotalParticipants] = useState<number>(0);
  const [isClassicChallenge, setIsClassicChallenge] = useState<boolean>(false);
  const [isClassicChallengeFromCheck, setIsClassicChallengeFromCheck] = useState<boolean | null>(null);
  const [showAuthRequired, setShowAuthRequired] = useState<boolean>(false);
  const [isCheckingClassicChallenge, setIsCheckingClassicChallenge] = useState<boolean>(true);
  const joiningInProgressRef = useRef<boolean>(false);
  const pastRegionIdCounter = useRef<number>(0);
  const currentPastRegionId = useRef<number | null>(null);
  const isReplayMode = useState<boolean>(!askedSessionCode && !!pageContext?.urlParsed.search["replay_multi"]);

  const handleConnect = () => {
    setError(null);
    if (!inputCode.match(/^\d{8}$/)) {
      setError("Please enter a valid 8-digit code.");
      return;
    }

    // First, check if it's a classic challenge
    fetch(`/api/multi/check-classic/${inputCode}`)
      .then(res => res.json())
      .then(data => {
        setIsClassicChallengeFromCheck(data.isClassicChallenge);
        if (data.isClassicChallenge && !isLoggedIn) {
          setShowAuthRequired(true);
          return;
        }
        // Proceed to join
        if(!isLoggedIn && config.activateAnonymousMode){
          if(!anonUsername){
            setError(t("temp_username_or_connect"));
            return;
          }
        }
        // Reset classic challenge state when joining new lobby
        setClassicChallengeRankings([])
        setClassicChallengeTotalParticipants(0)
        setIsClassicChallenge(false)
        joinLobby(inputCode)
      })
      .catch(_ => {
        setError("Failed to check session type.");
      });
  }
  const anonUsernameInputRef = useRef<HTMLInputElement>(null);
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [anonUsername, setAnonUsername] = useState<string>("");
  const anonUsernameRef = useRef(anonUsername);
  const classicChallengeValidated = useRef<boolean>(false);
  const [challengeTitle, setChallengeTitle] = useState<string>("");

  const handleClassicChallengeStart = () => {
    classicChallengeValidated.current = true;
    tryLaunchGame();
  }

  const cleanHeader = () => {
    clearHeaderMessages();
    setHeaderScore("")
    setHeaderTime("")
  }
  
  useEffect(() => {
      const cleanGame = () => {
          cleanHeader();
      }

      if (cleanGameCallbackRef) {
          cleanGameCallbackRef.current = cleanGame; // Set the callback in the ref
      }
  }, [cleanGameCallbackRef]);

  useEffect(()=>{
    inputCodeRef.current = inputCode;
  }, [inputCode])
  useEffect(()=>{
    anonUsernameRef.current = anonUsername;
  }, [anonUsername])

  // Handle replay_multi URL parameter
  useEffect(() => {
    const replayMultiId = pageContext?.urlParsed.search["replay_multi"]
    
    if (replayMultiId) {
      if(!isLoggedIn || !authToken){
        setShowAuthRequired(true);
        return;
      } 
      // Fetch replay data from backend
      fetch(`/api/multi/replay-challenge/${replayMultiId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to fetch replay data: ${res.statusText}`);
        }
        return res.json();
      })
      .then(data => {
        const { pastRegions, atlas, blindMode } = data;
        
        // Set up the game for replay mode
        setPastRegions(pastRegions);
        setAskedAtlas({atlas, blindMode});
        setHasEnded(true);
        
        // Start the game directly in replay mode
        consoleLog('verbose', `Starting replay mode for challenge ${replayMultiId} with ${pastRegions.length} regions`);
      })
      .catch(err => {
        console.error('Error loading replay data:', err);
        setError(err.message || 'Failed to load replay data');
      });
    }
  }, [isLoggedIn, authToken, setPastRegions, setAskedAtlas]);

  const joinLobby = async (inputCode: string) => {
    if (isConnected || joiningInProgressRef.current) return;
    if (!isLoggedIn && !config.activateAnonymousMode) return;
    
    joiningInProgressRef.current = true;
    consoleLog("verbose", `Attempting to join multiplayer lobby: ${inputCode} as ${isLoggedIn ? 'logged-in user' : 'anonymous'}`);

    setError(null);

    // Get or create socket connection (this will reuse existing connection if available)
    const socket = createSocket((newSocket: Socket) => {
      consoleLog('verbose', 'Socket connected in multiplayer lobby');
      consoleLog('verbose', `Joining lobby ${inputCode} as ${isLoggedIn ? userUsername : anonUsername}`);
    
      // Always emit join-lobby - server will detect if it's a classic challenge
      newSocket.emit('join-lobby', {
        sessionCode: inputCode,
        userName: isLoggedIn ? userUsername : anonUsername,
        isAnonymous: !isLoggedIn,
        token: isLoggedIn ? authToken : undefined,
        anonToken: anonTokenRef.current
      });
    });
    socketRef.current = socket;

    // Connection error
    socket.on('connect_error', (err: any) => {
      consoleLog("verbose", `Multiplayer connection error: ${err.message}`);
      setError(`Connection error: ${err.message}`);
      joiningInProgressRef.current = false;
      cleanupSocket();
    });
    socket.on('error', (data: any) => {
      if(data.challengeName) setChallengeTitle(data.challengeName)
      const thisClassicChallengeId = data.challengeId || classicChallengeId;
      let message = data.message || 'An error occurred';
      if(message == "You have already completed this classic challenge"){
        message = t("error_already_completed_challenge", {challengeId: thisClassicChallengeId})  
      }
      setError(message);
      joiningInProgressRef.current = false;
    });
    socket.on('fatal-error', (data: any) => {
      setError(data.message);
      joiningInProgressRef.current = false;
      cleanupSocket();
    });
    socket.on('anon-token', (data: any) => {
      anonTokenRef.current = data.anonToken;
    });
    socket.on('lobby-users', (data: any) => {
      setLobbyUsers(data.users);
      setIsConnected(true);
      joiningInProgressRef.current = false;
      if(!isLoggedIn){
        setIsAnonymous(true)
      }
      if (guessButtonRef.current) guessButtonRef.current.disabled = true;
      tryLaunchGame()
    });
    socket.on('joined-classic-challenge', (data: any) => {
      consoleLog('verbose', 'Successfully joined classic challenge');
      setIsClassicChallenge(true);
      setClassicChallengeId(data.challengeId); // Store the challenge ID
      setLobbyUsers([isLoggedIn ? userUsername : anonUsername]); // Single user for classic challenges
      setIsConnected(true);
      setChallengeTitle(data.challengeName || ""); // Set the challenge title
      joiningInProgressRef.current = false;
      if (guessButtonRef.current) guessButtonRef.current.disabled = true;
      // Store the user-specific session code for classic challenges
      if (data.userSessionCode) {
        implicitCodeRef.current = data.userSessionCode;
      }
      if(data.userSessionToken) {
        implicitTokenRef.current = data.userSessionToken
      }
    });
    socket.on('player-joined', (data: any) => {
      setLobbyUsers(prev => [...prev, data.userName]);
    });
    socket.on('player-left', (data: any) => {
      setLobbyUsers(prev => prev.filter(user => user !== data.userName));
    });
    socket.on('parameters-updated', (data: any) => {
      setParameters(data.parameters);
    });
    socket.on('game-start', () => {
      setCurrentAttempts(0)
      setHasWon(false)
      setForceDisplayUpdate((n)=>n+1)
      isFirstGuess.current = true;
      if (guessButtonRef.current) guessButtonRef.current.disabled = true;
    });
    socket.on('game-command', (data: any) => {
      if (data.command.action === 'countdown') {
        // Handle countdown command
        const duration = data.command.duration || 5; // Default to 5 seconds
        setCountdownRemaining(duration);
        
        // Start countdown timer
        if (countdownInterval.current) {
          clearInterval(countdownInterval.current);
        }
        
        countdownInterval.current = setInterval(() => {
          setCountdownRemaining(prev => {
            if (prev === null || prev <= 1) {
              if (countdownInterval.current) {
                clearInterval(countdownInterval.current);
                countdownInterval.current = null;
              }
              return null;
            }
            return prev - 1;
          });
        }, 1000);
      } else if (data.command.action === 'load-atlas') {
        setIsGameRunning(true);
        // Load the specified atlas in the viewer
        if (data.command.atlas) {
          setAskedAtlas({
            atlas: data.command.atlas,
            lut: data.command.lut || undefined,
            mapping: data.command.mapping || undefined,
            inverseMapping: data.command.inverseMapping || undefined,
            blindMode: data.command.blindMode || false
          })
          cleanHeader();
        }
        startStepCountdown(`${t("loading-atlas")} ${data.command.atlas}`, data.command.duration);
      } else if (data.command === 'preload-atlas') {
        // Handle preload command for multiple atlases
        if (data.atlasesToPreload && Array.isArray(data.atlasesToPreload)) {
          consoleLog('minimal', `🚀 Preloading ${data.atlasesToPreload.length} atlases: ${data.atlasesToPreload.join(', ')}`);
          
          // Preload each atlas in the background
          data.atlasesToPreload.forEach((atlasKey: string) => {
            try {
              preloadAtlas(atlasKey);
              prefetchAtlasJSON(atlasKey);
            } catch (error) {
              console.error(`Failed to preload atlas ${atlasKey}:`, error);
            }
          });
        }
      } else if (data.command.action === 'guess') {
        // Create empty pastRegion entry for the new region
        const pastRegionId = pastRegionIdCounter.current++;
        setPastRegions(prev => [...prev, {
          id: pastRegionId,
          regionId: data.command.regionId,
          atlas: atlasRef.current?.atlas || "",
          isCorrect: false,
          score: 0,
          distance: -1, // Special value to indicate no guess was made
        }]);
        currentPastRegionId.current = pastRegionId;

        hasAnswered.current = false;
        isGuessCooldownRef.current = true;
        currentTarget.current = data.command.regionId
        clearHeaderMessages()
        if(atlasRef.current && atlasRef.current.labels && currentTarget.current){
          const regionName = atlasRef.current.labels[currentTarget.current];
          if(regionName !== undefined) showNotification(regionName, true)
        }
        startStepCountdown(t("remaining-time"), data.command.duration);
        if (guessButtonRef.current) {
          guessButtonRef.current.disabled = true;
        }
        if(!isFirstGuess.current) setCurrentAttempts((n)=>n+1)
        isFirstGuess.current = false;
        setForceDisplayUpdate((n)=>n+1)
        setTimeout(() => {
          isGuessCooldownRef.current = false;
          if (guessButtonRef.current) {
            guessButtonRef.current.disabled = false;
          }
          setForceDisplayUpdate((n)=>n+1)
        }, 1000);
      }
    });
    socket.on('score-update', (data: any) => {
      setPlayerScores(prev => ({
        ...prev,
        [data.user]: data.score
      }));
    });
    socket.on('all-scores-update', (data: any) => {
      setPlayerScores(data.scores);
      setMaximumScore(data.maximumScore)
    });
    socket.on('game-end', (data: any) => {
      setHasEnded(true)
      hasEndedRef.current = true
      clearInterface()
      setHasWon(data.youWon)
      
      // Handle classic challenge data
      if (data.isClassicChallenge) {
        setClassicChallengeRankings(data.rankings || []);
        setClassicChallengeTotalParticipants(data.totalParticipants || 0);
      }
      
      setShowMultiplayerOverlay(true)
    });
    socket.on('guess-result', (data: any) => {
        // Update existing pastRegion if pastRegionId is provided
        if (data.pastRegionId !== undefined) {
          setPastRegions(prev => prev.map(region =>
            region.id === data.pastRegionId
              ? {
                  ...region,
                  isCorrect: data.isCorrect,
                  score: data.scoreIncrement,
                  distance: data.isCorrect ? 0 : data.distance,
                  clickedPosition: data.clickedVoxelProp ? {
                    mm: [...data.clickedVoxelProp.mm],
                    vox: [...data.clickedVoxelProp.vox]
                  } : undefined,
                  regionCenter: data.nearestCenter,
                  regionBoundary: data.nearestBoundary
                }
              : region
          ));
        }
        if (data.isCorrect) {
          setAllHeaderMessagesColor('success');
        } else {
          setAllHeaderMessagesColor('failure');
        }
    });
    
    socket.on('session-code-changed', (data: any) => {
      consoleLog("verbose", `Session code changed from ${data.oldCode} to ${data.newCode}`);
      setInputCode(data.newCode);
      // Update the URL in browser history if needed
      if (window.history && window.history.replaceState) {
        const newUrl = `/multiplayer/${data.newCode}`;
        window.history.replaceState(null, '', newUrl);
      }
    });
    
    socket.on('session-destroyed', (data: any) => {
      consoleLog("verbose", `Session destroyed: ${data.reason}`);
      setError(`Session ended: ${data.reason}`);
      cleanupSocket();
    });
    
    // Clean up event listeners on unmount, but don't disconnect the socket
    return () => {
      cleanupSocketEventListeners();
    };
  };

  const cleanupSocket = () => {
    // Clean up countdown interval
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    }
    setCountdownRemaining(null);
    
    const socket = socketRef.current || getSocket();
    if (socket && socket.connected && inputCodeRef.current) {
      try {
        socket.emit('leave-lobby', {
          sessionCode: inputCodeRef.current,
          userName: isLoggedIn ? userUsername : anonUsernameRef.current,
          ...(isAnonymous && anonTokenRef.current ? { anonToken: anonTokenRef.current } : {}),
          ...(isLoggedIn ? { userToken: authToken } : {})
        });
        consoleLog("verbose", `Sent leave-lobby event for ${isLoggedIn ? userUsername : anonUsername}`);
      } catch (error) {
        consoleLog("verbose", "Error sending leave-lobby event:", error);
      }
    }
    
    // Clean up event listeners but don't disconnect socket (managed by SocketProvider)
    if (socketRef.current) {
      cleanupSocketEventListeners();
      socketRef.current = null;
    }
  };

  const cleanupSocketEventListeners = () => {
    // Clean up from both socketRef and getSocket to be thorough
    const socketsToClean = [socketRef.current, getSocket()].filter(Boolean);
    
    socketsToClean.forEach(socket => {
      if (socket) {
        try {
          // Remove all multiplayer-specific event listeners
          socket.off('connect_error');
          socket.off('error');
          socket.off('fatal-error');
          socket.off('anon-token');
          socket.off('lobby-users');
          socket.off('player-joined');
          socket.off('player-left');
          socket.off('parameters-updated');
          socket.off('game-start');
          socket.off('game-command');
          socket.off('score-update');
          socket.off('all-scores-update');
          socket.off('game-end');
          socket.off('guess-result');
          socket.off('session-code-changed');
          socket.off('session-destroyed');
          socket.off('game-launched');
          
          consoleLog("verbose", "Cleaned up multiplayer socket event listeners");
        } catch (error) {
          consoleLog("verbose", "Error cleaning up socket listeners:", error);
        }
      }
    });
  };

  const tryLaunchGame = async () => {
    const socket = getSocket();
    if (socket && socket.connected && isConnected) {
      const sessionCode = isClassicChallenge ? implicitCodeRef.current : askedSessionCode;
      if (sessionCode) {
        if (isClassicChallenge) {
          if(!classicChallengeValidated.current){ return ; } // Wait until classic challenge is validated
          // For classic challenges, emit launch-game without session token
          socket.emit('launch-game', {
            sessionCode: sessionCode,
            sessionToken: implicitTokenRef.current,
            userToken: isLoggedIn ? authToken : undefined
          });
        } else if (askedSessionToken && isLoggedIn) {
          // For regular multiplayer, require session token
          socket.emit('launch-game', {
            sessionCode: sessionCode,
            sessionToken: askedSessionToken,
            userToken: authToken
          });
        }
        
        socket.once('game-launched', (data: any) => {
          if (data.success) {
            consoleLog('verbose', 'Game launched successfully');
          } else {
            setError(data.message || t('error_launching_game'));
          }
        });
      }
    }
  }

  useEffect(() => {
      const startGame = () => {
        if (guessButtonRef.current) guessButtonRef.current.disabled = true;
      }
      if (startGameCallbackRef) {
          startGameCallbackRef.current = startGame; // Set the callback in the ref
      }
  }, [startGameCallbackRef]);

  const startStepCountdown = (instruction: string, duration: number) => {
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    const end = Date.now() + duration * 1000;
    stepEndTime.current = end;
    countdownInterval.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
      const seconds = (remaining % 60).toString().padStart(2, '0');
      setHeaderTime(`${instruction} ${minutes}:${seconds}`);
      if (remaining <= 0 && countdownInterval.current) {
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
      }
    }, 250);
  };

  const updateGameDisplay = () => {
    const socket = getSocket();
    if (isGameRunning && socket && socket.connected && 
        currentTarget.current !== null && atlasRef.current && 
        atlasRef.current.labels && currentTarget.current !== undefined && 
        atlasRef.current.labels[currentTarget.current]) {
      const prefix = t('find') || 'Find: ';
      addHeaderMessage({ 
        text: `${currentAttempts+1}/${parameters?.regionsNumber} - ${prefix}${atlasRef.current.labels[currentTarget.current]}`,
        forceClear: true,
        minDuration: 1000
      });
    } else {
      clearHeaderMessages();
    }
  }
  useEffect(() => {
    updateGameDisplay();
  }, [parameters, currentAttempts, forceDisplayUpdate]);

  function clearInterface () {
      setIsConnected(false);
      setIsGameRunning(false)
      if(countdownInterval.current) clearInterval(countdownInterval.current);
      countdownInterval.current = null;
      clearHeaderMessages();
      setHeaderTime("")
  }

  useEffect(() => {
    if (askedSessionCode) {
      setIsCheckingClassicChallenge(true);
      // Check if it's a classic challenge
      fetch(`/api/multi/check-classic/${askedSessionCode}`)
        .then(res => res.json())
        .then(data => {
          setIsClassicChallengeFromCheck(data.isClassicChallenge);
          if (data.isClassicChallenge && !isLoggedIn) {
            setShowAuthRequired(true);
          } else {
            // Proceed as normal
            if (isLoggedIn) {
              clearInterface()
              setLobbyUsers([])
              setPlayerScores({})
              setShowMultiplayerOverlay(false)
              setClassicChallengeRankings([])
              setClassicChallengeTotalParticipants(0)
              setIsClassicChallenge(false)
              setInputCode(askedSessionCode)
              joinLobby(askedSessionCode)
            } else if (config.activateAnonymousMode) {
              setIsAnonymous(false)
              clearInterface()
              setLobbyUsers([])
              setPlayerScores({})
              setShowMultiplayerOverlay(false)
              setClassicChallengeRankings([])
              setClassicChallengeTotalParticipants(0)
              setIsClassicChallenge(false)
              setInputCode(askedSessionCode)
              if(anonUsernameInputRef.current) anonUsernameInputRef.current.focus();
            }
          }
          setIsCheckingClassicChallenge(false);
        })
        .catch(_ => {
          // On error, proceed as if not classic challenge
          if (isLoggedIn) {
            clearInterface()
            setLobbyUsers([])
            setPlayerScores({})
            setShowMultiplayerOverlay(false)
            setClassicChallengeRankings([])
            setClassicChallengeTotalParticipants(0)
            setIsClassicChallenge(false)
            setInputCode(askedSessionCode)
            joinLobby(askedSessionCode)
          } else if (config.activateAnonymousMode) {
            setIsAnonymous(false)
            clearInterface()
            setLobbyUsers([])
            setPlayerScores({})
            setShowMultiplayerOverlay(false)
            setClassicChallengeRankings([])
            setClassicChallengeTotalParticipants(0)
            setIsClassicChallenge(false)
            setInputCode(askedSessionCode)
            if(anonUsernameInputRef.current) anonUsernameInputRef.current.focus();
          }
          setIsCheckingClassicChallenge(false);
        });
    } else {
      setIsCheckingClassicChallenge(false);
    }
  }, [askedSessionCode, isLoggedIn])

  useEffect(()=>{
    tryLaunchGame()
  }, [askedSessionToken, isConnected])

  useEffect(() => {
    return () => {
      cleanupSocket();
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      clearHeaderMessages();
      setHeaderTime("")
    };
  }, [])

  // Frontend - queue guess submissions
  const guessQueue = useRef<boolean>(false);

  const validateGuess = async () => {
    if (guessQueue.current) return;
    guessQueue.current = true;
    try {
      const socket = getSocket();
      if (!selectedVoxelProp.current || !isGameRunning || !currentTarget.current || !socket || !socket.connected || isGuessCooldownRef.current) {
        console.warn('Cannot validate guess:', { selectedVoxelProp, isGameRunning, currentTarget });
        return;
      }
      if (guessButtonRef.current) guessButtonRef.current.disabled = true;

      hasAnswered.current = true;

      socket.emit('validate-guess', {
        sessionCode: isClassicChallenge ? implicitCodeRef.current : inputCode,
        userName: isLoggedIn ? userUsername : anonUsername,
        voxelProp: selectedVoxelProp.current,
        pastRegionId: currentPastRegionId.current,
        ...(isAnonymous && anonTokenRef.current ? { anonToken: anonTokenRef.current } : {}),
        ...(isLoggedIn ? { userToken: authToken } : {})
      });
    } finally {
      guessQueue.current = false;
    }
  }

  useEffect(() => {
      if (validateGuessCallbackRef) {
          validateGuessCallbackRef.current = validateGuess; // Set the callback in the ref
      }
  }, [validateGuessCallbackRef, isGameRunning, isAnonymous, userUsername, isLoggedIn, authToken, getSocket]);


  const renderWaitingContent = ({error}: {error: string|null}) => {
    // Show auth required screen for classic challenges when not logged in
    if (showAuthRequired) {
      return (
        <div className="waiting-content">
          <div className="join-multiplayer-box">
            <h2>{t("classic_challenge_requires_login") || "Classic Challenge Requires Login"}</h2>
            <p>{t("please_login_or_signup") || "Please log in or sign up to participate in this classic challenge."}</p>
            <div className="auth-buttons">
              <a href={`/login?returnURL=${encodeURIComponent(currentPath)}`} className="join-multiplayer-button">{t("sign_in") || "Sign In"}</a>
              <a href={`/register?returnURL=${encodeURIComponent(currentPath)}`} className="join-multiplayer-button ">{t("sign_up") || "Sign Up"}</a>
            </div>
          </div>
        </div>
      );
    }

    // Show error screen if there's an error and we're not connected/in-game
    if (error && !isConnected && !isGameRunning) {
      return (
        <div className="waiting-content">
          <div className="join-multiplayer-box">
            <h2>{t("join_multiplayer_lobby")}</h2>
            {challengeTitle && <h2>{challengeTitle}</h2>}
            <div style={{ color: 'red', marginTop: 16, fontSize: 18 }} dangerouslySetInnerHTML={{__html:error}}></div>
          </div>
        </div>
      );
    }

    if ((isLoggedIn && !askedSessionCode && !isReplayMode) || 
        (!isLoggedIn && config.activateAnonymousMode && 
          !isConnected && !askedSessionToken && isClassicChallengeFromCheck !== true && !isCheckingClassicChallenge)) {
      return (<div className="waiting-content">
        <div className="join-multiplayer-box">
          <h2>{t("join_multiplayer_lobby")}</h2>
          <input
            type="text"
            value={inputCode}
            onChange={e => setInputCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder={t("multi_8_digits")}
            style={{ fontSize: 24, letterSpacing: 4, textAlign: 'center', width: 250, border:"1px solid white" }}
          />
          {!isLoggedIn && config.activateAnonymousMode &&
            <input
              type="text"
              value={anonUsername}
              ref={anonUsernameInputRef}
              onChange={e => setAnonUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16))}
              placeholder={t("placeholder_tempusername")}
              style={{ fontSize: 18, letterSpacing: 4, textAlign: 'center', 
                width: 250, border:"1px solid white" }}
            />
          }
          <button className="join-multiplayer-button"  data-umami-event="multiplayer join button" onClick={handleConnect}>{t("join_multiplayer_button")}</button>
          {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}
        </div>
        {!isLoggedIn && <div className="multiplayer-suggest-login" 
          dangerouslySetInnerHTML={{__html:t("multi_suggest_login")
          .replace("#",`?redirect=multiplayer-game${(askedSessionCode?`&redirect_asked_session_code=${askedSessionCode}`:"")}${(askedSessionToken?`&redirect_asked_session_token=${askedSessionToken}`:"")}#`)}}></div>}
      </div>)
    }

    if (isConnected && !isGameRunning && isClassicChallenge && !classicChallengeValidated.current) {
      return (
        <div className="waiting-content">
          {challengeTitle && <h2>{challengeTitle}</h2>}
          <button className="start-classic-challenge-button"  data-umami-event="multiplayer start-classic button" onClick={handleClassicChallengeStart}>{t("start_classic_button")}</button>
          <div className='start-classic-challenge-warning'>{t("classic_challenge_start_warning")}</div>
        </div>
      );
    }

    if (isConnected && !isGameRunning) {
      if(countdownRemaining !== null && countdownRemaining >= 0){
        return (
          <div className="waiting-content">
              <div className="countdown-display">
                <h3>{t("game_starting_in") || "Game starting in..."}</h3>
                <div className="countdown-number" style={{ 
                  fontSize: '48px', 
                  fontWeight: 'bold', 
                  color: '#ff6b6b',
                  textAlign: 'center',
                  margin: '20px 0'
                }}>
                  {formatTime({ms:countdownRemaining*1000})}
                </div>
                {!isClassicChallenge && <div>
                  <h4>{t("players_in_lobby")}: {lobbyUsers.length}</h4>
                  <ul>
                      {lobbyUsers.map((user, index) => (
                        <li key={`waiting-user-${index}`}>
                          {user}
                        </li>
                      ))}
                  </ul>
                </div>}
              </div>
            {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}
          </div>
        );
      } else if (!isClassicChallenge) {
        return (
          <div className="waiting-content">
            <h3>{t("waiting_game_start") || "Waiting for game to start..."}</h3>
            <div className="waiting-display">
              <div>
                <h4>{t("players_in_lobby")}: {lobbyUsers.length}</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {lobbyUsers.map((user, index) => (
                      <li key={`waiting-user-${index}`} style={{ margin: '5px 0' }}>
                        {user}
                      </li>
                    ))}
                </ul>
              </div>
              {parameters && <div>
                <h4>{t("parameters")}</h4>
                {parameters?.commands && <div>{t("parameters_manual_commands")}</div>}
                {!parameters?.commands && parameters?.atlas && <div>{t("parameters_atlas")}: {parameters.atlas}</div>}
                {<div>{t("number_regions")}: {parameters.regionsNumber}</div>}
                {parameters?.commands && parameters?.totalDuration && <div>{t("parameters_total_duration")}: {Math.floor(parameters.totalDuration / 60)}m {parameters.totalDuration % 60}s</div>}
                {!parameters?.commands &&<div>{t("duration_per_region")}: {parameters.durationPerRegion}</div>}
                {!parameters?.commands && parameters?.blindMode && <div>{t("blind_mode")}</div>}
                {false && parameters?.gameoverOnError && <div>{t("gameover_first_error_activated")}</div>}
              </div>}
            </div>
            {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}
          </div>
        );
      }
    }
    
    return null;
  };

  const title = t("neuroguessr_multiplayer_title")
  return (
    <>
      <title>{title}</title>
      
      <BrainViewer alternateContent={renderWaitingContent({error})} />
      
      {isGameRunning && (
        <div className="multiplayer-score-display">
          <div className="current-user-score">
            <div>
              {t("score")}: {playerScores[isLoggedIn ? userUsername : anonUsername] ?? 0}
              {maximumScore && <span className='maximum-score'> / {maximumScore}</span>}
            </div>
            <div className="position">
              {(() => {
                const currentUser = isLoggedIn ? userUsername : anonUsername;
                const sortedUsers = [...lobbyUsers].sort((a, b) => {
                  const scoreA = playerScores[a] ?? 0;
                  const scoreB = playerScores[b] ?? 0;
                  return scoreB - scoreA;
                });
                const position = sortedUsers.indexOf(currentUser) + 1;
                return `#${position}/${lobbyUsers.length}`;
              })()}
            </div>
          </div>
          
          <div className="score-divider"></div>
          
          <div className="all-scores">
            <div className="score-list">
              {(() => {
                const currentUser = isLoggedIn ? userUsername : anonUsername;
                const sortedUsers = [...lobbyUsers].sort((a, b) => {
                  const scoreA = playerScores[a] ?? 0;
                  const scoreB = playerScores[b] ?? 0;
                  return scoreB - scoreA;
                });
                
                return sortedUsers.map((user, index) => {
                  const score = playerScores[user] ?? 0;
                  const isCurrentUser = user === currentUser;
                  
                  return (
                    <div 
                      key={user} 
                      className={`score-item ${isCurrentUser ? 'current-user' : ''}`}
                    >
                      <span className="position">#{index + 1}</span>
                      <span className="username">{user}</span>
                      <span className="score">{score}</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
      
      {!isLoggedIn && !config.activateAnonymousMode && 
          <div className="multiplayer-please-login" 
            dangerouslySetInnerHTML={{__html:t("multi_unavailable_login")
            .replace("#",`?redirect=multiplayer-game${(askedSessionCode?`&redirect_asked_session_code=${askedSessionCode}`:"")}${(askedSessionToken?`&redirect_asked_session_token=${askedSessionToken}`:"")}#`)}}></div>
      }
      
      {showMultiplayerOverlay && <div id="time-attack-end-overlay" className="time-attack-overlay">
        <div className="overlay-content" ref={multiplayerOverlayRef}>
          {isClassicChallenge ? (
            // Classic Challenge Ending Screen
            <>
              <h2>{t("classic_challenge_ended_title") || "Classic Challenge Completed"}</h2>
              
              {/* User's Score */}
              <div style={{ textAlign: 'center', margin: '20px 0' }}>
                <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {t("your_score") || "Your Score"}: {playerScores[isLoggedIn ? userUsername : anonUsername] || 0}
                </p>
              </div>

              {/* Ranking or Publish Prompt */}
              {(() => {
                const currentUser = isLoggedIn ? userUsername : anonUsername;
                const userScore = playerScores[currentUser] || 0;
                
                if (userPublishToLeaderboard === true) {
                  // User publishes to leaderboard - show their ranking from the rankings array
                  const existingRanking = classicChallengeRankings.find(r => r.username === currentUser);
                  
                  let rankingsToUse = classicChallengeRankings;
                  let totalParticipants = classicChallengeTotalParticipants;
                  
                  if (!existingRanking) {
                    // Add user's score to rankings if not already included
                    rankingsToUse = [...classicChallengeRankings, { username: currentUser, score: userScore }];
                    // Sort by score descending, then by username for tie-breaking
                    rankingsToUse.sort((a, b) => {
                      if (b.score !== a.score) return b.score - a.score;
                      return a.username.localeCompare(b.username);
                    });
                    // Add ranking numbers
                    rankingsToUse = rankingsToUse.map((r, index) => ({ ...r, ranking: index + 1 }));
                    totalParticipants += 1;
                  }
                  
                  const userRanking = rankingsToUse.find(r => r.username === currentUser);
                  
                  return (
                    <div style={{ textAlign: 'center', margin: '20px 0' }}>
                      <p style={{ fontSize: '20px' }}>
                        {t("your_temp_ranking") || "Your Temporary Ranking"}: #{userRanking?.ranking || '?'} / {totalParticipants}
                      </p>
                      <p style={{ fontSize: '16px', color: '#666' }}>
                        {t("total_participants") || "Total Participants"}: {totalParticipants}
                      </p>
                    </div>
                  );
                } else {
                  // User doesn't publish to leaderboard
                  return (
                    <PublishToLeaderboardBox forRank={true}/>
                  );
                }
              })()}

              {/* Publish to Leaderboard Box for users who haven't set preference */}
              {isLoggedIn && !isClassicChallenge && userPublishToLeaderboard === null && <PublishToLeaderboardBox />}
              
              {/* Challenge Results Button */}
              {classicChallengeId && (
                <div style={{ textAlign: 'center', margin: '20px 0' }}>
                  <a 
                    href={`/challenge-results/${classicChallengeId}`}
                    className="join-multiplayer-button"
                    style={{ display: 'inline-block', textDecoration: 'none' }}
                  >
                    {t("view_challenge_results") || "View Challenge Results"}
                  </a>
                  <div style={{ marginTop: 12 }}>
                    <ChallengeEmailOptIn challengeId={classicChallengeId} />
                  </div>
                </div>
              )}
            </>
          ) : (
            // Regular Multiplayer Ending Screen
            <>
              <h2>{t("multiplayer_ended_title")}</h2>
              <p><span>{t("multiplayer_ended_score")}</span></p>
              <ul style={{ fontSize: 20, listStyle: 'none', padding: 0 }}>
                {[...lobbyUsers]
                  .sort((a, b) => {
                    const scoreA = playerScores[a];
                    const scoreB = playerScores[b];
                    if (scoreA === undefined && scoreB === undefined) return 0;
                    if (scoreA === undefined) return 1;
                    if (scoreB === undefined) return -1;
                    return scoreB - scoreA;
                  })
                  .map((u) => (
                    <li key={u} style={(u === userUsername || u === anonUsername) ? { color: (hasWon?'green':'red'), fontWeight: 'bold' } : {}}>
                      {u}{playerScores[u] !== undefined ? " " + playerScores[u] : ""}
                    </li>
                  ))
                }
              </ul>
              <h2>{hasWon?t("multiplayer_you_won"):t("multiplayer_you_lost")}</h2>
              {isLoggedIn && userPublishToLeaderboard === null && <PublishToLeaderboardBox />}
            </>
          )}

          <div className="overlay-buttons">
            <button 
              className="eye-button" 
              onClick={() => setShowMultiplayerOverlay(false)}
              data-umami-event="show review button" 
              data-umami-event-overlay="time-attack"
            >
              <i className="fas fa-eye"></i>
            </button>
            <a id="go-back-menu-button-time-attack" className="home-button" href="/welcome/multiplayer">
              <i className="fas fa-home"></i>
            </a>
          </div>
        </div>
      </div>}
    </>
  )
}
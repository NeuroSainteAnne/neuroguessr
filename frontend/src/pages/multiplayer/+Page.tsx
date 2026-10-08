import React, { useEffect, useRef, useState } from 'react';
import "./MultiplayerGameScreen.css"
import "../../components/BrainViewer.css"
import { useApp } from '../../context/AppContext';
import ChallengeEmailOptIn from '../../components/ChallengeEmailOptIn';
import { useSocket } from '../../context/SocketContext';
import {  MultiplayerParametersType, PastRegion } from '../../types/types';
import config from "../../../config.json"
import { Socket } from 'socket.io-client';
import { PublishToLeaderboardBox } from '../../components/PublishToLeaderboardBox';
import { BrainViewer, GameProvider, useGame } from '../../components/BrainViewer';
import { consoleLog } from '../../utils/logging';
import { prefetchAtlasJSON, preloadAtlas } from '../../utils/nifti_cache';
import { GuessResult } from '../../hooks/useSinglePlayerSocket';

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
  const sessionNameRef = useRef<string>("");
  const sessionDateRef = useRef<string>("");
  const [showMultiplayerOverlay, setShowMultiplayerOverlay] = useState<boolean>(false)
  const multiplayerOverlayRef = useRef<HTMLDivElement>(null);
  const [hasWon, setHasWon] = useState<boolean>(false)
  const isGuessCooldownRef = useRef<boolean>(false);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const countdownTotal = useRef<number>(5);
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
  const isReplayMode = !askedSessionCode && (!!pageContext?.urlParsed.search["replay_multi"] || !!pageContext?.urlParsed.search["replay_session"]);

  // Chat state
  type ChatMsg = { userName: string; message: string; timestamp: number; visibleUntil: number };
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  const handleConnect = () => {
    setError(null);
    if (!inputCode.match(/^\d{8}$/)) {
      setError(t("Invalid session code format. Must be 8 digits."));
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
        setError(t("Failed to check session type"));
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

  // Handle replay_multi and replay_session URL parameters — runs only once
  const replayMultiId = pageContext?.urlParsed.search["replay_multi"];
  const replaySessionId = pageContext?.urlParsed.search["replay_session"];
  const replayId = replayMultiId || replaySessionId;
  const replayLoadedRef = useRef(false);

  useEffect(() => {
    if (!replayId || replayLoadedRef.current) return;
    if (!isLoggedIn || !authToken) {
      setShowAuthRequired(true);
      return;
    }
    replayLoadedRef.current = true;

    const url = replayMultiId
      ? `/api/multi/replay-challenge/${replayMultiId}`
      : `/api/multi/replay-session/${replaySessionId}`;

    fetch(url, { headers: { 'Authorization': `Bearer ${authToken}` } })
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch replay data: ${res.statusText}`);
        return res.json();
      })
      .then(data => {
        const { pastRegions, atlas, blindMode, sessionName, sessionDate } = data;
        setHasEnded(true);
        setPastRegions(pastRegions);
        setAskedAtlas({atlas, blindMode});
        if (sessionName) sessionNameRef.current = sessionName;
        if (sessionDate) sessionDateRef.current = sessionDate;
        consoleLog('verbose', `Starting replay mode for ${replayId} with ${pastRegions.length} regions`);
      })
      .catch(err => {
        console.error('Error loading replay data:', err);
        setError(t(err.message) || t('Failed to load replay data'));
      });
  }, [replayId, isLoggedIn, authToken]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setError(`${t("Connection error")}: ${t(err.message)}`);
      joiningInProgressRef.current = false;
      cleanupSocket();
    });
    socket.on('error', (data: any) => {
      if(data.challengeName) setChallengeTitle(data.challengeName)
      const thisClassicChallengeId = data.challengeId || classicChallengeId;
      let message = data.message || 'An error occurred';
      if(message == "You have already completed this classic challenge"){
        message = t("error_already_completed_challenge", {challengeId: thisClassicChallengeId})  
      } else {
        message = t(message)
      }
      setError(message);
      joiningInProgressRef.current = false;
    });
    socket.on('fatal-error', (data: any) => {
      setError(t(data.message));
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
        countdownTotal.current = duration;
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
          setHeaderTime(`${t("loading-atlas")} ${data.command.atlas}`);
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
    socket.on('guess-result', (data: GuessResult) => {
        // Update existing pastRegion if pastRegionId is provided
        if (data.pastRegionId !== undefined) {
          const clickedVox = data.clickedPosition?.vox;
          const clickedIdx = (clickedVox && atlasRef.current)
              ? atlasRef.current.getValue(clickedVox[0]!, clickedVox[1]!, clickedVox[2]!)
              : undefined;
          const clickedRegionName = clickedIdx !== undefined && atlasRef.current
              ? atlasRef.current.labels?.[clickedIdx] ?? undefined
              : undefined;
          setPastRegions(prev => prev.map(region =>
            region.id === data.pastRegionId
              ? {
                  ...region,
                  isCorrect: data.isCorrect,
                  score: data.scoreIncrement,
                  distance: data.isCorrect ? 0 : data.distance,
                  clickedPosition: data.clickedPosition,
                  regionCenter: data.regionCenter,
                  regionBoundary: data.regionBoundary,
                  clickedRegionName: clickedRegionName
                } as PastRegion
              : region
          ));
        }
        if (data.isCorrect) {
          setAllHeaderMessagesColor('success');
        } else {
          setAllHeaderMessagesColor('failure');
        }
    });
    
    socket.on('chat-message', (data: any) => {
      const visibleUntil = Date.now() + 10_000;
      setChatMessages(prev => [...prev, { ...data, visibleUntil }]);
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
      setError(`${t('Session ended')}: ${t(data.reason)}`);
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
          socket.off('chat-message');
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
            setError(t(data.message) || t('error_launching_game'));
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

  // Prune chat messages that have expired (auto-hide after 10s, only during game)
  useEffect(() => {
    const id = setInterval(() => {
      if (!isGameRunning) return;
      const now = Date.now();
      setChatMessages(prev => prev.filter(m => m.visibleUntil > now));
    }, 1000);
    return () => clearInterval(id);
  }, [isGameRunning]);

  // Auto-scroll chat to bottom on new message
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const sendChat = () => {
    const msg = chatInput.trim();
    if (!msg || msg.length > 500) return;
    const socket = getSocket();
    if (!socket || !socket.connected || !isLoggedIn || !authToken) return;
    const sessionCode = isClassicChallenge ? implicitCodeRef.current : inputCodeRef.current;
    if (!sessionCode) return;
    socket.emit('send-chat-message', { sessionCode, userToken: authToken, message: msg });
    setChatInput("");
  };

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


  const renderChat = () => (
    <div
      className="multiplayer-chat"
    >
      <div className="chat-messages">
        {chatMessages.map((m, i) => (
          <div key={i} className="chat-bubble">
            <span className="chat-username">{m.userName}</span>
            <span className="chat-text">{m.message}</span>
          </div>
        ))}
        <div ref={chatMessagesEndRef} />
      </div>
      {isLoggedIn && (
        <div className="chat-input-row">
          <input
            className="chat-input"
            type="text"
            value={chatInput}
            maxLength={500}
            placeholder={t("chat_placeholder") || "Say something..."}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sendChat(); } }}
          />
          <button className="chat-send-btn" onClick={sendChat}>&#9654;</button>
        </div>
      )}
    </div>
  );

  const renderWaitingContent = ({error}: {error: string|null}) => {
    // Show auth required screen for classic challenges when not logged in
    if (showAuthRequired) {
      return (
        <div className="waiting-content">
          <div className="waiting-content-left">
            <div className="join-multiplayer-box">
              <h2>{t("classic_challenge_requires_login") || "Classic Challenge Requires Login"}</h2>
              <p>{t("please_login_or_signup") || "Please log in or sign up to participate in this classic challenge."}</p>
              <div className="auth-buttons">
                <a href={`/login?returnURL=${encodeURIComponent(currentPath)}`} className="join-multiplayer-button">{t("sign_in") || "Sign In"}</a>
                <a href={`/register?returnURL=${encodeURIComponent(currentPath)}`} className="join-multiplayer-button ">{t("sign_up") || "Sign Up"}</a>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Show error screen if there's an error and we're not connected/in-game
    if (error && !isConnected && !isGameRunning) {
      return (
        <div className="waiting-content">
          <div className="waiting-content-left">
            <div className="join-multiplayer-box">
              <h2>{t("join_multiplayer_lobby")}</h2>
              {challengeTitle && <h2>{challengeTitle}</h2>}
              <div style={{ color: 'red', marginTop: 16, fontSize: 18 }} dangerouslySetInnerHTML={{__html:error}}></div>
            </div>
          </div>
        </div>
      );
    }

    if ((isLoggedIn && !askedSessionCode && !isReplayMode) || 
        (!isLoggedIn && config.activateAnonymousMode && 
          !isConnected && !askedSessionToken && isClassicChallengeFromCheck !== true && !isCheckingClassicChallenge)) {
      return (<div className="waiting-content">
        <div className="waiting-content-left"><div className="join-multiplayer-box">
          <h2>{t("join_multiplayer_lobby")}</h2>
          <input
            type="text"
            value={inputCode}
            onChange={e => setInputCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder={t("multi_8_digits")}
            style={{ fontSize: 24, letterSpacing: 4, textAlign: 'center', minWidth: 250, border:"1px solid white", boxSizing:"border-box" }}
          />
          {!isLoggedIn && config.activateAnonymousMode &&
            <input
              type="text"
              value={anonUsername}
              ref={anonUsernameInputRef}
              onChange={e => setAnonUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16))}
              placeholder={t("placeholder_tempusername")}
              style={{ fontSize: 18, letterSpacing: 4, textAlign: 'center', 
                minWidth: 250, border:"1px solid white", boxSizing:"border-box" }}
            />
          }
          <button className="join-multiplayer-button"  data-umami-event="multiplayer join button" onClick={handleConnect}>{t("join_multiplayer_button")}</button>
          {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}
        </div>
        {!isLoggedIn && <div className="multiplayer-suggest-login" 
          dangerouslySetInnerHTML={{__html:t("multi_suggest_login")
          .replace("#",`?redirect=multiplayer-game${(askedSessionCode?`&redirect_asked_session_code=${askedSessionCode}`:"")}${(askedSessionToken?`&redirect_asked_session_token=${askedSessionToken}`:"")}#`)}}></div>}
      </div></div>)
    }

    if (isConnected && !isGameRunning && isClassicChallenge && !classicChallengeValidated.current) {
      return (
        <div className="waiting-content">
          {challengeTitle && <h2>{challengeTitle}</h2>}
          <button className="start-classic-challenge-button"  data-umami-event="multiplayer start-classic button" onClick={handleClassicChallengeStart}>{t("start_classic_button")}</button>
          <div className='start-classic-challenge-warning'>{t("classic_challenge_start_warning")}</div>
          {renderChat()}
        </div>
      );
    }

    if (isConnected && !isGameRunning) {
      if(countdownRemaining !== null && countdownRemaining >= 0){
        const circumference = 2 * Math.PI * 44;
        const strokeDashoffset = circumference * (1 - (countdownRemaining / countdownTotal.current));
        return (
          <div className="waiting-content">
              <div className="countdown-display">
                <p className="countdown-label">{t("game_starting_in") || "Game starting in..."}</p>
                <div className="countdown-ring-container">
                  <svg className="countdown-ring-svg" viewBox="0 0 100 100">
                    <circle className="countdown-ring-bg" cx="50" cy="50" r="44" />
                    <circle
                      className="countdown-ring-progress"
                      cx="50" cy="50" r="44"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                    />
                  </svg>
                  <span className="countdown-number">{countdownRemaining}</span>
                </div>
                {!isClassicChallenge && lobbyUsers.length > 0 && (
                  <div className="countdown-players-box">
                    <p className="countdown-players-title">{t("players_in_lobby")}: {lobbyUsers.length}</p>
                    <ul className="countdown-players-list">
                      {lobbyUsers.map((user, index) => (
                        <li key={`waiting-user-${index}`}>{user}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}
            {renderChat()}
          </div>
        );
      } else if (!isClassicChallenge) {
        return (
          <div className="waiting-content">
            <div className="waiting-content-left">
              <h3>{t("waiting_game_start") || "Waiting for game to start..."}</h3>
              <div className="waiting-display">
                <div className="countdown-players-box">
                  <p className="countdown-players-title">{t("players_in_lobby")}: {lobbyUsers.length}</p>
                  <ul className="countdown-players-list">
                      {lobbyUsers.map((user, index) => (
                        <li key={`waiting-user-${index}`} style={{ margin: '5px 0' }}>
                          {user}
                        </li>
                      ))}
                  </ul>
                </div>
                {parameters && <div className="countdown-players-box">
                  <p className="countdown-players-title">{t("parameters")}</p>
                  {parameters?.commands && <div>{t("parameters_manual_commands")}</div>}
                  {!parameters?.commands && parameters?.atlas && <div>{t("parameters_atlas")}: {parameters.atlas}</div>}
                  {<div>{t("number_regions")}: {parameters.regionsNumber}</div>}
                  {parameters?.commands && parameters?.totalDuration && <div>{t("parameters_total_duration")}: {Math.floor(parameters.totalDuration / 60)}m {parameters.totalDuration % 60}s</div>}
                  {!parameters?.commands &&<div>{t("duration_per_region")}: {parameters.durationPerRegion}</div>}
                  {!parameters?.commands && parameters?.blindMode && <div>{t("blind_mode")}</div>}
                  {false && parameters?.gameoverOnError && <div>{t("gameover_first_error_activated")}</div>}
                </div>}
              </div>
            </div>
            {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}
            {renderChat()}
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
      
      <BrainViewer alternateContent={renderWaitingContent({error})} sessionName={sessionNameRef.current} sessionDate={sessionDateRef.current} />
      
      {isGameRunning && (
        <div className="multiplayer-side-panel">
        {renderChat()}

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
            <>
              <h2>{t("classic_challenge_ended_title") || "Classic Challenge Completed"}</h2>
              <div className="overlay-score-block">
                <span className="overlay-score-value">
                  {playerScores[isLoggedIn ? userUsername : anonUsername] || 0}
                </span>
                <span className="overlay-score-label">{t("your_score") || "Your Score"}</span>
              </div>

              {(() => {
                const currentUser = isLoggedIn ? userUsername : anonUsername;
                const userScore = playerScores[currentUser] || 0;
                if (userPublishToLeaderboard === true) {
                  const existingRanking = classicChallengeRankings.find(r => r.username === currentUser);
                  let rankingsToUse = classicChallengeRankings;
                  let totalParticipants = classicChallengeTotalParticipants;
                  if (!existingRanking) {
                    rankingsToUse = [...classicChallengeRankings, { username: currentUser, score: userScore }];
                    rankingsToUse.sort((a, b) => b.score !== a.score ? b.score - a.score : a.username.localeCompare(b.username));
                    rankingsToUse = rankingsToUse.map((r, index) => ({ ...r, ranking: index + 1 }));
                    totalParticipants += 1;
                  }
                  const userRanking = rankingsToUse.find(r => r.username === currentUser);
                  return (
                    <div className="overlay-ranking">
                      <p><strong>#{userRanking?.ranking || '?'}</strong> / {totalParticipants} {t("total_participants") || "participants"}</p>
                    </div>
                  );
                } else {
                  return <PublishToLeaderboardBox forRank={true}/>;
                }
              })()}

              {classicChallengeId && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                  <a href={`/challenge-results/${classicChallengeId}`} className="overlay-challenge-link">
                    {t("view_challenge_results") || "View Challenge Results"}
                  </a>
                  <ChallengeEmailOptIn challengeId={classicChallengeId} />
                </div>
              )}
            </>
          ) : (
            <>
              <h2>{hasWon ? t("multiplayer_you_won") : t("multiplayer_you_lost")}</h2>
              <div className="overlay-score-block">
                <span className="overlay-score-value">
                  {playerScores[isLoggedIn ? userUsername : anonUsername] ?? 0}
                </span>
                <span className="overlay-score-label">{t("your_score") || "Your Score"}</span>
              </div>
              <ul className="overlay-players-list">
                {[...lobbyUsers]
                  .sort((a, b) => {
                    const sa = playerScores[a]; const sb = playerScores[b];
                    if (sa === undefined && sb === undefined) return 0;
                    if (sa === undefined) return 1; if (sb === undefined) return -1;
                    return sb - sa;
                  })
                  .map((u) => {
                    const isMe = u === userUsername || u === anonUsername;
                    return (
                      <li key={u} className={isMe ? `is-me ${hasWon ? 'won' : 'lost'}` : ''}>
                        <span>{u}</span>
                        <span>{playerScores[u] ?? '—'}</span>
                      </li>
                    );
                  })}
              </ul>
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
              {t("review_button") || "Review"}
            </button>
            <a id="go-back-menu-button-time-attack" className="home-button" href="/welcome/multiplayer">
              {t("home_button")}
            </a>
          </div>
        </div>
      </div>}
    </>
  )
}
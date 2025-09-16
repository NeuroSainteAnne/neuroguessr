import React, { useEffect, useRef, useState } from 'react';
import "./MultiplayerGameScreen.css"
import "../../components/BrainViewer.css"
import { useApp } from '../../context/AppContext';
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
      setHeaderText, setHeaderTextMode, setHeaderTime,
      showNotification, setAskedAtlas
   } = useApp();
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
  const [error, setError] = useState<string | null>(null);
  const [lobbyUsers, setLobbyUsers] = useState<string[]>([]);
  const [playerScores, setPlayerScores] = useState<Record<string,number>>({});
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

  const handleConnect = () => {
    setError(null);
    if (!inputCode.match(/^\d{8}$/)) {
      setError("Please enter a valid 8-digit code.");
      return;
    }
    if(!isLoggedIn && config.activateAnonymousMode){
      if(!anonUsername){
        setError(t("temp_username_or_connect"));
        return;
      }
    }
    joinLobby(inputCode)
  }
  const anonUsernameInputRef = useRef<HTMLInputElement>(null);
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [anonUsername, setAnonUsername] = useState<string>("");
  const anonUsernameRef = useRef(anonUsername);

  const cleanHeader = () => {
    setHeaderText("");  
    setHeaderTextMode("")
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

  const joinLobby = (inputCode: string) => {
    if (isConnected) return;
    if (!isLoggedIn && !config.activateAnonymousMode) return;
    
    consoleLog("verbose", `Attempting to join multiplayer lobby: ${inputCode} as ${isLoggedIn ? 'logged-in user' : 'anonymous'}`);

    setError(null);

    // Get or create socket connection (this will reuse existing connection if available)
    const socket = createSocket((newSocket: Socket) => {
      consoleLog('verbose', 'Socket connected in multiplayer lobby');
      consoleLog('verbose', `Joining lobby ${inputCode} as ${isLoggedIn ? userUsername : anonUsername}`);
    
      // Join the lobby
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
      cleanupSocket();
    });
    socket.on('error', (data: any) => {
      setError(data.message);
    });
    socket.on('fatal-error', (data: any) => {
      setError(data.message);
      cleanupSocket();
    });
    socket.on('anon-token', (data: any) => {
      anonTokenRef.current = data.anonToken;
    });
    socket.on('lobby-users', (data: any) => {
      setLobbyUsers(data.users);
      setIsConnected(true);
      if(!isLoggedIn){
        setIsAnonymous(true)
      }
      if (guessButtonRef.current) guessButtonRef.current.disabled = true;
      tryLaunchGame()
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
        if (currentTarget.current !== null && !hasAnswered.current) {
          const curTar = currentTarget.current;    
          if(curTar !== undefined) {
            setPastRegions(prev => [...prev, {
              regionId: curTar,
              regionName: atlasRef.current?.labels?.[curTar] || t('unknown_region'),
              atlas: atlasRef.current?.atlas || "",
              isCorrect: false,
              score: 0,
              distance: -1, // Special value to indicate no guess was made
            }]);
          }
        }
        hasAnswered.current = false;
        isGuessCooldownRef.current = true;
        currentTarget.current = data.command.regionId
        setHeaderTextMode("")
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
    });
    socket.on('game-end', (data: any) => {
      if (!isFirstGuess.current && currentTarget.current !== null && !hasAnswered.current) {
        const curTar = currentTarget.current;
        if(curTar !== undefined) {
          setPastRegions(prev => [...prev, {
            regionId: curTar,
            regionName: atlasRef.current?.labels?.[curTar] || t('unknown_region'),
            atlas: atlasRef.current?.atlas || "",
            isCorrect: false,
            score: 0,
            distance: -1, // Special value to indicate no guess was made
          }]);
        }
      }
      setHasEnded(true)
      hasEndedRef.current = true
      clearInterface()
      setHasWon(data.youWon)
      setShowMultiplayerOverlay(true)
    });
    socket.on('guess-result', (data: any) => {
        if(currentTarget.current){
          const curTar = currentTarget.current;
          setPastRegions(prev => [...prev, {
            regionId: curTar,
            regionName: atlasRef.current?.labels?.[curTar] || t('unknown_region'),
            atlas: atlasRef.current?.atlas || "",
            isCorrect: data.isCorrect,
            score: data.scoreIncrement,
            distance: data.isCorrect ? 0 : data.distance,
            clickedPosition: selectedVoxelProp.current ? {
              mm: [...selectedVoxelProp.current.mm],
              vox: [...selectedVoxelProp.current.vox]
            } : undefined,
            regionCenter: data.nearestCenter 
              ? data.nearestCenter 
              : (atlasRef.current && atlasRef.current.centers && currentTarget.current !== undefined)
                ? atlasRef.current.centers?.[currentTarget.current]?.[0]
                : undefined,
            regionBoundary: data.nearestBoundary ? data.nearestBoundary : undefined
          }]);
        }
        if (data.isCorrect) {
          setHeaderTextMode("success");
        } else {
          setHeaderTextMode("failure");
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
    if (socket && socket.connected && isConnected && askedSessionCode && askedSessionToken && isLoggedIn) {
      socket.emit('launch-game', {
        sessionCode: askedSessionCode,
        sessionToken: askedSessionToken,
        userToken: authToken
      });
      socket.once('game-launched', (data: any) => {
        if (data.success) {
          consoleLog('verbose', 'Game launched successfully');
        } else {
          setError(data.message || t('error_launching_game'));
        }
      });
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
      setHeaderText(`${currentAttempts+1}/${parameters?.regionsNumber} - ${prefix}${atlasRef.current.labels[currentTarget.current]}`);
    } else {
      setHeaderText("");
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
      setHeaderTextMode("")
      setHeaderText("")
      setHeaderTime("")
  }

  useEffect(() => {
    if (isLoggedIn && askedSessionCode) {
      clearInterface()
      setLobbyUsers([])
      setPlayerScores({})
      setShowMultiplayerOverlay(false)
      setInputCode(askedSessionCode)
      joinLobby(askedSessionCode)
    } else if(askedSessionCode && config.activateAnonymousMode){
      setIsAnonymous(false)
      clearInterface()
      setLobbyUsers([])
      setPlayerScores({})
      setShowMultiplayerOverlay(false)
      setInputCode(askedSessionCode)
      if(anonUsernameInputRef.current) anonUsernameInputRef.current.focus();
    }
  }, [askedSessionCode, askedSessionToken, isLoggedIn])

  useEffect(()=>{
    tryLaunchGame()
  }, [askedSessionToken, isConnected])

  useEffect(() => {
    return () => {
      cleanupSocket();
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      setHeaderTextMode("")
      setHeaderText("")
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
      setHeaderTextMode("");
      if (guessButtonRef.current) guessButtonRef.current.disabled = true;

      hasAnswered.current = true;
      socket.emit('validate-guess', {
        sessionCode: inputCode,
        userName: isLoggedIn ? userUsername : anonUsername,
        voxelProp: selectedVoxelProp.current,
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
    if ((isLoggedIn && !askedSessionCode) || (!isLoggedIn && config.activateAnonymousMode && !isConnected && !askedSessionToken)) {
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

    if (isConnected && !isGameRunning) {
      return (
        <div className="waiting-content">
          {countdownRemaining !== null ? (
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
              <div>
                <h4>{t("players_in_lobby")}: {lobbyUsers.length}</h4>
                <ul>
                    {lobbyUsers.map((user, index) => (
                      <li key={`waiting-user-${index}`}>
                        {user}
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}
          {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}
        </div>
      );
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
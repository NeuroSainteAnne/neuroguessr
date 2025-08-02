import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import "./MultiplayerGameScreen.css"
import "../../components/BrainViewer.css"
import { useApp } from '../../context/AppContext';
import { ColorMap, MultiplayerParametersType, PastRegion } from '../../types';
import config from "../../../config.json"
import atlasFiles from '../../utils/atlas_files';
import { AtlasImageProxy, fetchJSON, initNiivue, loadAtlasNii } from '../../utils/helper_nii';
import { refreshToken } from '../../utils/helper_login';
import { Niivue, NVImage, DRAG_MODE } from '@niivue/niivue';
import { io, Socket } from 'socket.io-client';
import { PublishToLeaderboardBox } from '../../components/PublishToLeaderboardBox';
import RegionHistory from '../../components/RegionHistory';
import { BrainViewer, GameProvider, useGame } from '../../components/BrainViewer';

export function Page() {
    const { pageContext } = useApp();
    const { routeParams } = pageContext;
    const cleanGameCallbackRef = useRef<(() => void)>(() => { console.log("Not Initialized") });
    const startGameCallbackRef = useRef<(() => void)>(() => { console.log("Not Initialized") });
    const resetGameCallbackRef = useRef<(() => void)>(() => {});
    const validateGuessCallbackRef = useRef<(() => void)>(() => { console.log("Not Initialized") });
    const genericKeyPressCallbackRef = useRef<((e: KeyboardEvent) => void)>((e) => {});
    const canvasInteractionRef = useRef<((e: { mm: number[]; vox: number[]; idx: number | undefined; } | undefined) => void)>((e) => { });
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
    cleanGameCallbackRef, startGameCallbackRef, resetGameCallbackRef,
    validateGuessCallbackRef, genericKeyPressCallbackRef, canvasInteractionRef
}: {
    cleanGameCallbackRef: React.RefObject<() => void>,
    startGameCallbackRef: React.RefObject<() => void>,
    resetGameCallbackRef: React.RefObject<() => void>,
    validateGuessCallbackRef: React.RefObject<() => void>,
    genericKeyPressCallbackRef: React.RefObject<(e: KeyboardEvent) => void>,
    canvasInteractionRef: React.RefObject<(e: { mm: number[]; vox: number[]; idx: number | undefined; } | undefined) => void>,
}) => {
  const { 
      t, authToken, isLoggedIn, userUsername, viewerOptions, 
      preloadedBackgroundMNI, currentLanguage, pageContext,
      userPublishToLeaderboard,
      setHeaderText, setHeaderTextMode, setHeaderTime, updateToken,
      showNotification, askedAtlas, setAskedAtlas
   } = useApp();
  const { 
    guessButtonRef, currentTarget, setPastRegions,
    atlasRef, hasEnded, setHasEnded, hasEndedRef,
    selectedVoxelProp, isGameRunning, setIsGameRunning,
    isConnected, setIsConnected
   } = useGame()
  const { askedSessionCode, askedSessionToken } = pageContext.routeParams;
  const [inputCode, setInputCode] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [lobbyUsers, setLobbyUsers] = useState<string[]>([]);
  const [playerScores, setPlayerScores] = useState<Record<string,number>>({});
  const socketRef = useRef<Socket | null>(null);
  const anonTokenRef = useRef<string|null>(null)
  const [parameters, setParameters] = useState<MultiplayerParametersType|null>(null)
  const [stepCountdown, setStepCountdown] = useState<number | null>(null);
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

  const joinLobby = (inputCode: string) => {
    if (isConnected) return;
    if (!isLoggedIn && !config.activateAnonymousMode) return;

    setError(null);

    // Create socket connection
    const socket = io('/', {
      path: '/socket.io',
      transports: ['polling', 'websocket'], // Start with polling first, then try websocket
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      forceNew: true
    });
    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('Socket connected');
      
      // Join the lobby
      socket.emit('join-lobby', {
        sessionCode: inputCode,
        userName: isLoggedIn ? userUsername : anonUsername,
        isAnonymous: !isLoggedIn,
        token: isLoggedIn ? authToken : undefined,
        anonToken: anonTokenRef.current
      });
    });

    // Connection error
    socket.on('connect_error', (err) => {
      setError(`Connection error: ${err.message}`);
      cleanupSocket();
    });
    socket.on('error', (data) => {
      setError(data.message);
    });
    socket.on('fatal-error', (data) => {
      setError(data.message);
      cleanupSocket();
    });
    socket.on('anon-token', (data) => {
      anonTokenRef.current = data.anonToken;
    });
    socket.on('lobby-users', (data) => {
      setLobbyUsers(data.users);
      setIsConnected(true);
      if(!isLoggedIn){
        setIsAnonymous(true)
      }
      if (guessButtonRef.current) guessButtonRef.current.disabled = true;
      tryLaunchGame()
    });
    socket.on('player-joined', (data) => {
      setLobbyUsers(prev => [...prev, data.userName]);
    });
    socket.on('player-left', (data) => {
      setLobbyUsers(prev => prev.filter(user => user !== data.userName));
    });
    socket.on('parameters-updated', (data) => {
      setParameters(data.parameters);
    });
    socket.on('game-start', () => {
      setIsGameRunning(true);
      setCurrentAttempts(0)
      setHasWon(false)
      setForceDisplayUpdate((n)=>n+1)
      isFirstGuess.current = true;
      if (guessButtonRef.current) guessButtonRef.current.disabled = true;
    });
    socket.on('game-command', (data) => {
      if (data.command.action === 'load-atlas') {
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
        startStepCountdown(t("prepare-yourself"), data.command.duration);
      } else if (data.command.action === 'guess') {
        if (currentTarget.current !== null && !hasAnswered.current) {
          const curTar = currentTarget.current;    
          setPastRegions(prev => [...prev, {
            regionId: curTar,
            regionName: atlasRef.current?.labels?.[curTar] || t('unknown_region'),
            atlas: atlasRef.current?.atlas || "",
            isCorrect: false,
            score: 0,
            distance: -1, // Special value to indicate no guess was made
          }]);
        }
        hasAnswered.current = false;
        isGuessCooldownRef.current = true;
        currentTarget.current = data.command.regionId
        setHeaderTextMode("")
        if(atlasRef.current && atlasRef.current.labels && currentTarget.current) showNotification(atlasRef.current.labels[currentTarget.current], true)
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
    socket.on('score-update', (data) => {
      setPlayerScores(prev => ({
        ...prev,
        [data.user]: data.score
      }));
    });
    socket.on('all-scores-update', (data) => {
      setPlayerScores(data.scores);
    });
    socket.on('game-end', (data) => {
      if (!isFirstGuess.current && currentTarget.current !== null && !hasAnswered.current) {
        const curTar = currentTarget.current;
        setPastRegions(prev => [...prev, {
          regionId: curTar,
          regionName: atlasRef.current?.labels?.[curTar] || t('unknown_region'),
          atlas: atlasRef.current?.atlas || "",
          isCorrect: false,
          score: 0,
          distance: -1, // Special value to indicate no guess was made
        }]);
      }
      setHasEnded(true)
      hasEndedRef.current = true
      clearInterface()
      setHasWon(data.youWon)
      setShowMultiplayerOverlay(true)
    });
    socket.on('guess-result', (data) => {
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
            regionCenter: data.nearestCenter ? data.nearestCenter : (atlasRef.current && atlasRef.current.centers) ? atlasRef.current.centers?.[currentTarget.current!][0] : undefined
          }]);
        }
        if (data.isCorrect) {
          setHeaderTextMode("success");
        } else {
          setHeaderTextMode("failure");
        }
    })
    
    // Cleanup on unmount
    return () => {
      cleanupSocket();
    };
  };

  const cleanupSocket = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  const tryLaunchGame = async () => {
    if (socketRef.current && isConnected && askedSessionCode && askedSessionToken && isLoggedIn) {
      socketRef.current.emit('launch-game', {
        sessionCode: askedSessionCode,
        sessionToken: askedSessionToken,
        userToken: authToken
      });
      socketRef.current.once('game-launched', (data) => {
        if (data.success) {
          console.log('Game launched successfully');
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
    setStepCountdown(duration);
    countdownInterval.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setStepCountdown(remaining);
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
    if (isGameRunning && socketRef.current && currentTarget.current !== null && atlasRef.current && atlasRef.current.labels && atlasRef.current.labels[currentTarget.current]) {
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

  const checkToken = async () => {
    updateToken(await refreshToken())
  }

  useEffect(() => {
    return () => {
      cleanupSocket();
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      setHeaderTextMode("")
      setHeaderText("")
      setHeaderTime("")
    };
  }, [])


  useEffect(() => {
      const validateGuess = async () => {
        if (!selectedVoxelProp.current || !isGameRunning || !currentTarget.current || !socketRef.current || isGuessCooldownRef.current) {
          console.warn('Cannot validate guess:', { selectedVoxelProp, isGameRunning, currentTarget });
          return;
        }
        setHeaderTextMode("");
        if (guessButtonRef.current) guessButtonRef.current.disabled = true;

        hasAnswered.current = true;
        socketRef.current.emit('validate-guess', {
          sessionCode: inputCode,
          userName: isLoggedIn ? userUsername : anonUsername,
          voxelProp: selectedVoxelProp.current,
          ...(isAnonymous && anonTokenRef.current ? { anonToken: anonTokenRef.current } : {}),
          ...(isLoggedIn ? { userToken: authToken } : {})
        });
      }
      if (validateGuessCallbackRef) {
          validateGuessCallbackRef.current = validateGuess; // Set the callback in the ref
      }
  }, [validateGuessCallbackRef, isGameRunning, isAnonymous, userUsername, isLoggedIn, authToken]);


  const title = t("neuroguessr_multiplayer_title")
  return (
    <>
      <title>{title}</title>
      
      <BrainViewer />
      
      {(isLoggedIn || config.activateAnonymousMode) && !isConnected && !askedSessionToken  && <>
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
        </div>
        {!isLoggedIn && <div className="multiplayer-suggest-login" 
          dangerouslySetInnerHTML={{__html:t("multi_suggest_login")
          .replace("#",`?redirect=multiplayer-game${(askedSessionCode?`&redirect_asked_session_code=${askedSessionCode}`:"")}${(askedSessionToken?`&redirect_asked_session_token=${askedSessionToken}`:"")}#`)}}></div>}
      </>}
      {(isLoggedIn || isAnonymous) && isConnected && <div style={{ marginTop: 24 }}>
        <h4>{t("players_in_lobby")}</h4>
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
              <li key={u}>
                {u}{playerScores[u] !== undefined ? " " + playerScores[u] : ""}
              </li>
            ))
          }
        </ul>
        {parameters && !isGameRunning && "FOR v2" && <><h4>{t("parameters")}</h4>
          {parameters?.commands && <div>{t("parameters_manual_commands")}</div>}
          {!parameters?.commands && parameters?.atlas && <div>{t("parameters_atlas")}: {parameters.atlas}</div>}
          {<div>{t("number_regions")}: {parameters.regionsNumber}</div>}
          {parameters?.commands && parameters?.totalDuration && <div>{t("parameters_total_duration")}: {Math.floor(parameters.totalDuration / 60)}m {parameters.totalDuration % 60}s</div>}
          {!parameters?.commands &&<div>{t("duration_per_region")}: {parameters.durationPerRegion}</div>}
          {!parameters?.commands && parameters?.blindMode && <div>{t("blind_mode")}</div>}
          {false && parameters?.gameoverOnError && <div>{t("gameover_first_error_activated")}</div>}
        </>}
      </div>}
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
      {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}
    </>
  )
}
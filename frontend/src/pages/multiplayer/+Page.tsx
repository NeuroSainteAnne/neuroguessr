import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import "./MultiplayerGameScreen.css"
import "../singleplayer/GameScreen.css"
import { useApp } from '../../context/AppContext';
import { ColorMap, MultiplayerParametersType, PastRegion } from '../../types';
import config from "../../../config.json"
import atlasFiles from '../../utils/atlas_files';
import { AtlasImageProxy, fetchJSON, initNiivue, loadAtlasNii } from '../../utils/helper_nii';
import { refreshToken } from '../../utils/helper_login';
import { Niivue, NVImage } from '@niivue/niivue';
import { io, Socket } from 'socket.io-client';
import { PublishToLeaderboardBox } from '../../components/PublishToLeaderboardBox';
import RegionHistory from '../../components/RegionHistory';

const MultiplayerGameScreen = () => {
  const { 
      t, authToken, isLoggedIn, userUsername, viewerOptions, 
      preloadedBackgroundMNI, currentLanguage, pageContext,
      userPublishToLeaderboard,
      setHeaderText, setHeaderTextMode, setHeaderTime, updateToken,
      showNotification
   } = useApp();
  const { askedSessionCode, askedSessionToken } = pageContext.routeParams;
  const [inputCode, setInputCode] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lobbyUsers, setLobbyUsers] = useState<string[]>([]);
  const [playerScores, setPlayerScores] = useState<Record<string,number>>({});
  const socketRef = useRef<Socket | null>(null);
  const anonTokenRef = useRef<string|null>(null)
  const [parameters, setParameters] = useState<MultiplayerParametersType|null>(null)
  const [isLoadedNiivue, setIsLoadedNiivue] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guessButtonRef = useRef<HTMLButtonElement>(null);
  const [stepCountdown, setStepCountdown] = useState<number | null>(null);
  const countdownInterval = useRef<number | ReturnType<typeof setTimeout> | null>(null);
  const stepEndTime = useRef<number | null>(null);
  const [askedAtlas, setAskedAtlas] = useState<{atlas: string, lut: ColorMap | undefined, mapping : Record<number,number>, inverseMapping : Record<number,number>, blindMode:boolean}|undefined>(undefined);
  const [loadedAtlas, setLoadedAtlas] = useState<any|undefined>();
  const atlasRef = useRef<AtlasImageProxy|null>(null);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const selectedVoxelProp = useRef<{mm: number[], vox: number[], idx: number | undefined} | null>(null);
  const currentTarget = useRef<number | null>(null);
  const lastTouchEvent = useRef<React.Touch | null>(null);
  const [currentAttempts, setCurrentAttempts] = useState<number>(0);
  const [forceDisplayUpdate, setForceDisplayUpdate] = useState<number>(0);
  const isFirstGuess = useRef<boolean>(true);
  const hasAnswered = useRef<boolean>(false);
  const [showMultiplayerOverlay, setShowMultiplayerOverlay] = useState<boolean>(false)
  const multiplayerOverlayRef = useRef<HTMLDivElement>(null);
  const [hasWon, setHasWon] = useState<boolean>(false)
  const isGuessCooldownRef = useRef<boolean>(false);
  const [hasEnded, setHasEnded] = useState<boolean>(false);
  const [pastRegions, setPastRegions] = useState<PastRegion[]>([]);
  const [highlightedRegion, setHighlightedRegion] = useState<number | null>(null);

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

  const [niivue, setNiivue] = useState<Niivue|null>(null);
    useEffect(() => {
      setNiivue(new Niivue({
                logLevel: "error",
                show3Dcrosshair: true,
                backColor: [0, 0, 0, 1],
                crosshairColor: [1, 1, 1, 1],
                doubleTouchTimeout: 0 // Disable double touch to avoid conflicts
            }));
      return () => { 
        cleanHeader()
        atlasRef.current = null;
      };
    }, []);

  const cleanHeader = () => {
    setHeaderText("");  
    setHeaderTextMode("")
    setHeaderTime("")
  }

  const joinLobby = (inputCode: string) => {
    if (connected) return;
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
      setConnected(true);
      if(!isLoggedIn){
        setIsAnonymous(true)
      }
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
      setHasStarted(true);
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
        }
        startStepCountdown(t("prepare-yourself"), data.command.duration);
      } else if (data.command.action === 'guess') {
        if (currentTarget.current !== null && !hasAnswered.current) {
          const curTar = currentTarget.current;    
          setPastRegions(prev => [...prev, {
            regionId: curTar,
            regionName: atlasRef.current?.labels?.[curTar] || t('unknown_region'),
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
          isCorrect: false,
          score: 0,
          distance: -1, // Special value to indicate no guess was made
        }]);
      }
      setHasEnded(true)
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
            isCorrect: data.isCorrect,
            score: data.scoreIncrement,
            distance: data.isCorrect ? 0 : data.distance,
            clickedPosition: selectedVoxelProp.current ? {
              mm: [...selectedVoxelProp.current.mm],
              vox: [...selectedVoxelProp.current.vox]
            } : undefined,
            regionCenter: (atlasRef.current && atlasRef.current.centers) ? atlasRef.current.centers?.[currentTarget.current!][0] : undefined
            // TODO ADJUST FOR MULTIPLE CENTERS
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
    if (socketRef.current && connected && askedSessionCode && askedSessionToken && isLoggedIn) {
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
    if (hasStarted && socketRef.current && currentTarget.current !== null && atlasRef.current && atlasRef.current.labels && atlasRef.current.labels[currentTarget.current]) {
      const prefix = t('find') || 'Find: ';
      setHeaderText(`${currentAttempts+1}/${parameters?.regionsNumber} - ${prefix}${atlasRef.current.labels[currentTarget.current]}`);
    } else {
      setHeaderText("");
    }
  }
  useEffect(() => {
    updateGameDisplay();
  }, [parameters, currentAttempts, forceDisplayUpdate]);

  const handleSpaceBar = () => {
    if (guessButtonRef.current && !guessButtonRef.current.disabled && hasStarted && socketRef.current) {
      validateGuess();
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleSpaceBar();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      // Remove event listener
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [hasStarted])

  const loadAtlasData = async () => {
    try {
      if (!askedAtlas) return
      const selectedAtlasFiles = atlasFiles[askedAtlas.atlas];
      const jsonData : ColorMap = await fetchJSON("/atlas/descr" + "/" + currentLanguage + "/" + selectedAtlasFiles.json);
      if (niivue && niivue.volumes.length > 1 && jsonData) {
          let cmap_en: ColorMap|null = null;
          if (askedAtlas.atlas === 'xtract') {
            if(currentLanguage === 'en') {
              cmap_en = jsonData; // Already in English
            } else {
              cmap_en = await fetchJSON("/atlas/descr/en/" + selectedAtlasFiles.json);
            }
          }
          atlasRef.current = new AtlasImageProxy({niivue, nvImage:niivue.volumes[1], 
            labels: jsonData.labels, 
            centers: jsonData.centers ? jsonData.centers : undefined,
            proposedLut: askedAtlas.lut, proposedMapping: askedAtlas.mapping, proposedInverseMapping: askedAtlas.inverseMapping,
            viewerOptions, blindMode: askedAtlas.blindMode, cmap_en});
        atlasRef.current.showShuffledRegions();
      }
    } catch (error) {
      console.error(`Failed to load atlas data for ${askedAtlas}:`, error);
      setHeaderText(t('error_loading_data', { atlas: askedAtlas }));
    }
  }

  function clearInterface () {
      setConnected(false);
      setHasStarted(false)
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
  }, [askedSessionToken, connected])

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

  useEffect(()=>{
    if(niivue && canvasRef.current && hasStarted){
      initNiivue(niivue, canvasRef.current, viewerOptions, ()=>{
          setIsLoadedNiivue(true);
          niivue.opts.doubleTouchTimeout = 500; // Reactivate double touch timeout after loading
      })
      loadAtlasNii(niivue, preloadedBackgroundMNI);
    }
  }, [niivue, canvasRef.current, hasStarted])

  useEffect(() => {
    if (askedAtlas) {
        const atlas = atlasFiles[askedAtlas.atlas];
        if(atlasRef.current) {
          atlasRef.current.setBlindMode(askedAtlas.blindMode);
        }
        if (atlas) {
          const niiFile = "/atlas/nii/" + atlas.nii;
          NVImage.loadFromUrl({url: niiFile}).then((nvImage: any) => {
              setLoadedAtlas(nvImage);
          }).catch((error: any) => {
              console.error("Error loading NIfTI file:", error);
              setLoadedAtlas(undefined)
          });
        }
    }
  }, [askedAtlas, NVImage])

  useEffect(() => {
    if(niivue && preloadedBackgroundMNI && canvasRef.current && hasStarted){
      loadAtlasNii(niivue, preloadedBackgroundMNI, loadedAtlas);
      loadAtlasData();
    }
  }, [preloadedBackgroundMNI, isLoadedNiivue, niivue, hasStarted, canvasRef.current, loadedAtlas, askedAtlas])

  useLayoutEffect(() => {
    if (niivue && canvasRef.current && hasStarted) {
      // Niivue expects the canvas to be sized by CSS, but sometimes needs a manual resize event
      niivue.resizeListener();
    }
  }, [niivue, hasStarted, connected]);

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // Save the last touch event for later use in touchEnd
    if (e.touches.length > 0) {
      lastTouchEvent.current = e.touches[0];
    }
    handleCanvasInteraction(e);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // Save the last touch event for later use in touchEnd
    if (e.touches.length > 0) {
      lastTouchEvent.current = e.touches[0];
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // If we have a saved touch event, create a synthetic mouse event
    // and pass it to the handleCanvasInteraction function
    if (lastTouchEvent.current && canvasRef.current) {
      // Create a synthetic event using the last saved touch position
      const syntheticEvent = {
        ...e,
        touches: [lastTouchEvent.current] as unknown as React.TouchList
      } as React.TouchEvent<HTMLCanvasElement>;
      // Call the mouse event handler with our synthetic event
      handleCanvasInteraction(syntheticEvent);
      // Clear the saved touch event
      lastTouchEvent.current = null;
    }
  };

  const handleCanvasInteraction = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!niivue || !niivue.gl || !niivue.volumes[1] || !atlasRef.current || !hasStarted || !canvasRef.current) return;
    const clickedRegionLocation = atlasRef.current.getClickedRegion(canvasRef.current, e)
    if(clickedRegionLocation){
      selectedVoxelProp.current = clickedRegionLocation;
    }
  }

  const validateGuess = async () => {
    if (!selectedVoxelProp.current || !hasStarted || !currentTarget.current || !socketRef.current || isGuessCooldownRef.current) {
      console.warn('Cannot validate guess:', { selectedVoxelProp, hasStarted, currentTarget });
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

  const highlightWrapper = (regionId: number, moveToCenter: boolean) => {
    if(atlasRef.current) atlasRef.current.highlightRegion(regionId, moveToCenter);
  }

  useEffect(() => {
    if (highlightedRegion) {
      highlightWrapper(highlightedRegion, true);
    }
  }, [highlightedRegion]);

  const title = t("neuroguessr_multiplayer_title")
  return (
    <>
      <title>{title}</title>
      
      <div className='canvas-and-info-container'>
        {hasEnded && <RegionHistory pastRegions={pastRegions} highlightPastRegion={highlightWrapper} niivue={niivue} />}
        <div className="canvas-container" style={{display:(((hasStarted && connected) || hasEnded)?"block":"none")}}>
          <canvas id="gl1" onClick={handleCanvasInteraction} 
            onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchMove={handleTouchMove} ref={canvasRef}></canvas>
        </div>
      </div>
      <div style={{display:((hasStarted && connected)?"block":"none")}}>
        <div className="button-container">
          <button className="guess-button" ref={guessButtonRef} onClick={validateGuess} data-umami-event="multiplayer guess button">
            <span className="confirm-text">{t("confirm_guess")}</span>
            <span className="space-text">{t("space_key")}</span>
          </button>
        </div>
      </div>
      {(isLoggedIn || config.activateAnonymousMode) && !connected && !askedSessionToken  && <>
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
      {(isLoggedIn || isAnonymous) && connected && <div style={{ marginTop: 24 }}>
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
        {parameters && !hasStarted && "FOR v2" && <><h4>{t("parameters")}</h4>
          {parameters?.atlas && <div>{t("parameters_atlas")}: {parameters.atlas}</div>}
          <div>{t("number_regions")}: {parameters.regionsNumber}</div>
          <div>{t("duration_per_region")}: {parameters.durationPerRegion}</div>
          {parameters?.blindMode && <div>{t("blind_mode")}</div>}
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

export default MultiplayerGameScreen
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import "./MultiplayerGameScreen.css"
import "../singleplayer/GameScreen.css"
import { useApp } from '../../context/AppContext';
import { ColorMap, MultiplayerParametersType } from '../../types';
import config from "../../../config.json"
import atlasFiles from '../../utils/atlas_files';
import { fetchJSON, getClickedRegion, initNiivue, loadAtlasNii } from '../../utils/helper_nii';
import { refreshToken } from '../../utils/helper_login';
import { Niivue, NVImage } from '@niivue/niivue';

const MultiplayerGameScreen = () => {
  const { 
      t, authToken, isLoggedIn, userUsername, viewerOptions, 
      preloadedBackgroundMNI, currentLanguage, pageContext,
      setHeaderText, setHeaderTextMode, setHeaderTime, updateToken
   } = useApp();
  const { askedSessionCode, askedSessionToken } = pageContext.routeParams;
  const [inputCode, setInputCode] = useState<string>("");
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lobbyUsers, setLobbyUsers] = useState<string[]>([]);
  const [playerScores, setPlayerScores] = useState<Record<string,number>>({});
  const evtSourceRef = useRef<EventSource | null>(null);
  const anonTokenRef = useRef<string|null>(null)
  const [parameters, setParameters] = useState<MultiplayerParametersType|null>(null)
  const [isLoadedNiivue, setIsLoadedNiivue] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guessButtonRef = useRef<HTMLButtonElement>(null);
  const [stepCountdown, setStepCountdown] = useState<number | null>(null);
  const countdownInterval = useRef<number | ReturnType<typeof setTimeout> | null>(null);
  const stepEndTime = useRef<number | null>(null);
  const [askedAtlas, setAskedAtlas] = useState<string>("");
  const [loadedAtlas, setLoadedAtlas] = useState<any|undefined>();
  const [askedLut, setAskedLut] = useState<ColorMap|undefined>();
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const selectedVoxelProp = useRef<{mm: number[], vox: number[], idx: number} | null>(null);
  const currentTarget = useRef<number | null>(null);
  const lastTouchEvent = useRef<React.Touch | null>(null);
  const [currentAttempts, setCurrentAttempts] = useState<number>(0);
  const cMap = useRef<ColorMap | null>(null);
  const [forceDisplayUpdate, setForceDisplayUpdate] = useState<number>(0);
  const isFirstGuess = useRef<boolean>(true);
  const [showMultiplayerOverlay, setShowMultiplayerOverlay] = useState<boolean>(false)
  const multiplayerOverlayRef = useRef<HTMLDivElement>(null);
  const [hasWon, setHasWon] = useState<boolean>(false)

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
      };
    }, []);

  const cleanHeader = () => {
    setHeaderText("");  
    setHeaderTextMode("")
    setHeaderTime("")
  }

  const joinLobby = (inputCode: string) => {
    if (evtSourceRef.current) return;
    if (!isLoggedIn && !config.activateAnonymousMode) return;

    let url = `/sse/${inputCode}/${isLoggedIn ? userUsername : anonUsername}`;
    if (isLoggedIn && authToken) url += `?token=${authToken}`;
    if (!isLoggedIn && anonUsername) url += `?anonymous=true`;

    const evtSource = new EventSource(url);
    evtSourceRef.current = evtSource;

    evtSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'error') {
        setError(data.message);
      } else if (data.type === 'fatal-error') {
        setError(data.message);
        if(evtSourceRef.current) evtSourceRef.current.close();
        evtSourceRef.current = null;
      } else if (data.type === 'lobby-users' && Array.isArray(data.users)) {
        setConnected(true)
        setLobbyUsers(data.users);
        if(!isLoggedIn){
          setIsAnonymous(true)
        }
        tryLaunchGame()
      } else if (data.type === 'player-joined' && data.userName) {
        setLobbyUsers(prev => Array.from(new Set([...prev, data.userName])));
      } else if (data.type === 'anon-token' && data.anonToken) {
        anonTokenRef.current = data.anonToken;
      } else if (data.type === 'player-left' && data.userName) {
        setLobbyUsers(prev => prev.filter(u => u !== data.userName));
      } else if (data.type === 'parameters-updated' && data.parameters) {
        setParameters(data.parameters as MultiplayerParametersType);
      } else if (data.type === 'game-start') {
        setHasStarted(true)
        setCurrentAttempts(0)
        setHasWon(false)
        isFirstGuess.current = true;
        if (guessButtonRef.current) guessButtonRef.current.disabled = true;
      } else if (data.type === 'game-command' && data.command) {
        if (data.command.action === 'load-atlas') {
          // Load the specified atlas in the viewer
          if (data.command.atlas) {
            setAskedAtlas(data.command.atlas)
            setAskedLut(data.command.lut)
          }
          startStepCountdown(t("prepare-yourself"), data.command.duration);
        } else if (data.command.action === 'guess') {
          currentTarget.current = data.command.regionId
          setHeaderTextMode("")
          startStepCountdown(t("remaining-time"), data.command.duration);
          if (guessButtonRef.current) {
            guessButtonRef.current.disabled = false;
          }
          if(!isFirstGuess.current) setCurrentAttempts((n)=>n+1)
          isFirstGuess.current = false;
          setForceDisplayUpdate((n)=>n+1)
        }
      } else if (data.type === 'all-scores-update') {
        setPlayerScores(data.scores)
      } else if (data.type === 'score-update') {
        setPlayerScores(prev => ({
            ...prev,
            [data.user]: data.score
        }));
      } else if (data.type === 'game-end') {
        clearInterface()
        setHasWon(data.youWon)
        setShowMultiplayerOverlay(true)
      }
    };
    evtSource.onerror = (event) => {
      setError(t('sse-error'));
      console.error("SSE connection error:", event);
      if(evtSourceRef.current) evtSourceRef.current.close();
      evtSourceRef.current = null;
    };
  };


  const tryLaunchGame = async () => {
    console.log(evtSourceRef.current, askedSessionCode, askedSessionToken, isLoggedIn)
    if (evtSourceRef.current && connected && askedSessionCode && askedSessionToken && isLoggedIn) {
      try {
        const response = await fetch('/api/multi/launch-game', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ sessionCode: askedSessionCode, sessionToken: askedSessionToken })
        });
        const data = await response.json();
        if (!response.ok) {
          setError(data?.message || t('error_launching_game'));
        }
      } catch (err) {
        setError(t('error_launching_game'));
        console.error("Error launching game:", err);
      }
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
    if (hasStarted && evtSourceRef.current && currentTarget.current !== null && cMap.current && cMap.current.labels && cMap.current.labels[currentTarget.current]) {
      const prefix = t('find') || 'Find: ';
      setHeaderText(`${currentAttempts+1}/${parameters?.regionsNumber} - ${prefix}${cMap.current.labels[currentTarget.current]}`);
    } else {
      setHeaderText("");
    }
  }
  useEffect(() => {
    updateGameDisplay();
  }, [parameters, currentAttempts, forceDisplayUpdate]);

  const handleSpaceBar = () => {
    if (guessButtonRef.current && !guessButtonRef.current.disabled && hasStarted && evtSourceRef.current) {
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
      if (!askedAtlas || !askedLut) return
      const selectedAtlasFiles = atlasFiles[askedAtlas];
      cMap.current = await fetchJSON("/atlas/descr" + "/" + currentLanguage + "/" + selectedAtlasFiles.json);
      if (niivue && niivue.volumes.length > 1 && cMap.current) {
        niivue.volumes[1].setColormapLabel(cMap.current)
        niivue.volumes[1].setColormapLabel(askedLut);
        niivue.setOpacity(1, viewerOptions.displayOpacity);
        niivue.updateGLVolume();
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
      if (evtSourceRef.current) {
        evtSourceRef.current.close();
        evtSourceRef.current = null;
      }
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
      if (evtSourceRef.current) {
        evtSourceRef.current.close();
        evtSourceRef.current = null;
      }
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
      const atlas = atlasFiles[askedAtlas];
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
  }, [preloadedBackgroundMNI, isLoadedNiivue, niivue, hasStarted, canvasRef.current, loadedAtlas, askedAtlas, askedLut])

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
    if (!niivue || !niivue.gl || !niivue.volumes[1] || !cMap.current || !hasStarted || !canvasRef.current) return;
    const clickedRegionLocation = getClickedRegion(niivue, canvasRef.current, cMap.current, e)
    if(clickedRegionLocation){
      selectedVoxelProp.current = clickedRegionLocation;
    }
  }

  const validateGuess = async () => {
    if (!selectedVoxelProp.current || !hasStarted || !currentTarget.current) {
      console.warn('Cannot validate guess:', { selectedVoxelProp, hasStarted, currentTarget });
      return;
    }
    setHeaderTextMode("");
    if (guessButtonRef.current) guessButtonRef.current.disabled = true;

    try {
      const response = await fetch('/api/multi/validate-guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionCode: askedSessionCode,
          userName: isLoggedIn ? userUsername : anonUsername,
          voxelProp: selectedVoxelProp.current,
          ...(isAnonymous && anonTokenRef.current ? { anonToken : anonTokenRef.current } : {}),
          ...(isLoggedIn ? { userToken : authToken } : {})
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.message || t('error_validating_guess'));
        if (guessButtonRef.current) guessButtonRef.current.disabled = false;
        return;
      }
      if (data.type === 'guess-result') {
        if (data.isCorrect) {
          setHeaderTextMode("success");
        } else {
          setHeaderTextMode("failure");
        }
      }
    } catch (err) {
      setError(t('error_validating_guess'));
      if (guessButtonRef.current) guessButtonRef.current.disabled = false;
      console.error("Error validating guess:", err);
    }
  };

  const title = t("neuroguessr_multiplayer_title")
  return (
    <>
      <title>{title}</title>
      
      <div className="canvas-container" style={{display:((hasStarted && connected)?"block":"none")}}>
        <canvas id="gl1" onClick={handleCanvasInteraction} 
          onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchMove={handleTouchMove} ref={canvasRef}></canvas>
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
                <li key={u} style={(u === userUsername || u === anonUsername) ? { color: 'green', fontWeight: 'bold' } : {}}>
                  {u}{playerScores[u] !== undefined ? " " + playerScores[u] : ""}
                </li>
              ))
            }
          </ul>
          <h2>{hasWon?t("multiplayer_you_won"):t("multiplayer_you_lost")}</h2>
          <div className="overlay-buttons">
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
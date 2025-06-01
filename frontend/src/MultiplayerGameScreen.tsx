import type { TFunction } from 'i18next';
import React, { useEffect, useRef, useState } from 'react';
import { isTokenValid, refreshToken } from './helper_login';
import { Niivue, NVImage } from '@niivue/niivue';
import { getClickedRegion, initNiivue, loadAtlasNii } from './NiiHelpers';
import atlasFiles from './atlas_files';
import { fetchJSON } from './helper_niivue';

const MultiplayerGameScreen = ({ t, callback, authToken, userUsername, askedSessionCode, askedSessionToken, loadEnforcer, viewerOptions, preloadedBackgroundMNI, currentLanguage }:
  {
    t: TFunction<"translation", undefined>, callback: AppCallback, authToken: string, userUsername: string,
    askedSessionCode: string | null, askedSessionToken: string | null, loadEnforcer: number,
    viewerOptions: DisplayOptions, preloadedBackgroundMNI: NVImage | null, currentLanguage: string
  }) => {
  const [inputCode, setInputCode] = useState<string>("");
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lobbyUsers, setLobbyUsers] = useState<string[]>([]);
  const [playerScores, setPlayerScores] = useState<Record<string,number>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const [parameters, setParameters] = useState<MultiplayerParametersType|null>(null)
  const [isLoadedNiivue, setIsLoadedNiivue] = useState<boolean>(false);
  const niivue = useRef(new Niivue({
    show3Dcrosshair: true,
    backColor: [0, 0, 0, 1],
    crosshairColor: [1, 1, 1, 1]
  }));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guessButtonRef = useRef<HTMLButtonElement>(null);
  const [stepCountdown, setStepCountdown] = useState<number | null>(null);
  const countdownInterval = useRef<number | null>(null);
  const stepEndTime = useRef<number | null>(null);
  const [askedAtlas, setAskedAtlas] = useState<string>("");
  const [loadedAtlas, setLoadedAtlas] = useState<NVImage|undefined>();
  const [askedLut, setAskedLut] = useState<ColorMap|undefined>();
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const selectedVoxel = useRef<number[] | null>(null);
  const currentTarget = useRef<number | null>(null);
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
    connectWS(inputCode)
  }

  const connectWS = (inputCode: string) => {
    const ws = new WebSocket(`ws://${window.location.hostname}:3001`);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', sessionCode: inputCode, token: authToken }));
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'error') {
        setError(data.message);
      } else if (data.type === 'lobby-users' && Array.isArray(data.users)) {
        setConnected(true)
        setLobbyUsers(data.users);
        tryLaunchGame()
      } else if (data.type === 'player-joined' && data.userName) {
        setLobbyUsers(prev => Array.from(new Set([...prev, data.userName])));
      } else if (data.type === 'player-left' && data.userName) {
        setLobbyUsers(prev => prev.filter(u => u !== data.userName));
      } else if (data.type === 'parameters-updated' && data.parameters) {
        setParameters(data.parameters as MultiplayerParametersType);
        console.log("parameters", data.parameters)
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
          callback.setHeaderTextMode("")
          startStepCountdown(t("remaining-time"), data.command.duration);
          if (guessButtonRef.current) {
            guessButtonRef.current.disabled = false;
          }
          if(!isFirstGuess.current) setCurrentAttempts((n)=>n+1)
          isFirstGuess.current = false;
          setForceDisplayUpdate((n)=>n+1)
        }
      } else if (data.type === 'guess-result') {
        if(data.isCorrect){
          callback.setHeaderTextMode("success")
        } else {
          callback.setHeaderTextMode("failure")
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
    ws.onerror = () => {
      setError(t('websocket-error'));
    };
    ws.onclose = () => {
      clearInterface()
    };
  };

  const tryLaunchGame = () => {
    if(wsRef.current && wsRef.current.readyState && askedSessionCode && askedSessionToken){
      wsRef.current.send(JSON.stringify({ type: 'launch-game', sessionCode: askedSessionCode, sessionToken: askedSessionToken }))
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
      callback.setHeaderTime(`${instruction} ${minutes}:${seconds}`);
      if (remaining <= 0 && countdownInterval.current) {
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
      }
    }, 250);
  };

  const updateGameDisplay = () => {
    if (hasStarted && connected && currentTarget.current !== null && cMap.current && cMap.current.labels && cMap.current.labels[currentTarget.current]) {
      const prefix = t('find') || 'Find: ';
      callback.setHeaderText(`${currentAttempts+1}/${parameters?.regionsNumber} - ${prefix}${cMap.current.labels[currentTarget.current]}`);
    } else {
      callback.setHeaderText("");
    }
  }
  useEffect(() => {
    updateGameDisplay();
  }, [parameters, currentAttempts, forceDisplayUpdate]);


  const loadAtlasData = async () => {
    try {
      if (!askedAtlas || !askedLut) return
      const selectedAtlasFiles = atlasFiles[askedAtlas];
      cMap.current = await fetchJSON("assets/atlas/descr" + "/" + currentLanguage + "/" + selectedAtlasFiles.json);
      if (niivue.current && niivue.current.volumes.length > 1 && cMap.current) {
        niivue.current.volumes[1].setColormapLabel(cMap.current)
        niivue.current.volumes[1].setColormapLabel(askedLut);
        niivue.current.setOpacity(1, viewerOptions.displayOpacity);
        niivue.current.updateGLVolume();
      }
    } catch (error) {
      console.error(`Failed to load atlas data for ${askedAtlas}:`, error);
      callback.setHeaderText(t('error_loading_data', { atlas: askedAtlas }));
    }
  }

  function clearInterface () {
      setConnected(false);
      setHasStarted(false)
      if(countdownInterval.current) clearInterval(countdownInterval.current);
      countdownInterval.current = null;
      callback.setHeaderTextMode("")
      callback.setHeaderText("")
      callback.setHeaderTime("")
  }

  useEffect(() => {
    if (askedSessionCode) {
      clearInterface()
      setLobbyUsers([])
      setPlayerScores({})
      setShowMultiplayerOverlay(false)
      if(wsRef.current) wsRef.current.close()
      wsRef.current = null
      setInputCode(askedSessionCode)
      connectWS(askedSessionCode)
    }
  }, [askedSessionCode, askedSessionToken])

  useEffect(()=>{
    tryLaunchGame()
  }, [askedSessionToken])

  useEffect(() => {
    initNiivue(niivue.current, viewerOptions, ()=>{
        setIsLoadedNiivue(true);
    })
    loadAtlasNii(niivue.current, preloadedBackgroundMNI);
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      callback.setHeaderTextMode("")
      callback.setHeaderText("")
      callback.setHeaderTime("")
    };
  }, [])

  useEffect(() => {
  if (askedAtlas) {
      const atlas = atlasFiles[askedAtlas];
      if (atlas) {
        const niiFile = "assets/atlas/nii/" + atlas.nii;
        NVImage.loadFromUrl({url: niiFile}).then((nvImage) => {
            setLoadedAtlas(nvImage);
        }).catch((error) => {
            console.error("Error loading NIfTI file:", error);
            setLoadedAtlas(undefined)
        });
      }
  }
}, [askedAtlas])

  useEffect(() => {
    loadAtlasNii(niivue.current, preloadedBackgroundMNI, loadedAtlas);
    loadAtlasData();
  }, [preloadedBackgroundMNI, isLoadedNiivue, loadEnforcer, loadedAtlas, askedAtlas, askedLut])


  const handleCanvasInteraction = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!niivue.current || !niivue.current.gl || !niivue.current.volumes[1] || !cMap.current || !hasStarted || !canvasRef.current) return;
    const clickedRegionLocation = getClickedRegion(niivue.current, canvasRef.current, cMap.current, e)
    if(clickedRegionLocation){
      selectedVoxel.current = clickedRegionLocation.vox;
    }
  }

  const validateGuess = () => {
    if (!selectedVoxel.current || !hasStarted || !currentTarget.current || !wsRef.current) {
      console.warn('Cannot validate guess:', { selectedVoxel, hasStarted, currentTarget });
      return;
    }
    callback.setHeaderTextMode("")
    if(guessButtonRef.current) guessButtonRef.current.disabled = true
    wsRef.current.send(JSON.stringify({
      type: 'validate-guess',
      voxel: selectedVoxel.current
    }));
  }

  return (
    <div className="page-container">
      <div style={{display:((hasStarted && connected)?"block":"none")}}>
        <canvas id="gl1" 
          onClick={handleCanvasInteraction} onTouchStart={handleCanvasInteraction} ref={canvasRef}></canvas>
        <div className="button-container">
          <button className="guess-button" ref={guessButtonRef} onClick={validateGuess}>
            <span className="confirm-text">{t("confirm_guess")}</span>
            <span className="space-text">{t("space_key")}</span>
          </button>
        </div>
      </div>
      {!connected && <>
        <h2>Join Multiplayer Lobby</h2>
        <input
          type="text"
          value={inputCode}
          onChange={e => setInputCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="Enter 8-digit code"
          style={{ fontSize: 24, letterSpacing: 4, textAlign: 'center', width: 180 }}
        />
        <button style={{ marginLeft: 16, fontSize: 18 }} onClick={handleConnect}>Join</button>
      </>}
      {connected && <div style={{ marginTop: 24 }}>
        <h4>Players in Lobby:</h4>
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
        {parameters && !hasStarted && <><h4>Parameters:</h4>
          {parameters?.atlas && <div>Atlas: {parameters.atlas}</div>}
          <div>Number of regions: {parameters.regionsNumber}</div>
          <div>Time per region: {parameters.durationPerRegion}</div>
          {parameters.gameoverOnError && <div>Game over on error mode activated</div>}
        </>}
        {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}
      </div>}

      
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
                <li key={u} style={u === userUsername ? { color: 'green', fontWeight: 'bold' } : {}}>
                  {u}{playerScores[u] !== undefined ? " " + playerScores[u] : ""}
                </li>
              ))
            }
          </ul>
          <h2>{hasWon?t("multiplayer-you-won"):t("multiplayer-you-lost")}</h2>
          <div className="overlay-buttons">
            <button id="go-back-menu-button-time-attack" className="home-button" onClick={() => callback.gotoPage("welcome")}>
              <i className="fas fa-home"></i>
            </button>
          </div>
        </div>
      </div>}
    </div>
  )
}

export default MultiplayerGameScreen
import type { TFunction } from 'i18next';
import React, { useEffect, useRef, useState } from 'react';
import { isTokenValid, refreshToken } from './helper_login';
import { Niivue, NVImage } from '@niivue/niivue';
import { initNiivue, loadAtlasNii } from './NiiHelpers';
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
  const wsRef = useRef<WebSocket | null>(null);
  const [parameters, setParameters] = useState<MultiplayerParametersType|null>(null)
  const [isLoadedNiivue, setIsLoadedNiivue] = useState<boolean>(false);
  const niivue = useRef(new Niivue({
    show3Dcrosshair: true,
    backColor: [0, 0, 0, 1],
    crosshairColor: [1, 1, 1, 1]
  }));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stepCountdown, setStepCountdown] = useState<number | null>(null);
  const countdownInterval = useRef<number | null>(null);
  const stepEndTime = useRef<number | null>(null);
  const [askedAtlas, setAskedAtlas] = useState<string>("");
  const [loadedAtlas, setLoadedAtlas] = useState<NVImage|undefined>();
  const [askedLut, setAskedLut] = useState<ColorMap|undefined>();

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
        ws.close();
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
      } else if (data.type === 'game-command' && data.command) {
        console.log(data.command)
        if (data.command.action === 'load-atlas') {
          // Load the specified atlas in the viewer
          if (data.command.atlas) {
            setAskedAtlas(data.command.atlas)
            setAskedLut(data.command.lut)
          }
        }
        startStepCountdown(data.command.duration);
      }
    };
    ws.onerror = () => {
      setError('WebSocket connection error');
    };
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null
    };
  };

  const tryLaunchGame = () => {
    if(wsRef.current && wsRef.current.readyState && askedSessionCode && askedSessionToken){
      wsRef.current.send(JSON.stringify({ type: 'launch-game', sessionCode: askedSessionCode, sessionToken: askedSessionToken }))
    }
  }

  const startStepCountdown = (duration: number) => {
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    const end = Date.now() + duration * 1000;
    stepEndTime.current = end;
    setStepCountdown(duration);
    countdownInterval.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setStepCountdown(remaining);
      const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
      const seconds = (remaining % 60).toString().padStart(2, '0');
      callback.setHeaderTime(`${minutes}:${seconds}`);
      if (remaining <= 0 && countdownInterval.current) {
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
      }
    }, 250);
  };

  const loadAtlasData = async () => {
    try {
      if (!askedAtlas || !askedLut) return
      const selectedAtlasFiles = atlasFiles[askedAtlas];
      const cmap = await fetchJSON("assets/atlas/descr" + "/" + currentLanguage + "/" + selectedAtlasFiles.json);
      if (niivue.current && niivue.current.volumes.length > 1 && cmap) {
        console.log(niivue.current.volumes[1])
        niivue.current.volumes[1].setColormapLabel(cmap)
        niivue.current.volumes[1].setColormapLabel(askedLut);
        niivue.current.setOpacity(1, viewerOptions.displayOpacity);
        niivue.current.updateGLVolume();

        const atlasData = niivue.current.volumes[1].getVolumeData();
        const dataRegions = [...new Set((atlasData as unknown as number[]).filter(val => val > 0).map(val => Math.round(val)))];
      }
    } catch (error) {
      console.error(`Failed to load atlas data for ${askedAtlas}:`, error);
      callback.setHeaderText(t('error_loading_data', { atlas: askedAtlas }));
    }
  }

  useEffect(() => {
    if (askedSessionCode) {
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
      if (countdownInterval.current) clearInterval(countdownInterval.current);
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


  const handleCanvasInteraction = () => {
    // todo
  }
  
  const handleCanvasMouseMove = () => {
    // todo
  }

  return (
    <div className="page-container">
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
        {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}
      </>}
      {connected && <div style={{ marginTop: 24 }}>
            <h4>Players in Lobby:</h4>
            <ul style={{ fontSize: 20, listStyle: 'none', padding: 0 }}>
                {lobbyUsers.map(u => <li key={u}>{u}</li>)}
            </ul>
            {parameters && <><h4>Parameters:</h4>
              {parameters?.atlas && <div>Atlas: {parameters.atlas}</div>}
              <div>Number of regions: {parameters.regionsNumber}</div>
              <div>Time per region: {parameters.durationPerRegion}</div>
              {parameters.gameoverOnError && <div>Game over on error mode activated</div>}
            </>}

      </div>}
      <canvas id="gl1" onClick={handleCanvasInteraction} onTouchStart={handleCanvasInteraction}
        onMouseMove={handleCanvasMouseMove} onMouseLeave={handleCanvasMouseMove} ref={canvasRef}></canvas>
    </div>
  )
}

export default MultiplayerGameScreen
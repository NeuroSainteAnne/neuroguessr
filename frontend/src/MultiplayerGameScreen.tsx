import type { TFunction } from 'i18next';
import React, { useEffect, useRef, useState } from 'react';
import { isTokenValid, refreshToken } from './helper_login';

const MultiplayerGameScreen = ({ t, callback, authToken, userUsername, askedSessionCode, askedSessionToken, loadEnforcer }:
  {
    t: TFunction<"translation", undefined>, callback: AppCallback, authToken: string, userUsername: string,
    askedSessionCode: string | null, askedSessionToken: string | null, loadEnforcer: number
  }) => {
  const [inputCode, setInputCode] = useState<string>("");
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lobbyUsers, setLobbyUsers] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const [parameters, setParameters] = useState<MultiplayerParametersType|null>(null)

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
    if(wsRef.current && wsRef.current.readyState && askedSessionToken){
      wsRef.current.send(JSON.stringify({ type: 'launch-game', sessionCode: inputCode, sessionToken: askedSessionToken }))
    }
  }

  useEffect(() => {
    if (askedSessionCode) {
      setInputCode(askedSessionCode)
      connectWS(askedSessionCode)
    }
  }, [askedSessionCode, askedSessionToken])

  useEffect(()=>{
      console.log("asked3")
    tryLaunchGame()
      console.log("asked4")
  }, [askedSessionToken])

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
    </div>
  )
}

export default MultiplayerGameScreen
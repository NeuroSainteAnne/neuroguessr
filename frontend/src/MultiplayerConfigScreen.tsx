import type { TFunction } from 'i18next';
import React, { useEffect, useRef, useState } from 'react';
import { isTokenValid, refreshToken } from './helper_login';
import { GameSelectorAtlas } from './GameSelector';

const DEFAULT_REGION_NUMBER = 15;
const DEFAULT_DURATION_PER_REGION = 15;
const DEFAULT_GAMEOVER_ON_ERROR = false;

const MultiplayerConfigScreen = ({ t, callback, authToken, userUsername }:
    { t: TFunction<"translation", undefined>, callback: AppCallback, authToken: string, userUsername: string }) => {
    const [sessionCode, setSessionCode] = useState<string | null>(null);
    const [sessionToken, setSessionToken] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lobbyUsers, setLobbyUsers] = useState<string[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>("cortical_regions");
    const [selectedAtlas, setSelectedAtlas] = useState<string>("");
    const [numRegions, setNumRegions] = useState<number>(DEFAULT_REGION_NUMBER);
    const [durationPerRegion, setDurationPerRegion] = useState<number>(DEFAULT_DURATION_PER_REGION);
    const [gameoverOnError, setGameoverOnError] = useState<boolean>(DEFAULT_GAMEOVER_ON_ERROR);
    const parametersRef = useRef<MultiplayerParametersType>({
        atlas: undefined,
        regionsNumber: DEFAULT_REGION_NUMBER,
        durationPerRegion: DEFAULT_DURATION_PER_REGION,
        gameoverOnError: DEFAULT_GAMEOVER_ON_ERROR
    })

    const createSession = async () => {
        setLoading(true);
        setError(null);
        // Check if the player is logged in
        if (!authToken) {
            setError('Please log in');
            return;
        }
        if (!isTokenValid(authToken)) {
            setError('Please log in');
            return;
        }
        if (!refreshToken()) {
            setError('Please log in again');
            return;
        }
        try {
            const response = await fetch('/api/create-multiplayer-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
            });
            if (!response.ok) {
                const result = await response.json();
                setError(result.message || 'Failed to create session');
                setLoading(false);
                return;
            }
            const result = await response.json();
            setSessionCode(result.sessionCode);
            setSessionId(result.sessionId);
            setSessionToken(result.sessionToken);
        } catch (err) {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (sessionCode && sessionToken) {
            const ws = new WebSocket(`ws://${window.location.hostname}:3001`);
            wsRef.current = ws;
            ws.onopen = () => {
                ws.send(JSON.stringify({
                    type: 'join',
                    sessionCode,
                    token: authToken
                }));
            };
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'lobby-users' && Array.isArray(data.users)) {
                setLobbyUsers(data.users);
                } else if (data.type === 'player-joined' && data.userName) {
                setLobbyUsers(prev => Array.from(new Set([...prev, data.userName])));
                } else if (data.type === 'player-left' && data.userName) {
                setLobbyUsers(prev => prev.filter(u => u !== data.userName));
                }
            };
            ws.onerror = () => {
                setError('WebSocket connection error');
            };
            ws.onclose = () => {
                // Optionally handle disconnect
            };
            return () => ws.close();
        }
    }, [sessionCode, sessionToken]);

    const updateParameters = (newParameters : Partial<MultiplayerParametersType>) => {
        parametersRef.current = {...parametersRef.current, ...newParameters}
        // Send updated parameters to the server
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'update-parameters',
                parameters: parametersRef.current
            }));
        }
    }

    useEffect(()=>{
        if(selectedAtlas){
            updateParameters({atlas:selectedAtlas})
        } else {
            updateParameters({atlas:undefined})
        }
    }, [selectedAtlas])

    useEffect(() => {
        createSession()
    }, [])

    return (
        <div className="page-container">
            {!sessionCode && <div>'Creating multiplayer session...'</div>}
            {sessionCode && (
                <div style={{ marginTop: 24 }}>
                    <div style={{display:"flex", flexDirection:"row", alignItems:"flex-start", justifyContent:"space-between"}}>
                        <div>
                            <h3>Your Game Code:</h3>
                            <div style={{ fontSize: 32, fontWeight: 'bold', letterSpacing: 4, userSelect: 'all' }}>{sessionCode}
                                <button
                                    title="Copy game link"
                                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
                                    onClick={() => {
                                        if (sessionCode && sessionToken) {
                                            const url = `${window.location.origin}/#/multiplayer-game/${sessionCode}`;
                                            navigator.clipboard.writeText(url);
                                        }
                                    }}
                                >
                                    {/* Simple copy icon SVG */}
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div style={{ marginTop: 24 }}>
                            <h4>Players in Lobby:</h4>
                            <ul style={{ fontSize: 20, listStyle: 'none', padding: 0 }}>
                                {lobbyUsers.map(u => <li key={u}>{u}</li>)}
                            </ul>
                        </div>
                    </div>
                    <div id="single-player-options" className="single-player-options-container">
                        <section className="atlas-selection">
                            <h2><img src="assets/interface/numero-1.png" alt="Atlas Icon" /> <span data-i18n="select_atlas">Select Atlas</span></h2>
                            <GameSelectorAtlas t={t} selectedAtlas={selectedAtlas} setSelectedAtlas={setSelectedAtlas}
                                selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} />
                        </section>
                        <section className="mode-selection">
                            <h2><img src="assets/interface/numero-2.png" alt="Game Mode Icon" /> <span data-i18n="select_game_mode">Select Game Mode</span></h2>
                            <div className="mode-buttons">
                                <div style={{ margin: '24px 0' }}>
                                <label htmlFor="numRegionsSlider" style={{ fontSize: 18, marginRight: 12 }}>
                                    Number of Regions: <b>{numRegions}</b>
                                </label>
                                <input
                                    id="numRegionsSlider"
                                    type="range"
                                    min={5}
                                    max={30}
                                    value={numRegions}
                                    onChange={e => setNumRegions(Number(e.target.value))}
                                    onMouseUp={(e) => updateParameters({regionsNumber: Number((e.currentTarget as HTMLInputElement).value)})}
                                    onTouchEnd={(e) => updateParameters({regionsNumber: Number((e.currentTarget as HTMLInputElement).value)})}
                                    style={{ width: 200, verticalAlign: 'middle' }}
                                />
                                </div>
                            </div>
                            <div className="mode-buttons">
                                <div style={{ margin: '24px 0' }}>
                                <label htmlFor="regionsDurationSlider" style={{ fontSize: 18, marginRight: 12 }}>
                                    Duration per region (sec): <b>{durationPerRegion}</b>
                                </label>
                                <input
                                    id="regionsDurationSlider"
                                    type="range"
                                    min={5}
                                    max={30}
                                    value={durationPerRegion}
                                    onChange={e => setDurationPerRegion(Number(e.target.value))}
                                    onMouseUp={(e) => updateParameters({durationPerRegion: Number((e.currentTarget as HTMLInputElement).value)})}
                                    onTouchEnd={(e) => updateParameters({durationPerRegion: Number((e.currentTarget as HTMLInputElement).value)})}
                                    style={{ width: 200, verticalAlign: 'middle' }}
                                />
                                </div>
                            </div>
                            <div className="mode-buttons">
                                <label htmlFor="gameoverOnErrorCheckbox" style={{ fontSize: 18, marginRight: 12 }}>
                                    <input
                                        id="gameoverOnErrorCheckbox"
                                        type="checkbox"
                                        checked={gameoverOnError}
                                        onChange={e => {
                                            setGameoverOnError(e.target.checked);
                                            updateParameters({ gameoverOnError: e.target.checked });
                                        }}
                                        style={{ marginRight: 8 }}
                                    />
                                    Game over on first error
                                </label>
                            </div>
                            <button
                                className={(selectedAtlas=="" || lobbyUsers.length <= 1)?"play-button disabled":"play-button enabled"}
                                onClick={() => {
                                    if(!loading && selectedAtlas && lobbyUsers.length > 1) callback.launchMultiPlayerGame(sessionCode, sessionToken || "");
                                }}
                                disabled={loading}
                            >
                                Start Game
                            </button>
                        </section>
                    </div>
                </div>
            )}
            {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}
        </div>
    );
};

export default MultiplayerConfigScreen;

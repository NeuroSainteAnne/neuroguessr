import React, { useEffect, useRef, useState } from 'react';
import { GameSelectorAtlas } from '../GameSelectorAtlas';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../../../context/AppContext';
import { MultiplayerParametersType } from '../../../types';
import { isTokenValid, refreshToken } from '../../../utils/helper_login';
import { useGameSelector } from '../../../context/GameSelectorContext';

const DEFAULT_REGION_NUMBER = 15;
const DEFAULT_DURATION_PER_REGION = 15;
const DEFAULT_GAMEOVER_ON_ERROR = false;

const MultiplayerConfigScreen = () => {
    const { t, authToken, userUsername } = useApp();
    const { selectedAtlas, setSelectedAtlas } = useGameSelector();
    const [sessionCode, setSessionCode] = useState<string | null>(null);
    const [sessionToken, setSessionToken] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lobbyUsers, setLobbyUsers] = useState<string[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const [numRegions, setNumRegions] = useState<number>(DEFAULT_REGION_NUMBER);
    const [durationPerRegion, setDurationPerRegion] = useState<number>(DEFAULT_DURATION_PER_REGION);
    const [gameoverOnError, setGameoverOnError] = useState<boolean>(DEFAULT_GAMEOVER_ON_ERROR);
    const parametersRef = useRef<MultiplayerParametersType>({
        atlas: undefined,
        regionsNumber: DEFAULT_REGION_NUMBER,
        durationPerRegion: DEFAULT_DURATION_PER_REGION,
        gameoverOnError: DEFAULT_GAMEOVER_ON_ERROR
    })
    const [copiedIcon, setCopiedIcon] = useState<null | "code" | "link">(null);

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
            const ws = new WebSocket(`/websocket`);
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
            return () => { if(ws.readyState == ws.OPEN) ws.close(); }
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
            <title>NeuroGuessr - Create multiplayer game</title>
            {!sessionCode && <div>'Creating multiplayer session...'</div>}
            {sessionCode && (
                <div style={{ marginTop: 24 }}>
                    <div style={{display:"flex", flexDirection:"row", alignItems:"flex-start", justifyContent:"space-between"}}>
                    </div>
                    <div id="single-player-options" className="single-player-options-container">
                        <section className="atlas-selection">
                            <h2><img src="/interface/numero-1.png" alt="Atlas Icon" /> <span>{t("select_atlas")}</span></h2>
                            <GameSelectorAtlas />
                        </section>
                        <section className="mode-selection">
                            <h2><img src="/interface/numero-2.png" alt="Parameters Icon" /> <span>{t("select_params")}</span></h2>
                            <div className="mode-buttons">
                                <div style={{ margin: '24px 0' }}>
                                <label htmlFor="numRegionsSlider" style={{ fontSize: 18, marginRight: 12 }}>
                                    {t("number_regions")} <b>{numRegions}</b>
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
                                    {t("duration_per_region")}: <b>{durationPerRegion}</b>
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
                            {false && "FOR v2" && <div className="mode-buttons">
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
                                    {t("gameover_first_error")}
                                </label>
                            </div>}
                        </section>
                    </div>
                    <div id="single-player-options" className="single-player-options-container">
                        <section className="lobby-wait">
                            <h2><img src="/interface/numero-1.png" alt="Atlas Icon" /> <span>{t("wait_players_in_lobby")}</span></h2>
                            <div>
                                <div style={{ fontSize: 32, fontWeight: 'bold', letterSpacing: 4, userSelect: 'all' }}>{sessionCode}
                                    <button
                                        title="Copy game number"
                                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: copiedIcon === "code" ? "#2196f3" : "inherit" }}
                                        onClick={() => {
                                            if (sessionCode && sessionToken) {
                                                navigator.clipboard.writeText(sessionCode);
                                                setCopiedIcon("code");
                                                setTimeout(() => setCopiedIcon(null), 1000);
                                            }
                                        }}
                                    >
                                        {/* Simple copy icon SVG */}
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                        </svg>
                                    </button>
                                    <button
                                        title="Copy game link (link icon)"
                                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: copiedIcon === "link" ? "#2196f3" : "inherit", marginLeft: 4 }}
                                        onClick={() => {
                                            if (sessionCode && sessionToken) {
                                                const url = `${window.location.origin}/multiplayer/${sessionCode}`;
                                                navigator.clipboard.writeText(url);
                                                setCopiedIcon("link");
                                                setTimeout(() => setCopiedIcon(null), 1000);
                                            }
                                        }}
                                    >
                                        {/* Link icon SVG */}
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M10 13a5 5 0 0 1 7.07 0l1.41 1.41a5 5 0 0 1 0 7.07 5 5 0 0 1-7.07 0l-1.41-1.41" />
                                            <path d="M14 11a5 5 0 0 0-7.07 0l-1.41 1.41a5 5 0 0 0 0 7.07 5 5 0 0 0 7.07 0l1.41-1.41" />
                                        </svg>
                                    </button>
                                </div>
                                <QRCodeSVG value={`${window.location.origin}/multiplayer/${sessionCode}`}
                                    bgColor="#00000000" fgColor="#FFFFFF" />
                                <h3>{t("game_code")}</h3>
                            </div>
                        </section>
                        <div>
                            <h2>&nbsp;</h2>
                            <h3>{t("players_in_lobby")}</h3>
                            <ul style={{ fontSize: 20, listStyle: 'none', padding: 0 }}>
                                {lobbyUsers.map(u => <li key={u}>{u}</li>)}
                            </ul>
                            <a
                                className={(selectedAtlas=="" || lobbyUsers.length <= 1)?"play-button disabled":"play-button enabled"}
                                href={`/multiplayer/${sessionCode}${(sessionToken?"/"+sessionToken:"")}`}
                                onClick={(e)=>{
                                    if(!loading && selectedAtlas && lobbyUsers.length > 1) e.preventDefault();
                                }}
                            >
                                {t("start_game_button")}
                        </a></div>
                    </div>
                </div>
            )}
            {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}
        </div>
    );
};

export default MultiplayerConfigScreen;

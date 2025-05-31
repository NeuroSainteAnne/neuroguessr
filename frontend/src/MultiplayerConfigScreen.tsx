import type { TFunction } from 'i18next';
import React, { useEffect, useRef, useState } from 'react';
import { isTokenValid, refreshToken } from './helper_login';

const MultiplayerConfigScreen = ({ t, callback, authToken, userUsername }:
    { t: TFunction<"translation", undefined>, callback: AppCallback, authToken: string, userUsername: string }) => {
    const [sessionCode, setSessionCode] = useState<string | null>(null);
    const [sessionToken, setSessionToken] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lobbyUsers, setLobbyUsers] = useState<string[]>([]);
    const wsRef = useRef<WebSocket | null>(null);

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

    useEffect(() => {
        createSession()
    }, [])

    return (
        <div className="page-container">
            <h2>Placeholder for Multiplayer Game Setup</h2>
            {!sessionCode && <div>'Creating multiplayer session...'</div>}
            {sessionCode && (
                <div style={{ marginTop: 24 }}>
                    <h3>Your Game Code:</h3>
                    <div style={{ fontSize: 32, fontWeight: 'bold', letterSpacing: 4, userSelect: 'all' }}>{sessionCode}</div>
                    <button
                        style={{ marginTop: 24, fontSize: 20, padding: '8px 24px' }}
                        onClick={() => {
                            callback.launchMultiPlayerGame(sessionCode);
                        }}
                        disabled={loading}
                    >
                        Start Game
                    </button>
                    <div style={{ marginTop: 24 }}>
                        <h4>Players in Lobby:</h4>
                        <ul style={{ fontSize: 20, listStyle: 'none', padding: 0 }}>
                            {lobbyUsers.map(u => <li key={u}>{u}</li>)}
                        </ul>
                    </div>
                </div>
            )}
            {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}
        </div>
    );
};

export default MultiplayerConfigScreen;

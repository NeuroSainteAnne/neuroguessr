import { useState, useEffect, useRef } from "react";
import { useApp } from "../../../context/AppContext";
import { useGameSelector } from "../../../context/GameSelectorContext";
import "./MultiBox.css";
import { Socket, io } from 'socket.io-client';

export function MultiBox() {
    const { t, isLoggedIn } = useApp();
    const [multiplayerInputCode, setMultiplayerInputCode] = useState<string>("")

    // New: Public lobbies state
    const [publicLobbies, setPublicLobbies] = useState<Array<{
        sessionCode: string;
        atlas?: string;
        totalDuration?: number;
        users?: number;
        createdAt?: string;
        blindMode?: boolean;
        creator: string;
    }>>([]);
    const [loadingPublic, setLoadingPublic] = useState(false);
    const [errorPublic, setErrorPublic] = useState<string | null>(null);

    // Socket ref for public lobbies subscription
    const publicSocketRef = useRef<Socket | null>(null);

    useEffect(() => {
        setLoadingPublic(true);
        setErrorPublic(null);
        const socket = io('/', {
            path: '/socket.io',
            transports: ['polling', 'websocket'],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000,
            forceNew: true,
        });
        publicSocketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('connect-public');
        });
        socket.on('public-lobbies-update', (payload: any) => {
            const lobbies = Array.isArray(payload?.lobbies) ? payload.lobbies : [];
            setPublicLobbies(lobbies);
            setLoadingPublic(false);
            setErrorPublic(null);
        });
        socket.on('connect_error', (err: Error) => {
            setErrorPublic(`Connection error: ${err.message}`);
            setLoadingPublic(false);
        });
        socket.on('error', (err: any) => {
            const msg = typeof err === 'string' ? err : (err?.message || 'Socket error');
            setErrorPublic(msg);
            setLoadingPublic(false);
        });

        return () => {
            try {
                socket.off('public-lobbies-update');
                socket.off('connect_error');
                socket.off('error');
                socket.disconnect();
            } catch {}
            publicSocketRef.current = null;
        };
    }, []);

    const formatDuration = (seconds?: number) => {
        if (!seconds && seconds !== 0) return "-";
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    };

    return (
        <div className="multiplayer-box">
            <div className="multiplayer-box-join">
                <h2>{t("join_multiplayer_lobby")}</h2>
                <div><input
                    type="text"
                    value={multiplayerInputCode}
                    onChange={e => setMultiplayerInputCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder={t("multi_8_digits")}
                    style={{ fontSize: 24, letterSpacing: 4, textAlign: 'center', width: 250, border: "1px solid white" }}
                /></div>
                <div><a className="play-button enabled" href={`/multiplayer/${multiplayerInputCode}`}
                    onClick={(e) => {
                        if (!(parseInt(multiplayerInputCode) >= 10000000 && parseInt(multiplayerInputCode) <= 99999999)) { 
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    }}>
                    {t("join_multiplayer_button")}</a></div>
            </div>
            {publicLobbies.length > 0 && <div className="multiplayer-box-join" style={{ marginTop: 24 }}>
                <h2>{t("public_multiplayer_games") || "Public Multiplayer Games"}</h2>
                {loadingPublic && <div>{t("loading") || "Loading..."}</div>}
                {errorPublic && <div style={{ color: "#ff8a80" }}>{errorPublic}</div>}
                {!loadingPublic && !errorPublic && (
                    <table className="public-lobbies-list"><tbody>
                        {publicLobbies.map((lobby) => (
                            <tr className="public-lobby-item" key={lobby.sessionCode}>
                                <td className="public-lobby-main">
                                    <div className="public-lobby-code">#{lobby.sessionCode}</div>
                                    <div className="public-lobby-creator">{t("created_by")}: {lobby.creator}</div>
                                    {lobby.atlas && <div className="public-lobby-atlas">{t("parameters_atlas") || "Atlas"}: {lobby.atlas}</div>}
                                    <div className="public-lobby-time">{t("total_time") || "Total time"}: {formatDuration(lobby.totalDuration)}</div>
                                    {lobby.blindMode && <div className="public-lobby-badge">{t("blind_mode") || "Blind"}</div>}
                                </td>
                                <td>
                                    <a className="public-lobby-join-button enabled" href={`/multiplayer/${lobby.sessionCode}`}>{t("join_multiplayer_button") || "Join"}</a>
                                </td>
                            </tr>
                        ))}
                    </tbody></table>
                )}
            </div>}
            {isLoggedIn &&
                <div className="multiplayer-box-join">
                    <h2>{t("create_multiplayer_game")}</h2>
                    <div><a className="play-button enabled"
                        href="/welcome/multiplayer-create">{t("create_multiplayer_button")}</a></div>
                </div>}
            {!isLoggedIn && <>
                <div className="multiplayer-please-login" dangerouslySetInnerHTML={{
                    __html: t("multi_unavailable_login")
                }}></div>
                <a href="/welcome/multiplayer-create" style={{ display: "none" }}>{t("create_multiplayer_button")}</a></>}
        </div>
    )
}
import { useState, useEffect, useRef } from "react";
import { useApp } from "../../../context/AppContext";
import "./MultiBox.css";
import { Socket, io } from 'socket.io-client';
import atlasFiles from '../../../utils/atlas_files';

interface PastGame {
    id: number;
    atlas: string | null;
    blindMode: boolean;
    score: number;
    correct: number;
    incorrect: number;
    multiplayerGamesWon: number;
    name: string | null;
    createdAt: string;
    classicChallengeId: number | null;
    theoreticalMaximumScore: number;
}

export function MultiBox() {
    const { t, isLoggedIn, authToken } = useApp();
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

    // Past games state
    const [pastGames, setPastGames] = useState<PastGame[]>([]);

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
            setErrorPublic(`${t("Connection error")}: ${err.message}`);
            setLoadingPublic(false);
        });
        socket.on('error', (err: any) => {
            const msg = typeof err === 'string' ? err : (t(err?.message) || t('Socket error'));
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

    useEffect(() => {
        if (!isLoggedIn || !authToken) return;
        fetch('/api/multi/past-games', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        }).then(r => r.ok ? r.json() : null)
          .then(data => {
              if (data?.games) {
                  const normalized = data.games.map((g: any) => ({
                      id: g.id,
                      atlas: g.atlas,
                      blindMode: g.blind_mode,
                      score: g.score,
                      correct: g.correct,
                      incorrect: g.incorrect,
                      multiplayerGamesWon: g.multiplayer_games_won,
                      name: g.name,
                      createdAt: g.created_at,
                      classicChallengeId: g.classic_challenge_id,
                      theoreticalMaximumScore: g.theoretical_maximum_score,
                  }));
                  setPastGames(normalized);
              }
          })
          .catch(() => {});
    }, [isLoggedIn, authToken]);

    const formatDuration = (seconds?: number) => {
        if (!seconds && seconds !== 0) return "-";
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    };

    return (<>
        <div className="multiplayer-box">
            <div className="multiplayer-box-join">
                <h2>{t("join_multiplayer_lobby")}</h2>
                <input
                    type="text"
                    className="multiplayer-code-input"
                    value={multiplayerInputCode}
                    onChange={e => setMultiplayerInputCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder={t("multi_8_digits")}
                />
                <a className="play-button enabled" href={`/multiplayer/${multiplayerInputCode}`}
                    onClick={(e) => {
                        if (!(parseInt(multiplayerInputCode) >= 10000000 && parseInt(multiplayerInputCode) <= 99999999)) {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    }}>
                    {t("join_multiplayer_button")}</a>
            </div>
            {publicLobbies.length > 0 && <div className="multiplayer-box-join multiplayer-box-public-lobbies">
                <h2>{t("public_multiplayer_games") || "Public Multiplayer Games"}</h2>
                {loadingPublic && <div className="loading-message">{t("loading") || "Loading..."}</div>}
                {errorPublic && <div className="error-message">{errorPublic}</div>}
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
                    <a className="play-button enabled"
                        href="/welcome/multiplayer-create">{t("create_multiplayer_button")}</a>
                </div>}
            {!isLoggedIn && <>
                <div className="multiplayer-auth-widget">
                    <h3>{t("sign_in")}</h3>
                    <p>{t("login_to_create_games") || "Sign in to create and manage multiplayer games"}</p>
                    <a className="play-button enabled" href={`/login?redirect=welcome/multiplayer`}>{t("sign_in")}</a>
                    <a href={`/register?redirect=welcome/multiplayer`} className="multiplayer-register-link">{t("create_account") || "Créer un compte"}</a>
                </div>
            </>}
        </div>

        {isLoggedIn && pastGames.length > 0 && (
            <div className="multi-past-section">
                <hr className="multi-past-divider" />
                <p className="multi-past-title">{t("past_games")}</p>
                <div className="multi-past-grid">
                    {pastGames.map(game => (
                        <div key={game.id} className="multi-past-card">
                            <div className="multi-past-header">
                                <h3 className="multi-past-name">
                                    {game.name || (game.atlas ? atlasFiles[game.atlas]?.name : null) || t("multiplayer") || "Multijoueur"}
                                </h3>
                                {game.multiplayerGamesWon ? <span className="multi-past-trophy">🏆</span> : null}
                            </div>
                            <p className="multi-past-date">
                                {game.createdAt ? new Date(game.createdAt).toLocaleDateString() : "–"}
                            </p>
                            <div className="multi-past-stats">
                                <div className="multi-past-stat-item">
                                    <span className="multi-past-stat-label">{t("correct") || "Correct"}</span>
                                    <span className="multi-past-stat-value">{game.correct}/{game.correct + game.incorrect}</span>
                                </div>
                                <div className="multi-past-stat-item">
                                    <span className="multi-past-stat-label">{t("score") || "Score"}</span>
                                    <span className={`multi-past-stat-value${game.multiplayerGamesWon ? " won" : ""}`}>
                                        {game.score}{game.theoreticalMaximumScore > 0 ? ` / ${game.theoreticalMaximumScore}` : ""}
                                    </span>
                                </div>
                                {game.blindMode && (
                                    <div className="multi-past-stat-item">
                                        <span className="multi-past-stat-label">{t("blind_mode") || "Blind"}</span>
                                        <span className="multi-past-stat-value">✓</span>
                                    </div>
                                )}
                            </div>
                            <div className="multi-past-actions">
                                <a href={`/multiplayer/?replay_session=${game.id}`} className="multi-past-btn">
                                    {t("review_button") || "Revoir"}
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
    </>)

}
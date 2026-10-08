import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import './ChallengeResults.css';
import { formatTime } from '../../utils/formatters';
import ChallengeEmailOptIn from '../../components/ChallengeEmailOptIn';
import { GameSelectorWithSearch } from '../welcome/GameSelectorWithSearch';

interface Challenge {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  creator: string;
}

interface Participant {
  userId: number;
  username: string;
  score: number;
  duration: number;
  avgTimePerRegion: number;
  correct: number;
  incorrect: number;
  attempts: number;
  completionDate: string;
  ranking: number;
  teamId: number | null;
  teamName: string | null;
}

interface TeamRanking {
  teamId: number | null;
  teamName: string;
  playerCount: number;
  avgScore: number;
  avgTimePerRegion: number;
}

interface ChallengeResultsData {
  challenge: Challenge;
  sessionCode: string | null;
  state: 'pending' | 'started' | 'finished';
  participants: Participant[];
  teamRankings?: TeamRanking[];
}

export function Page() {
  const { authToken, isLoggedIn, userUsername, pageContext, t, userIsAdmin } = useApp();
  const { challengeId } = pageContext.routeParams;
  const [data, setData] = useState<ChallengeResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeDisplay, setTimeDisplay] = useState<string>('');
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [fullResults, setFullResults] = useState<boolean>(false);
  // email opt-in is handled by reusable component

  useEffect(() => {
    if (!challengeId) {
      setError(t("no_challenge_id"));
      setLoading(false);
      setIsCompleted(false);
      return;
    }

    fetch(`/api/multi/challenge-results/${challengeId}${fullResults ? '/full' : ''}`, {
      headers: isLoggedIn ? { 'Authorization': `Bearer ${authToken}` } : {}
    })
    .then(res => {
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
    })
    .then(data => {
        setData(data);
        setLoading(false);
    })
    .catch(err => {
        console.error("Error fetching challenge results:", err);
        setError(err.message || t("failed_to_load_results"));
        setLoading(false);
    });

    if (!isLoggedIn || !authToken) {
      setIsCompleted(false);
      return;
    }
    
    const checkCompletion = async () => {
      try {
        const response = await fetch(`/api/classic-challenges/${challengeId}/completion`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setIsCompleted(data.completed);
        }
      } catch (err) {
        console.error('Error checking challenge completion:', err);
      }
    };
    checkCompletion();
    
  }, [challengeId, authToken, isLoggedIn, t, fullResults]);

  

  // Update countdown for challenges
  useEffect(() => {
    if (data && data.challenge.startDate && data.challenge.endDate) {
      const updateCountdown = () => {
        const now = new Date();
        
        if (data.state === 'pending') {
          const targetDate = new Date(data.challenge.startDate);
          const diff = targetDate.getTime() - now.getTime();
          
          if (diff <= 0) {
            setTimeDisplay(t("starting_soon"));
            return;
          }
          
          setTimeDisplay(formatTime({ms: diff, showSeconds: true}));
        } else if (data.state === 'started') {
          const targetDate = new Date(data.challenge.endDate);
          const diff = targetDate.getTime() - now.getTime();
          
          if (diff <= 0) {
            setTimeDisplay(t("ended"));
            return;
          }
          
          setTimeDisplay(formatTime({ms: diff, showSeconds: true}));
        } else {
          setTimeDisplay('');
          return;
        }
      };
      
      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    } else {
      setTimeDisplay('');
    }
    return undefined;
  }, [data, t]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="challenge-results-page">
        <div className="loading">{t("loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="challenge-results-page">
        <div className="error">
          <h2>{t("error")}</h2>
          <p>{error}</p>
          <a href="/welcome">{t("back_to_home")}</a>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="challenge-results-page">
        <div className="error">
          <h2>{t("challenge_not_found")}</h2>
          <a href="/welcome">{t("back_to_home")}</a>
        </div>
      </div>
    );
  }

  const { challenge, sessionCode, state, participants, teamRankings } = data;
  const hasTeams = teamRankings && teamRankings.length > 0;
  const currentUserParticipation = participants.find(p => p.username === userUsername) || null;
  const title = t("challenge_results_title", { challengeName: challenge.name }) || 'Challenge Results';

  const rankEmoji = (r: number) => r === 1 ? '🏆' : r === 2 ? '🥈' : r === 3 ? '🥉' : null;

  return (
    <>
      <title>{title}</title>
      <GameSelectorWithSearch forceTab="challenges" />
      <div className="challenge-results-page">
        <p className="cr-page-title">{t("challenge_results_section_title") || "Résultats du défi"} · <span>{challenge.name}</span></p>

        {/* ── HEADER CARD ── */}
        <div className="challenge-header">
          <div className="challenge-header-top">
            <h1>{challenge.name || t("classic_challenge")}</h1>
            <span className={`status status-${state}`}>
              {state === 'pending' && `${t("not_started_yet")}${timeDisplay ? ` · ${timeDisplay}` : ''}`}
              {state === 'started'  && `${t("in_progress")}${timeDisplay ? ` · ${timeDisplay} ${t("remaining")}` : ''}`}
              {state === 'finished' && t("completed")}
            </span>
          </div>
          <div className="challenge-results-info">
            <div className="info-item">
              <strong>{t("created_by")}</strong>
              <span>{challenge.creator}</span>
            </div>
            <div className="info-item">
              <strong>{t("start")}</strong>
              <span>{formatDate(challenge.startDate)}</span>
            </div>
            <div className="info-item">
              <strong>{t("end")}</strong>
              <span>{formatDate(challenge.endDate)}</span>
            </div>
          </div>
          {userIsAdmin && (
            <div className="admin-controls">
              <label>
                <input type="checkbox" checked={fullResults} onChange={e => setFullResults(e.target.checked)} />
                {" "}{t("show_full_results") || "Show Full Results"}
              </label>
            </div>
          )}
        </div>

        {/* ── BODY: sidebar + main ── */}
        <div className="challenge-results-body">

          {/* LEFT SIDEBAR */}
          <div className="challenge-results-sidebar">

            {/* Votre participation */}
            {currentUserParticipation && (
              <div className="cr-card">
                <p className="cr-card-title">{t("your_participation")}</p>
                <div className="participation-rank-hero">
                  <div className="participation-rank-number">
                    {rankEmoji(currentUserParticipation.ranking) || `#${currentUserParticipation.ranking}`}
                  </div>
                  <div className="participation-rank-label">/ {participants.length} {t("participants")}</div>
                </div>
                <div className="participation-grid">
                  <div className="participation-stat">
                    <span className="participation-stat-label">{t("score")}</span>
                    <span className="participation-stat-value">{currentUserParticipation.score}</span>
                  </div>
                  <div className="participation-stat">
                    <span className="participation-stat-label">{t("time_per_region")}</span>
                    <span className="participation-stat-value">{Math.round(currentUserParticipation.avgTimePerRegion/100)/10}s</span>
                  </div>
                  <div className="participation-stat">
                    <span className="participation-stat-label">{t("completed_at")}</span>
                    <span className="participation-stat-value">{formatDate(currentUserParticipation.completionDate)}</span>
                  </div>
                </div>
                <div className="cr-actions-row">
                  {state !== 'finished' && (
                    <ChallengeEmailOptIn challengeId={challenge.id} className="email-optin-btn" />
                  )}
                  {isCompleted && (
                    <a href={`/multiplayer/?replay_multi=${challenge.id}`} className="review-button review-button--primary">
                      {t("see_your_results") || "Revoir ma partie"}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Join button (non-participant) */}
            {state !== 'finished' && sessionCode && !currentUserParticipation && !isCompleted && (
              <a href={`/multiplayer/${sessionCode}`} className="join-button">
                {state === 'pending' ? t("view_challenge") : t("join_challenge")}
              </a>
            )}

          </div>

          {/* RIGHT MAIN */}
          <div className="challenge-results-main">

            {/* Teams */}
            {hasTeams && teamRankings!.length > 0 && (
              <div>
                <p className="section-title">Teams Results</p>
                <div className="cr-table-wrap">
                  <div className="teams-table">
                    <div className="table-header">
                      <div className="col-rank">#</div>
                      <div className="col-team-name">Team</div>
                      <div className="col-players">Players</div>
                      <div className="col-score">Avg Score</div>
                      <div className="col-tpr">Avg s/région</div>
                    </div>
                    {teamRankings!.map((team, i) => (
                      <div key={team.teamId ?? 'no-team'}
                        className={`table-row ${team.teamId === currentUserParticipation?.teamId ? 'current-user-team' : ''}`}>
                        <div className="col-rank">#{i + 1}</div>
                        <div className="col-team-name">{team.teamName}</div>
                        <div className="col-players">{team.playerCount}</div>
                        <div className="col-score">{Math.round(team.avgScore * 10) / 10}</div>
                        <div className="col-tpr">{Math.round(team.avgTimePerRegion / 100) / 10}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Participants */}
            <div>
              <p className="section-title">{t("participants")} · {participants.length}</p>
              {participants.length === 0 ? (
                <p className="no-participants">
                  {state === 'pending' && t("no_participants_pending")}
                  {state === 'started' && t("no_participants_started")}
                  {state === 'finished' && t("no_participants_finished")}
                </p>
              ) : (
                <div className="cr-table-wrap">
                  <div className="participants-table">
                    <div className="table-header">
                      <div className="col-rank">#</div>
                      <div className="col-name">{t("name_header")}</div>
                      {hasTeams && <div className="col-team">Team</div>}
                      <div className="col-score">{t("score")}</div>
                      <div className="col-tpr">s/région</div>
                    </div>
                    {participants.map(p => (
                      <div key={p.userId}
                        className={`table-row ${p.username === userUsername ? 'current-user' : ''}`}>
                        <div className="col-rank">{rankEmoji(p.ranking) || `#${p.ranking}`}</div>
                        <div className="col-name">{p.username}</div>
                        {hasTeams && <div className="col-team">{p.teamName || '—'}</div>}
                        <div className="col-score">{p.score}</div>
                        <div className="col-tpr">{Math.round(p.avgTimePerRegion/100)/10}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
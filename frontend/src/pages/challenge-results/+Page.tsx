import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import './ChallengeResults.css';
import { formatTime } from '../../utils/formatters';
import ChallengeEmailOptIn from '../../components/ChallengeEmailOptIn';

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
}

interface ChallengeResultsData {
  challenge: Challenge;
  sessionCode: string | null;
  state: 'pending' | 'started' | 'finished';
  participants: Participant[];
}

export function Page() {
  const { authToken, isLoggedIn, userUsername, pageContext, t } = useApp();
  const { challengeId } = pageContext.routeParams;
  const [data, setData] = useState<ChallengeResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeDisplay, setTimeDisplay] = useState<string>('');
  // email opt-in is handled by reusable component

  useEffect(() => {
    if (!challengeId) {
      setError(t("no_challenge_id"));
      setLoading(false);
      return;
    }

    fetch(`/api/multi/challenge-results/${challengeId}`, {
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
  }, [challengeId, authToken, isLoggedIn, t]);

  

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

  const { challenge, sessionCode, state, participants } = data;

  // Find current user's participation from participants array
  const currentUserParticipation = participants.find(p => p.username === userUsername) || null;
  
  return (
    <div className="challenge-results-page">
      <div className="challenge-header">
        <h1>{challenge.name || t("classic_challenge")}</h1>
        <div className="challenge-results-info">
          <div className="info-item">
            <strong>{t("created_by")}:</strong> {challenge.creator}
          </div>
          <div className="info-item">
            <strong>{t("status")}:</strong>
            <span className={`status status-${state}`}>
              {state === 'pending' && `${t("not_started_yet")} ${timeDisplay ? `(${timeDisplay} ${t("until_start")})` : ''}`}
              {state === 'started' && `${t("in_progress")} ${timeDisplay ? `(${timeDisplay} ${t("remaining")})` : ''}`}
              {state === 'finished' && t("completed")}
            </span>
          </div>
          <div className="info-item">
            <strong>{t("start")}:</strong> {formatDate(challenge.startDate)}
          </div>
          <div className="info-item">
            <strong>{t("end")}:</strong> {formatDate(challenge.endDate)}
          </div>
        </div>
      </div>

      {currentUserParticipation && (
        <div className="user-participation">
          <h2>{t("your_participation")}</h2>
          <div className="participation-details">
            <div className="detail-item">
              <strong>{t("ranking")}:</strong>
              {currentUserParticipation.ranking == 1 ? "🏆 " : ""}
              {currentUserParticipation.ranking == 2 ? "🥈 " : ""}
              {currentUserParticipation.ranking == 3 ? "🥉 " : ""}
              #{currentUserParticipation.ranking} / {participants.length}
            </div>
            <div className="detail-item">
              <strong>{t("score")}:</strong> {currentUserParticipation.score}
            </div>
            <div className="detail-item">
              <strong>{t("time_per_region")}:</strong> {Math.round(currentUserParticipation.avgTimePerRegion/100)/10}
            </div>
            <div className="detail-item">
              <strong>{t("completed_at")}:</strong> {formatDate(currentUserParticipation.completionDate)}
            </div>
          </div>
          
          {currentUserParticipation && state !== 'finished' && (
            <div className="email-optin-section">
              <ChallengeEmailOptIn challengeId={challenge.id} />
            </div>
          )}
        </div>
      )}

      <div className="participants-section">
        <h2>{t("participants")} ({participants.length})</h2>
        {participants.length === 0 ? (
          <p className="no-participants">
            {state === 'pending' && t("no_participants_pending")}
            {state === 'started' && t("no_participants_started")}
            {state === 'finished' && t("no_participants_finished")}
          </p>
        ) : (
          <div className="participants-table">
            <div className="table-header">
              <div className="col-rank">#</div>
              <div className="col-name">{t("name_header")}</div>
              <div className="col-score">{t("score")}</div>
              <div className="col-tpr">{t("time_per_region")}</div>
            </div>
            {participants.map((participant) => (
              <div 
                key={participant.userId} 
                className={`table-row ${participant.username === userUsername ? 'current-user' : ''}`}
              >
                <div className="col-rank">#{participant.ranking}</div>
                <div className="col-name">
                  {participant.username}
                </div>
                <div className="col-score">{participant.score}</div>
                <div className="col-tpr">{Math.round(participant.avgTimePerRegion/100)/10}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="actions">
        {state !== 'finished' && sessionCode && !currentUserParticipation && (
          <a href={`/multiplayer/${sessionCode}`} className="join-button">
            {state === 'pending' ? t("view_challenge") : t("join_challenge")}
          </a>
        )}
      </div>
    </div>
  );
}
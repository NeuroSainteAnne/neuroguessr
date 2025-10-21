import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import './ChallengeResults.css';
import { formatTime } from '../../utils/formatters';

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
  const { authToken, isLoggedIn, userUsername, pageContext } = useApp();
  const { challengeId } = pageContext.routeParams;
  const [data, setData] = useState<ChallengeResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeDisplay, setTimeDisplay] = useState<string>('');

  useEffect(() => {
    if (!challengeId) {
      setError("No challenge ID provided");
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
        console.log(data)
        setLoading(false);
    })
    .catch(err => {
        console.error("Error fetching challenge results:", err);
        setError(err.message || "Failed to load challenge results");
        setLoading(false);
    });
  }, [challengeId, authToken, isLoggedIn]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Update countdown for challenges
  useEffect(() => {
    if (data && data.challenge.startDate && data.challenge.endDate) {
      const updateCountdown = () => {
        const now = new Date();
        let targetDate: Date;
        let label: string;
        
        if (data.state === 'pending') {
          targetDate = new Date(data.challenge.startDate);
          label = 'until start';
        } else if (data.state === 'started') {
          targetDate = new Date(data.challenge.endDate);
          label = 'remaining';
        } else {
          setTimeDisplay('');
          return;
        }
        
        const diff = targetDate.getTime() - now.getTime();
        
        if (diff <= 0) {
          setTimeDisplay(data.state === 'pending' ? 'Starting soon' : 'Ended');
          return;
        }
        
        setTimeDisplay(formatTime({ms: diff, showSeconds: true}));
      };
      
      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    } else {
      setTimeDisplay('');
      return;
    }
  }, [data]);

  if (loading) {
    return (
      <div className="challenge-results-page">
        <div className="loading">Loading challenge results...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="challenge-results-page">
        <div className="error">
          <h2>Error</h2>
          <p>{error}</p>
          <a href="/welcome">Back to home</a>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="challenge-results-page">
        <div className="error">
          <h2>Challenge not found</h2>
          <a href="/welcome">Back to home</a>
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
        <h1>{challenge.name || "Classic Challenge"}</h1>
        <div className="challenge-results-info">
          <div className="info-item">
            <strong>Created by:</strong> {challenge.creator}
          </div>
          <div className="info-item">
            <strong>Status:</strong>
            <span className={`status status-${state}`}>
              {state === 'pending' && `Not started yet ${timeDisplay ? `(${timeDisplay} until start)` : ''}`}
              {state === 'started' && `In progress ${timeDisplay ? `(${timeDisplay} remaining)` : ''}`}
              {state === 'finished' && 'Completed'}
            </span>
          </div>
          <div className="info-item">
            <strong>Start:</strong> {formatDate(challenge.startDate)}
          </div>
          <div className="info-item">
            <strong>End:</strong> {formatDate(challenge.endDate)}
          </div>
        </div>
      </div>

      {currentUserParticipation && (
        <div className="user-participation">
          <h2>Your Participation</h2>
          <div className="participation-details">
            <div className="detail-item">
              <strong>Ranking:</strong> #{currentUserParticipation.ranking} / {participants.length}
            </div>
            <div className="detail-item">
              <strong>Score:</strong> {currentUserParticipation.score}
            </div>
            <div className="detail-item">
              <strong>Time per region (sec):</strong> {Math.round(currentUserParticipation.avgTimePerRegion/100)/10}
            </div>
            <div className="detail-item">
              <strong>Completed:</strong> {formatDate(currentUserParticipation.completionDate)}
            </div>
          </div>
        </div>
      )}

      <div className="participants-section">
        <h2>Participants ({participants.length})</h2>
        {participants.length === 0 ? (
          <p className="no-participants">
            {state === 'pending' && "No one has participated yet."}
            {state === 'started' && "No one has completed the challenge yet."}
            {state === 'finished' && "No participants completed this challenge."}
          </p>
        ) : (
          <div className="participants-table">
            <div className="table-header">
              <div className="col-rank">#</div>
              <div className="col-name">Name</div>
              <div className="col-score">Score</div>
              <div className="col-tpr">Time per region (sec)</div>
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
            {state === 'pending' ? 'View Challenge' : 'Join Challenge'}
          </a>
        )}
      </div>
    </div>
  );
}
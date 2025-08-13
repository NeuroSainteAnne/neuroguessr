import React from 'react';
import { useApp } from '../context/AppContext';
import './NextChallenge.css';
import { formatTime } from '../utils/formatters';

export function NextChallenge() {
  const { 
    t, 
    nextChallenge, 
    nextChallengeLoading, 
    nextChallengeError,
    refreshNextChallenge 
  } = useApp();

  const formatTimeUntilStart = (startTime: string) => {
    const now = new Date();
    const start = new Date(startTime);
    const diff = start.getTime() - now.getTime();
    
    if (diff <= 0) return t('starting_now');
    return `${t('starts_in')} ${formatTime(diff)}`
  };

  const formatDateTime = (dateTime: string) => {
    const date = new Date(dateTime);
    return date.toLocaleString();
  };

  const handleJoinChallenge = () => {
    if (nextChallenge) {
      window.location.href = `/multiplayer/${nextChallenge.sessionCode}`;
    }
  };

  if (nextChallengeLoading || nextChallengeError || !nextChallenge) {
    return (<></>);
  }

  return (
    <div className="next-challenge-widget">
      <div className="challenge-info">
        <h3>{t('next_challenge')}</h3>
        <span className="session-code">#{nextChallenge.sessionCode}</span>
      </div>
        
      <div className="challenge-details">
        <div className="start-time">
          <strong>{formatTimeUntilStart(nextChallenge.startTime)}</strong>
        </div>
        <div className="scheduled-time">
          {t('scheduled_for')}: {formatDateTime(nextChallenge.startTime)}
        </div>
      </div>
        
      <button 
        className="join-challenge-btn"
        onClick={handleJoinChallenge}
      >
        {t('join_challenge')}
      </button>
    </div>
  );
}

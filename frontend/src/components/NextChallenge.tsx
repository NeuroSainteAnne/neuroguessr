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
    return `${t('starts_in')} ${formatTime({ms:diff, showSeconds:false})}`
  };

  const formatDateTime = (dateTime: string) => {
    const date = new Date(dateTime);
    return date.toLocaleString();
  };

  if (nextChallengeLoading || nextChallengeError || !nextChallenge) {
    return (<></>);
  }

  return (
    <SingleChallenge 
      isNext={true}
      sessionCode={nextChallenge.sessionCode}
      startTime={formatTimeUntilStart(nextChallenge.startTime)}
      scheduledTime={formatDateTime(nextChallenge.startTime)} />
  );
}

export function SingleChallenge({ isNext=false, sessionCode, startTime, scheduledTime }: { isNext?:boolean, sessionCode: string; startTime: string; scheduledTime: string; }) {
  const { 
    t
  } = useApp();

  const handleJoinChallenge = () => {
    if (sessionCode) {
      window.location.href = `/multiplayer/${sessionCode}`;
    }
  };

  return (
    <div className="next-challenge-widget">
      <div className="challenge-info">
        {isNext && <h3>{t('next_challenge')}</h3>}
        <span className="session-code">#{sessionCode}</span>
      </div>
        
      <div className="challenge-details">
        <div className="start-time">
          <strong>{startTime}</strong>
        </div>
        <div className="scheduled-time">
          {t('scheduled_for')}: {scheduledTime}
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
import React from 'react';
import { useApp } from '../context/AppContext';
import './NextChallenge.css';
import { formatTime } from '../utils/formatters';
import { consoleLog } from '../utils/logging';

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

export function SingleChallenge({ 
  isNext, sessionCode, startTime, scheduledTime, 
  allowDeletion, callbackAfterDeletion, callbackDeletionFailed,
 }: { isNext?:boolean, sessionCode: string; startTime: string; scheduledTime: string; 
    allowDeletion?: boolean; callbackAfterDeletion?: () => void; callbackDeletionFailed?: (err: string) => void; }) {
  const { 
    t, authToken, userIsAdmin
  } = useApp();
  
  const handleJoinChallenge = () => {
    if (sessionCode) {
      window.location.href = `/multiplayer/${sessionCode}`;
    }
  };

  const handleDeleteChallenge = async (sessionCode: string) => {
    if(!allowDeletion || !authToken || !userIsAdmin) return;
    if (!window.confirm(t('confirm_delete_challenge') || 'Are you sure you want to delete this challenge?')) {
      return;
    }

    try {
      const response = await fetch(`/api/challenges/${sessionCode}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Refresh the challenges list
      consoleLog("verbose", `Challenge ${sessionCode} deleted`);
      if(callbackAfterDeletion) callbackAfterDeletion();
    } catch (err) {
      console.error('Error deleting challenge:', err);
      if(callbackDeletionFailed) callbackDeletionFailed(t('error_deleting_challenge'));
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

      {allowDeletion && userIsAdmin && <button 
        className="delete-challenge-btn"
        onClick={(e)=>handleDeleteChallenge(sessionCode)}
      >
        {t('delete_challenge')}
      </button>}
    </div>
  );
}
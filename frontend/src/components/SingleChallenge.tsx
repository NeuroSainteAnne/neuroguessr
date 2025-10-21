import { useApp } from '../context/AppContext';
import { Challenge } from '../types/types';
import { formatTime } from '../utils/formatters';
import { consoleLog } from '../utils/logging';
import './SingleChallenge.css';
import { useEffect, useState } from 'react';

export function SingleChallenge({
  challenge, allowDeletion, callbackAfterDeletion, callbackDeletionFailed,
}: {
  challenge: Challenge;
  allowDeletion?: boolean;
  callbackAfterDeletion?: () => void;
  callbackDeletionFailed?: (err: string) => void;
}) {
  const {
    t, authToken, userIsAdmin, isLoggedIn
  } = useApp();
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [checkingCompletion, setCheckingCompletion] = useState<boolean>(challenge.type === 'classic');

  useEffect(() => {
    if (challenge.type !== 'classic') return;

    const checkCompletion = async () => {
      if (!isLoggedIn || !authToken || !challenge.id) {
        setCheckingCompletion(false);
        return;
      }

      try {
        const response = await fetch(`/api/classic-challenges/${challenge.sessionCode}/completion`, {
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
      } finally {
        setCheckingCompletion(false);
      }
    };

    checkCompletion();
  }, [isLoggedIn, authToken, challenge]);

  const formatTimeUntil = (startTime: string) => {
    const now = new Date();
    const start = new Date(startTime);
    const diff = start.getTime() - now.getTime();

    if (diff <= 0) return t('already_started');
    return `${formatTime({ms:diff, showSeconds:false})}`
  };

  const formatChallengeStatus = (startDate: string, endDate: string, status: string) => {
    if (status === 'upcoming') {
      return `${t("starts_in")} ${formatTimeUntil(startDate)}`;
    } else if (status === 'ended') {
      return `${t("ended")}`;
    } else {
      return `${t("ends_in")} ${formatTimeUntil(endDate)}`;
    }
  };

  const handleJoinChallenge = () => {
    if (challenge.type === 'classic' && !isLoggedIn) {
      // This should be handled by the parent component
      return;
    }
    
    if (challenge.sessionCode) {
      // Navigate to multiplayer page to join the challenge
      window.location.href = `/multiplayer/${challenge.sessionCode}`;
    }
  };

  const handleDeleteChallenge = async (sessionCode: string) => {
    if (!allowDeletion || !authToken || !userIsAdmin) return;
    if (!window.confirm(t('confirm_delete_challenge') || 'Are you sure you want to delete this challenge?')) {
      return;
    }

    const endpoint = challenge.type === 'classic' ? 'classic-challenges' : 'realtime-challenges';

    try {
      const response = await fetch(`/api/${endpoint}/${sessionCode}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      consoleLog("verbose", `${challenge.type} challenge ${sessionCode} deleted`);
      if (callbackAfterDeletion) callbackAfterDeletion();
    } catch (err) {
      console.error(`Error deleting ${challenge.type} challenge:`, err);
      if (callbackDeletionFailed) callbackDeletionFailed(t('error_deleting_challenge'));
    }
  };

  const getJoinButtonText = () => {
    if (challenge.type === 'realtime') {
      return t('join_challenge') || 'Join Challenge';
    }

    // Classic challenge logic
    if (checkingCompletion) return t("challenge_checking");
    if (isCompleted) return t("challenge_completed");
    if (!isLoggedIn) return t('login_required') || 'Login Required';
    if (challenge.status === 'upcoming') return t("challenge_not_started");
    return t('join_challenge') || 'Join Challenge';
  };

  const canJoin = challenge.type === 'realtime' ||
                  (challenge.type === 'classic' && isLoggedIn && challenge.status === 'active');
                  
  const isDisabled = !canJoin || (challenge.type === 'classic' && isCompleted);

  return (
    <div className="next-challenge-widget">
      <div className="challenge-info">
        {challenge.type === 'realtime' && challenge.isNext ?
          <h3>{t('next_challenge')}{challenge.name ? `: "${challenge.name}"` : ''}</h3> :
          <h3>{challenge.name || 'Unnamed Challenge'}</h3>
        }
        <span className="session-code">#{challenge.sessionCode}</span>
      </div>

      <div className="challenge-details">
        {challenge.type === 'classic' ? (
          <>
            <div className="start-time">
              <strong>{formatChallengeStatus(challenge.startDate, challenge.endDate, challenge.status)}</strong>
            </div>
            <div className="challenge-meta">
              <div className="meta-item">
                <strong>{t("challenge_duration")}:</strong> {Math.floor(challenge.totalDuration / 60)}m {challenge.totalDuration % 60}s
              </div>
              {/*<div className="meta-item">
                <strong>Start:</strong> {new Date(challenge.startDate).toLocaleString()}
              </div>
              <div className="meta-item">
                <strong>End:</strong> {new Date(challenge.endDate).toLocaleString()}
              </div>*/}
            </div>
          </>
        ) : (
          <>
            <div className="start-time">
              <strong>{challenge.startTime}</strong>
            </div>
            <div className="scheduled-time">
              {t('scheduled_for')}: {formatTimeUntil(challenge.startTime)}
            </div>
          </>
        )}
      </div>

      {challenge.type === 'classic' && isDisabled ? (
        <a
          className="see-results-btn"
          href={`/challenge-results/${challenge.id}`}
        >
          {t("see_results") || 'See Results'}
        </a>
      ) : (<button
        className="join-challenge-btn"
        onClick={handleJoinChallenge}
        disabled={isDisabled}
      >
        {getJoinButtonText()}
      </button>)}

      {allowDeletion && userIsAdmin && <button
        className="delete-challenge-btn"
        onClick={() => handleDeleteChallenge(challenge.sessionCode)}
      >
        {t('delete_challenge')}
      </button>}
    </div>
  );
}
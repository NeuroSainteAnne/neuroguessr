import { useApp } from '../context/AppContext';
import { formatTime } from '../utils/formatters';
import { consoleLog } from '../utils/logging';
import './SingleClassicChallenge.css';
import { useEffect, useState } from 'react';

interface ClassicChallenge {
  id: number;
  sessionCode: string;
  name?: string;
  startDate: string;
  endDate: string;
  public: boolean;
  creator: string;
  atlas: string;
  totalDuration: number;
  status: 'upcoming' | 'active' | 'ended';
  createdAt: string;
}

export function SingleClassicChallenge({
  challenge, allowDeletion, callbackAfterDeletion, callbackDeletionFailed,
}: {
  challenge: ClassicChallenge;
  allowDeletion?: boolean;
  callbackAfterDeletion?: () => void;
  callbackDeletionFailed?: (err: string) => void;
}) {
  const {
    t, authToken, userIsAdmin, isLoggedIn
  } = useApp();
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [checkingCompletion, setCheckingCompletion] = useState<boolean>(true);

  useEffect(() => {
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
  }, [isLoggedIn, authToken, challenge.id, challenge.sessionCode]);

  const formatTimeUntil = (startTime: string) => {
    const now = new Date();
    const start = new Date(startTime);
    const diff = start.getTime() - now.getTime();
    
    if (diff <= 0) return t('already_started');
    return `${formatTime({ms:diff, showSeconds:false})}`
  };

  const formatChallengeStatus = (startDate: string, endDate: string) => {
    if (challenge.status === 'upcoming') {
      return `${t("starts_in")} ${formatTimeUntil(startDate)}`;
    } else if (challenge.status === 'ended') {
      return `${t("ended")}`;   
    } else {
      return `${t("ends_in")} ${formatTimeUntil(endDate)}`;
    }
  };

  const handleJoinClassicChallenge = () => {
    if (!isLoggedIn) {
      // This should be handled by the parent component
      return;
    }
    if (challenge.sessionCode) {
      window.location.href = `/multiplayer/${challenge.sessionCode}`;
    }
  };

  const handleDeleteClassicChallenge = async (sessionCode: string) => {
    if (!allowDeletion || !authToken || !userIsAdmin) return;
    if (!window.confirm(t('confirm_delete_challenge') || 'Are you sure you want to delete this challenge?')) {
      return;
    }

    try {
      const response = await fetch(`/api/classic-challenges/${sessionCode}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      consoleLog("verbose", `Classic challenge ${sessionCode} deleted`);
      if (callbackAfterDeletion) callbackAfterDeletion();
    } catch (err) {
      console.error('Error deleting classic challenge:', err);
      if (callbackDeletionFailed) callbackDeletionFailed(t('error_deleting_challenge'));
    }
  };

  const canJoin = isLoggedIn && challenge.status === 'active';

  return (
    <div className="next-challenge-widget">
      <div className="challenge-info">
        <h3>{challenge.name || 'Unnamed Challenge'}</h3>
        <span className="session-code">#{challenge.sessionCode}</span>
      </div>

      <div className="challenge-details">
        <div className="start-time">
          <strong>{formatChallengeStatus(challenge.startDate, challenge.endDate)}</strong>
        </div>
        <div className="challenge-meta">
          <div className="meta-item">
            <strong>Duration:</strong> {Math.floor(challenge.totalDuration / 60)}m {challenge.totalDuration % 60}s
          </div>
          <div className="meta-item">
            <strong>Start:</strong> {new Date(challenge.startDate).toLocaleString()}
          </div>
          <div className="meta-item">
            <strong>End:</strong> {new Date(challenge.endDate).toLocaleString()}
          </div>
        </div>
      </div>

      <button
        className="join-challenge-btn"
        onClick={handleJoinClassicChallenge}
        disabled={!canJoin || isCompleted}
      >
        {checkingCompletion ? 'Checking...' :
         isCompleted ? 'Completed' :
         !isLoggedIn ? (t('login_required') || 'Login Required') :
         challenge.status === 'upcoming' ? 'Not Started' :
         challenge.status === 'ended' ? 'Ended' :
         (t('join_challenge') || 'Join Challenge')}
      </button>

      {allowDeletion && userIsAdmin && <button
        className="delete-challenge-btn"
        onClick={() => handleDeleteClassicChallenge(challenge.sessionCode)}
      >
        {t('delete_challenge')}
      </button>}
    </div>
  );
}
import { useApp } from '../context/AppContext';
import { consoleLog } from '../utils/logging';
import './SingleRTChallenge.css';

export function SingleRTChallenge({
  isNext, sessionCode, startTime, name, scheduledTime, allowDeletion, callbackAfterDeletion, callbackDeletionFailed,
}: {
  isNext?: boolean; sessionCode: string; startTime: string; name?: string | undefined; scheduledTime: string;
  allowDeletion?: boolean; callbackAfterDeletion?: () => void; callbackDeletionFailed?: (err: string) => void;
}) {
  const {
    t, authToken, userIsAdmin
  } = useApp();

  const handleJoinRTChallenge = () => {
    if (sessionCode) {
      window.location.href = `/multiplayer/${sessionCode}`;
    }
  };

  const handleDeleteRTChallenge = async (sessionCode: string) => {
    if (!allowDeletion || !authToken || !userIsAdmin) return;
    if (!window.confirm(t('confirm_delete_challenge') || 'Are you sure you want to delete this challenge?')) {
      return;
    }

    try {
      const response = await fetch(`/api/realtime-challenges/${sessionCode}`, {
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
      consoleLog("verbose", `Realtime challenge ${sessionCode} deleted`);
      if (callbackAfterDeletion) callbackAfterDeletion();
    } catch (err) {
      console.error('Error deleting realtime challenge:', err);
      if (callbackDeletionFailed) callbackDeletionFailed(t('error_deleting_challenge'));
    }
  };

  return (
    <div className="next-challenge-widget">
      <div className="challenge-info">
        {isNext ? <h3>{t('next_challenge')}{name ? `: "${name}"` : ''}</h3> : (name ? <h3>{`"${name}"`}</h3> : null)}
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
        onClick={handleJoinRTChallenge}
      >
        {t('join_challenge')}
      </button>

      {allowDeletion && userIsAdmin && <button
        className="delete-challenge-btn"
        onClick={() => handleDeleteRTChallenge(sessionCode)}
      >
        {t('delete_challenge')}
      </button>}
    </div>
  );
}

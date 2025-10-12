import { useEffect, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { SingleChallenge } from '../../../components/SingleChallenge';
import './ChallengesPage.css';
import GameSelector from '../GameSelector';
import SearchBar from '../../../components/SearchBar';
import { consoleLog } from '../../../utils/logging';
import { Challenge } from '../../../types/types';
import { formatTime } from '../../../utils/formatters';

export function Page() {
  const { t, authToken, isLoggedIn, userIsAdmin, atlasRegions, refreshNextChallenge } = useApp();
  const [publicChallenges, setPublicChallenges] = useState<Challenge[]>([]);
  const [privateChallenges, setPrivateChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChallenges = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/realtime-challenges', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(isLoggedIn && authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      consoleLog("verbose", "Fetched challenges");
      setPublicChallenges(data.challenges.filter((challenge: Challenge) => challenge.isPublic));
      setPrivateChallenges(data.challenges.filter((challenge: Challenge) => !challenge.isPublic));
    } catch (err) {
      console.error('Error fetching challenges:', err);
      setError(t('error_loading_challenges') || 'Failed to load challenges');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChallenges();
    
    // Refresh challenges every 30 seconds
    const interval = setInterval(fetchChallenges, 30000);
    
    return () => clearInterval(interval);
  }, [authToken, isLoggedIn]);

  const formatTimeUntilStart = (startTime: string) => {
    const now = new Date();
    const start = new Date(startTime);
    const diff = start.getTime() - now.getTime();
    
    if (diff <= 0) return t('already_started');
    return `${t('starts_in')} ${formatTime({ms:diff, showSeconds:false})}`
  };

  const formatDateTime = (dateTime: string) => {
    const date = new Date(dateTime);
    return date.toLocaleString();
  };

  const handleDeletionError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleAfterDeletion = () => {
    fetchChallenges();
    refreshNextChallenge();
  };

  const title = t('all_challenges') || 'All Challenges';

  return (
    <>
      <title>{title}</title>
      {atlasRegions.length > 0 && <SearchBar />}
      <GameSelector />
      <div className="challenges-page">
        <div className="challenges-header">
          <h1>{title}</h1>
          <button 
            className="refresh-btn"
            onClick={fetchChallenges}
            disabled={loading}
          >
            <i className="fas fa-sync-alt"></i>
            {loading ? (t('loading') || 'Loading...') : (t('refresh') || 'Refresh')}
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Public Challenges */}
            <section className="challenges-section">
              <h2>{t('public_challenges') || 'Public Challenges'}</h2>
              {publicChallenges.length === 0 ? (
                <div className="no-challenges">
                  {t('no_public_challenges') || 'No public challenges available'}
                </div>
              ) : (
                <div>
                  {publicChallenges.map((challenge) => (
                    <SingleChallenge
                      key={challenge.sessionCode}
                      sessionCode={challenge.sessionCode}
                      startTime={formatTimeUntilStart(challenge.startTime)}
                      scheduledTime={formatDateTime(challenge.startTime)}
                      name={challenge.name || undefined}
                      allowDeletion={userIsAdmin}
                      callbackAfterDeletion={handleAfterDeletion}
                      callbackDeletionFailed={handleDeletionError}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Private Challenges (Admin only) */}
            {userIsAdmin && (
              <section className="challenges-section">
                <h2>{t('private_challenges') || 'Private Challenges'}</h2>
                {privateChallenges.length === 0 ? (
                  <div className="no-challenges">
                    {t('no_private_challenges') || 'No private challenges available'}
                  </div>
                ) : (
                  <div className="challenges-grid">
                    {privateChallenges.map((challenge) => (
                      <SingleChallenge
                        key={challenge.sessionCode}
                        sessionCode={challenge.sessionCode}
                        startTime={formatTimeUntilStart(challenge.startTime)}
                        scheduledTime={formatDateTime(challenge.startTime)}
                        name={challenge.name || undefined}
                        allowDeletion={userIsAdmin}
                        callbackAfterDeletion={fetchChallenges}
                        callbackDeletionFailed={handleDeletionError}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {loading && (
          <div className="loading-spinner">
            <i className="fas fa-spinner fa-spin"></i>
            {t('loading_challenges') || 'Loading challenges...'}
          </div>
        )}
      </div>
    </>
  );
}

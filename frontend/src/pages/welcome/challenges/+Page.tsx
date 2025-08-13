import React, { useEffect, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { SingleChallenge } from '../../../components/NextChallenge';
import './ChallengesPage.css';
import GameSelector from '../GameSelector';
import SearchBar from '../../../components/SearchBar';

interface Challenge {
  sessionCode: string;
  startTime: string;
  isPublic: boolean;
  createdBy?: string;
}

export function Page() {
  const { t, authToken, isLoggedIn, userIsAdmin, atlasRegions } = useApp();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChallenges = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/challenges', {
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
      setChallenges(data.challenges || []);
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
    
    if (diff <= 0) return t('starting_now') || 'Starting now';
    
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    
    return `${t('starts_in') || 'Starts in'} ${parts.join(' ')}`;
  };

  const formatDateTime = (dateTime: string) => {
    const date = new Date(dateTime);
    return date.toLocaleString();
  };

  const handleDeletionError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const publicChallenges = challenges.filter(challenge => challenge.isPublic);
  const privateChallenges = challenges.filter(challenge => !challenge.isPublic);

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
                      allowDeletion={userIsAdmin}
                      callbackAfterDeletion={fetchChallenges}
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

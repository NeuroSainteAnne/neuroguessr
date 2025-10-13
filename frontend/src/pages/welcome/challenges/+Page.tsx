import { useEffect, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { SingleRTChallenge } from '../../../components/SingleRTChallenge';
import { SingleClassicChallenge } from '../../../components/SingleClassicChallenge';
import './ChallengesPage.css';
import GameSelector from '../GameSelector';
import SearchBar from '../../../components/SearchBar';
import { consoleLog } from '../../../utils/logging';
import { Challenge } from '../../../types/types';
import { formatTime } from '../../../utils/formatters';

interface ClassicChallenge {
  id: number;
  sessionCode: string;
  name?: string;
  startDate: string;
  endDate: string;
  creator: string;
  atlas: string;
  totalDuration: number;
  status: 'upcoming' | 'active' | 'ended';
  createdAt: string;
}

export function Page() {
  const { t, authToken, isLoggedIn, userIsAdmin, atlasRegions, refreshNextChallenge } = useApp();
  const [publicChallenges, setPublicChallenges] = useState<Challenge[]>([]);
  const [privateChallenges, setPrivateChallenges] = useState<Challenge[]>([]);
  const [classicChallenges, setClassicChallenges] = useState<ClassicChallenge[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChallenges = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch real-time challenges
      const rtResponse = await fetch('/api/realtime-challenges', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(isLoggedIn && authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
      });

      if (!rtResponse.ok) {
        throw new Error(`HTTP error! status: ${rtResponse.status}`);
      }

      const rtData = await rtResponse.json();
      consoleLog("verbose", "Fetched real-time challenges");
      setPublicChallenges(rtData.challenges.filter((challenge: Challenge) => challenge.isPublic));
      setPrivateChallenges(rtData.challenges.filter((challenge: Challenge) => !challenge.isPublic));

      // Fetch classic challenges
      const ccResponse = await fetch('/api/classic-challenges', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(isLoggedIn && authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
      });

      if (ccResponse.ok) {
        const ccData = await ccResponse.json();
        consoleLog("verbose", "Fetched classic challenges");
        setClassicChallenges(ccData.challenges || []);
      } else {
        consoleLog("verbose", "Failed to fetch classic challenges");
        setClassicChallenges([]);
      }

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
            {/* Classic Challenges */}
            <section className="challenges-section">
              <h2>{t('classic_challenges') || 'Classic Challenges'}</h2>
              {classicChallenges.length === 0 ? (
                <div className="no-challenges">
                  {t('no_challenges') || 'No challenges available'}
                </div>
              ) : (
                <div className="challenges-grid">
                  {classicChallenges.map((challenge) => (
                    <SingleClassicChallenge
                      key={challenge.id}
                      challenge={challenge}
                      allowDeletion={userIsAdmin}
                      callbackAfterDeletion={handleAfterDeletion}
                      callbackDeletionFailed={handleDeletionError}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Real-time Challenges */}
            <section className="challenges-section">
              <h2>{t('realtime_challenges') || 'Real-time Challenges'}</h2>
              {publicChallenges.length === 0 ? (
                <div className="no-challenges">
                  {t('no_challenges') || 'No challenges available'}
                </div>
              ) : (
                <div>
                  {publicChallenges.map((challenge) => (
                    <SingleRTChallenge
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

            {/* Private Real-time Challenges (Admin only) */}
            {userIsAdmin && (
              <section className="challenges-section">
                <h2>{t('private_realtime_challenges') || 'Private Real-time Challenges'}</h2>
                {privateChallenges.length === 0 ? (
                  <div className="no-challenges">
                    {t('no_challenges') || 'No challenges available'}
                  </div>
                ) : (
                  <div className="challenges-grid">
                    {privateChallenges.map((challenge) => (
                      <SingleRTChallenge
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

import { useEffect, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { SingleRTChallenge } from '../../../components/SingleRTChallenge';
import './ChallengesPage.css';
import GameSelector from '../GameSelector';
import SearchBar from '../../../components/SearchBar';
import { consoleLog } from '../../../utils/logging';
import { Challenge } from '../../../types/types';
import { formatTime } from '../../../utils/formatters';
import { navigate } from 'vike/client/router';

interface ClassicChallenge {
  id: number;
  name: string;
  description?: string;
  atlas: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
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
      const ccResponse = await fetch('/api/classic-challenges/active', {
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

  const formatChallengeStatus = (startDate: string, endDate: string) => {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (now < start) {
      return `Starts ${formatTime({ms: start.getTime() - now.getTime(), showSeconds: false})}`;
    } else if (now > end) {
      return 'Ended';
    } else {
      return `Ends ${formatTime({ms: end.getTime() - now.getTime(), showSeconds: false})}`;
    }
  };

  const handleDeletionError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleAfterDeletion = () => {
    fetchChallenges();
    refreshNextChallenge();
  };

  const handleJoinClassicChallenge = async (challengeId: number) => {
    if (!authToken) {
      setError('Please log in to join challenges');
      return;
    }

    try {
      // Check if user can join this challenge
      const response = await fetch(`/api/classic-challenges/${challengeId}/can-join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.message || 'Cannot join this challenge');
        return;
      }

      // Start the game with this classic challenge
      navigate(`/singleplayer?classicChallengeId=${challengeId}`);
    } catch (err) {
      console.error('Error joining classic challenge:', err);
      setError('Failed to join challenge');
    }
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
              {userIsAdmin && (
                <div style={{ marginBottom: '15px' }}>
                  <button
                    onClick={() => navigate('/welcome/classic-challenges')}
                    style={{
                      backgroundColor: '#ff6b35',
                      color: 'white',
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    + Create Classic Challenge
                  </button>
                </div>
              )}
              {classicChallenges.length === 0 ? (
                <div className="no-challenges">
                  {t('no_classic_challenges') || 'No classic challenges available'}
                </div>
              ) : (
                <div className="classic-challenges-grid">
                  {classicChallenges.map((challenge) => (
                    <div key={challenge.id} className="classic-challenge-card">
                      <div className="challenge-card-header">
                        <h3>{challenge.name}</h3>
                        <div className="challenge-status">
                          {formatChallengeStatus(challenge.start_date, challenge.end_date)}
                        </div>
                      </div>
                      {challenge.description && (
                        <p className="challenge-description">{challenge.description}</p>
                      )}
                      <div className="challenge-details">
                        <div className="detail-item">
                          <strong>Atlas:</strong> {challenge.atlas}
                        </div>
                        <div className="detail-item">
                          <strong>Period:</strong> {new Date(challenge.start_date).toLocaleDateString()} - {new Date(challenge.end_date).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="challenge-actions">
                        <button
                          className="join-challenge-btn"
                          onClick={() => handleJoinClassicChallenge(challenge.id)}
                          disabled={!challenge.is_active || new Date() < new Date(challenge.start_date) || new Date() > new Date(challenge.end_date)}
                        >
                          {new Date() < new Date(challenge.start_date) ? 'Not Started' : 
                           new Date() > new Date(challenge.end_date) ? 'Ended' : 
                           'Join Challenge'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Real-time Challenges */}
            <section className="challenges-section">
              <h2>{t('realtime_challenges') || 'Real-time Challenges'}</h2>
              {publicChallenges.length === 0 ? (
                <div className="no-challenges">
                  {t('no_public_challenges') || 'No public real-time challenges available'}
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
                    {t('no_private_challenges') || 'No private real-time challenges available'}
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

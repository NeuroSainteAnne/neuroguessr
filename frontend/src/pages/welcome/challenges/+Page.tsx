import { useEffect, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { SingleChallenge } from '../../../components/SingleChallenge';
import './ChallengesPage.css';
import GameSelector from '../GameSelector';
import SearchBar from '../../../components/SearchBar';
import { consoleLog } from '../../../utils/logging';
import { ClassicChallenge, RTChallenge } from '../../../types/types';
import News from '../../../components/News';

export function Page() {
  const { t, authToken, isLoggedIn, userIsAdmin, atlasRegions, refreshNextChallenge } = useApp();
  const [realtimeChallenges, setRealtimeChallenges] = useState<RTChallenge[]>([]);
  const [classicChallenges, setClassicChallenges] = useState<ClassicChallenge[]>([]);
  const [pastChallenges, setPastChallenges] = useState<any[]>([]);
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
      setRealtimeChallenges(rtData.challenges);

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

      // Fetch past challenges
      const pcResponse = await fetch('/api/past-challenges', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(isLoggedIn && authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
      });

      if (pcResponse.ok) {
        const pcData = await pcResponse.json();
        consoleLog("verbose", "Fetched past challenges");
        setPastChallenges(pcData.challenges || []);
      } else {
        consoleLog("verbose", "Failed to fetch past challenges");
        setPastChallenges([]);
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
      <News />
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
                <div className="challenges-flex">
                  {classicChallenges.map((challenge) => (
                    <SingleChallenge
                      key={challenge.id}
                      challenge={{
                        ...challenge,
                        type: 'classic'
                      }}
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
              {realtimeChallenges.length === 0 ? (
                <div className="no-challenges">
                  {t('no_challenges') || 'No challenges available'}
                </div>
              ) : (
                <div>
                  {realtimeChallenges.map((challenge) => (
                    <SingleChallenge
                      key={challenge.sessionCode}
                      challenge={{
                        ...challenge,
                        type: 'realtime'
                      }}
                      allowDeletion={userIsAdmin}
                      callbackAfterDeletion={handleAfterDeletion}
                      callbackDeletionFailed={handleDeletionError}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Past Challenges */}
            {isLoggedIn && (<section className="challenges-section">
              <h2>{t('past_challenges') || 'Past Challenges'}</h2>
              {pastChallenges.length === 0 ? (
                <div className="no-challenges">
                  {t('no_past_challenges') || 'No past challenges available'}
                </div>
              ) : (
                <div className="challenges-grid">
                  {pastChallenges.map((challenge) => (
                    <div key={challenge.id} className="past-challenge-card">
                      <h3>{challenge.name}</h3>
                      <p><strong>{t('start_date') || 'Start Date'}:</strong> {new Date(challenge.startDate).toLocaleString()}</p>
                      <p><strong>{t('end_date') || 'End Date'}:</strong> {new Date(challenge.endDate).toLocaleString()}</p>
                      {challenge.userScore !== null && (
                        <>
                          <p><strong>{t('your_score') || 'Your Score'}:</strong> {parseInt(challenge.userScore)}{challenge.theoreticalMaximumScore ? ` / ${parseInt(challenge.theoreticalMaximumScore)}` : ''}</p>
                          <p><strong>{t('your_ranking') || 'Your Ranking'}:</strong> {challenge.userRanking == 1 ? "🏆 " : challenge.userRanking == 2 ? "🥈 " : challenge.userRanking == 3 ? "🥉 " : ""}#{challenge.userRanking} / {challenge.participantCount}</p>
                        </>
                      )}
                      <a href={`/challenge-results/${challenge.id}`} className="view-results-btn">
                        {t('view_results') || 'View Results'}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </section>)}
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

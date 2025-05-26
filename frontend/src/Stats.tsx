import { useEffect, useState } from 'react';
import './Stats.css';
import type { TFunction } from 'i18next';

// Define a type for the best score data
interface BestScore {
    mode: string;
    atlas: string;
    score: number;
    accuracy: number;
    duration: number; // Assuming duration is in seconds or milliseconds, adjust as needed
}

// Define the structure for grouped scores
interface GroupedScores {
    [mode: string]: {
        [atlas: string]: BestScore;
    };
}

function Stats({ t, callback, authToken }:
    { t: TFunction<"translation", undefined>, callback: AppCallback, authToken: string }) {

    const [bestScores, setBestScores] = useState<GroupedScores>({});
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchBestScores = async () => {
            if (!authToken) {
                setError(t('not_logged_in_error'));
                setLoading(false);
                return;
            }

            try {
                // Replace with your actual API endpoint to fetch best scores
                const response = await fetch('/api/user/best-scores', {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data: BestScore[] = await response.json();

                // Group the scores by mode and then by atlas
                const grouped: GroupedScores = {};
                data.forEach(score => {
                    if (!grouped[score.mode]) {
                        grouped[score.mode] = {};
                    }
                    grouped[score.mode][score.atlas] = score;
                });
                setBestScores(grouped);

            } catch (e: any) {
                console.error("Failed to fetch best scores:", e);
                setError(t('error_fetching_stats') + e.message);
            } finally {
                setLoading(false);
            }
        };

        fetchBestScores();
    }, [authToken, t]);

    if (loading) {
        return <div className="stats-container">{t('loading_stats')}</div>;
    }

    if (error) {
        return <div className="stats-container stats-error">{error}</div>;
    }

    // Check if there are any scores to display
    if (Object.keys(bestScores).length === 0) {
        return <div className="stats-container">{t('no_stats_yet')}</div>;
    }

    return (
        <div className="stats-container">
            <h1>{t('your_best_scores')}</h1>
            {Object.entries(bestScores).map(([mode, atlases]) => (
                <div key={mode} className="stats-mode-section">
                    <h2>{t(`mode_${mode}`)}</h2> {/* Translate mode names */}
                    {Object.entries(atlases).map(([atlas, score]) => (
                        <div key={`${mode}-${atlas}`} className="stats-item">
                            <h3>{t(`atlas_${atlas}`)}</h3> {/* Translate atlas names */}
                            <p>{t('score')}: **{score.score}**</p>
                            {/* Conditional rendering based on mode */}
                            {mode !== 'streak' && (
                                <>
                                    <p>{t('accuracy')}: **{(score.accuracy * 100).toFixed(2)}%**</p>
                                    <p>{t('duration')}: **{score.duration}** {t('seconds')}</p> {/* Adjust unit as per your data */}
                                </>
                            )}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

export default Stats;
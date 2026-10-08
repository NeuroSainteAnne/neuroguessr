import { useState, useEffect } from 'react';
import { Tabs, Tab } from '../../components/Tabs';
import { LineChart, BarChart, PieChart } from '../../components/Charts';
import { StatCard, MetricRow, FavoriteItem, StatItem, GameIcon, TrophyIcon, CheckIcon, TargetIcon, getModeIcon, getAtlasIcon } from '../../components/StatsComponents';
import { formatTime, formatDate } from '../../utils/formatters';
import './Stats.css';
import { useApp } from '../../context/AppContext';
import atlasFiles from '../../utils/atlas_files';

enum GameMode {
  STREAK = 'streak',
  TIME_ATTACK = 'time-attack',
  MULTIPLAYER = 'multiplayer'
}

// Stats types for individual session records
interface Session {
  id: number;
  createdAt: number; // Unix timestamp
  mode: GameMode;
  atlas: string;
  score: number;
  correct: number;
  incorrect: number;
  duration: number; // in seconds
  quitReason?: string;
  blindMode?: boolean;
  multiplayerClassicChallengeId?: number | null;
}

// Mode-specific stats
interface ModeStats {
  games: number;
  bestScore: number;
  avgScore: number;
  avgDuration: number;
  progression: {
    date: string;
    score: number;
    timestamp: number;
  }[];
}

// Complete stats structure
interface UserStats {
  totalGames: number;
  bestScore: number;
  totalCorrect: number;
  totalIncorrect: number;
  avgTimePerRegion: number;
  avgTimePerCorrectRegion: number;
  avgDuration: number;
  firstGame: number | null; // Unix timestamp
  lastGame: number | null; // Unix timestamp
  mostPlayedMode: string;
  mostPlayedAtlas: string;
  quitReasons: Record<string, number>;
  perMode: {
    streak?: ModeStats;
    'time-attack'?: ModeStats;
    multiplayer?: ModeStats;
    [key: string]: ModeStats | undefined;
  };
  sessions: Session[];
  // Add blind mode related stats
  blindModeGames?: number;
  blindModePercentage?: number;
  blindModeBestScore?: number;
  blindModeAvgScore?: number;
}

type DateRangeOption = {
  value: string;
  label: string;
  getRange: () => { startDate: Date; endDate: Date };
};

export function Page() {
  const { t, showNotification, authToken, isLoggedIn } = useApp();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UserStats | null>(null);  const [historyModeFilter, setHistoryModeFilter] = useState<'' | GameMode>('');
  const [historyBlindModeFilter, setHistoryBlindModeFilter] = useState<boolean | null>(null);
  const [selectedDateRange, setSelectedDateRange] = useState<string>('30days');
  const [historyDateRange, setHistoryDateRange] = useState<{startDate: Date, endDate: Date}>(() => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 365); // 1 year back
    return {
      startDate,
      endDate
    };
  });
  const [filteredSessions, setFilteredSessions] = useState<Session[]>([]); 

  // Then in your component, add this before the return statement:
  const dateRangeOptions: DateRangeOption[] = [
    {
      value: '7days',
      label: t('last_week'),
      getRange: () => ({
        startDate: new Date(new Date().setDate(new Date().getDate() - 7)),
        endDate: new Date()
      })
    },
    {
      value: '30days',
      label: t('last_month'),
      getRange: () => ({
        startDate: new Date(new Date().setDate(new Date().getDate() - 30)),
        endDate: new Date()
      })
    },
    {
      value: '90days',
      label: t('last_3_months'),
      getRange: () => ({
        startDate: new Date(new Date().setDate(new Date().getDate() - 90)),
        endDate: new Date()
      })
    },
    {
      value: '365days',
      label: t('last_year'),
      getRange: () => ({
        startDate: new Date(new Date().setDate(new Date().getDate() - 365)),
        endDate: new Date()
      })
    },
    {
      value: 'all',
      label: t('all_time'),
      getRange: () => ({
        startDate: new Date(0), // January 1, 1970
        endDate: new Date()
      })
    }
  ];

  useEffect(() => {
    const option = dateRangeOptions.find(opt => opt.value === selectedDateRange);
    if (option) {
      const { startDate, endDate } = option.getRange();
      setHistoryDateRange({
        startDate,
        endDate
      });
    }
  }, [selectedDateRange]);
  
  // Fetch stats data
  useEffect(() => {
    const fetchStats = async () => {
      try {
        if (!isLoggedIn) {
          return;
        }
        setLoading(true);
        const response = await fetch('/api/get-stats', {
          method: 'POST',
          headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          }
        });
        
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
          const data = await response.json() as UserStats;
        
        // Calculate blind mode statistics
        if (data.sessions && data.sessions.length > 0) {
          const blindModeSessions = data.sessions.filter(session => session.blindMode);
          data.blindModeGames = blindModeSessions.length;
          data.blindModePercentage = (blindModeSessions.length / data.sessions.length) * 100;
          
          if (blindModeSessions.length > 0) {
            data.blindModeBestScore = Math.max(...blindModeSessions.map(s => s.score));
            data.blindModeAvgScore = blindModeSessions.reduce((sum, s) => sum + s.score, 0) / blindModeSessions.length;
          } else {
            data.blindModeBestScore = 0;
            data.blindModeAvgScore = 0;
          }
        }
        
        setStats(data);
      } catch (err) {
        showNotification(t('error_loading_stats'), false);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [t]);

  useEffect(() => {
    if (stats && stats.sessions) {
      setFilteredSessions(getFilteredSessions());
    }
  }, [historyModeFilter, historyBlindModeFilter, historyDateRange, stats]);
  
  // Filter sessions based on selected mode and date range
  const getFilteredSessions = (): Session[] => {
    if (!stats || !stats.sessions || !Array.isArray(stats.sessions)) {
      return [];
    }

    return stats.sessions.filter(session => {
      // Filter out sessions with score of 0
      if (session.score === 0) return false;

      // Convert session timestamp to Date object
      const sessionDate = new Date(session.createdAt);
      
      // Apply mode filter if selected
      const modeMatches = !historyModeFilter || session.mode === historyModeFilter;
      
      // Apply blind mode filter if selected
      const blindModeMatches = historyBlindModeFilter === null || session.blindMode === historyBlindModeFilter;
      
      // Apply date range filter
      const isAfterStartDate = historyDateRange.startDate ? sessionDate >= historyDateRange.startDate : true;
      const isBeforeEndDate = historyDateRange.endDate ? sessionDate <= historyDateRange.endDate : true;
      
      return modeMatches && blindModeMatches && isAfterStartDate && isBeforeEndDate;
    }).sort((a, b) => b.createdAt - a.createdAt); // Sort by date, newest first
  };

  
  // Generate data for the sessions progression chart
  const getAllSessionsProgression = () => {
    if (!stats || !stats.sessions || !Array.isArray(stats.sessions)) {
      return [];
    }
    
    // Filter out sessions with score of 0, then sort by creation date
    const sortedSessions = [...stats.sessions]
      .filter(session => session.score > 0)
      .sort((a, b) => a.createdAt - b.createdAt);
    return sortedSessions.map(session => ({
      date: formatDate(session.createdAt, 'MMM d'),
      score: session.score,
      timestamp: session.createdAt
    }));
  };

  // Generate data for monthly activity chart
  const getActivityByMonth = () => {
    if (!stats || !stats.sessions || !Array.isArray(stats.sessions)) {
      return [];
    }
    
    // Group sessions by month
    const monthlyGroups: Record<string, number> = {};
    
    stats.sessions
      .filter(session => session.score > 0)
      .forEach(session => {
        const date = new Date(session.createdAt);
        const monthKey = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
        monthlyGroups[monthKey] = (monthlyGroups[monthKey] || 0) + 1;
    });
    
    // Convert to array format for chart
    return Object.entries(monthlyGroups).map(([month, games]) => ({
      month,
      games
    }));
  };
  // Generate data for blind mode distribution
  const getBlindModeDistribution = () => {
    if (!stats || !stats.sessions || !Array.isArray(stats.sessions)) {
      return [];
    }
    
    const blindCount = stats.sessions.filter(session => session.blindMode).length;
    const normalCount = stats.sessions.filter(session => !session.blindMode).length;
    
    return [
      { name: t('blind_mode'), value: blindCount },
      { name: t('normal_mode'), value: normalCount }
    ];
  };
  
  // Generate comparison data for blind mode vs normal mode
  const getBlindModeComparison = () => {
    if (!stats || !stats.sessions || !Array.isArray(stats.sessions)) {
      return [];
    }
    
    // Filter out sessions with score of 0
    const validSessions = stats.sessions.filter(session => session.score > 0);
    
    // Group by mode and calculate average scores
    const blindModeSessions = validSessions.filter(session => session.blindMode);
    const normalModeSessions = validSessions.filter(session => !session.blindMode);
    
    const blindModeAvg = blindModeSessions.length > 0 
      ? blindModeSessions.reduce((sum, s) => sum + s.score, 0) / blindModeSessions.length 
      : 0;
      
    const normalModeAvg = normalModeSessions.length > 0 
      ? normalModeSessions.reduce((sum, s) => sum + s.score, 0) / normalModeSessions.length 
      : 0;
    
    return [
      { name: t('blind_mode'), value: blindModeAvg },
      { name: t('normal_mode'), value: normalModeAvg }
    ];
  };

  // Hide blind mode section if no blind mode games have been played
  const showBlindModeSection = (stats?.blindModeGames || 0) > 0;

  if (!isLoggedIn) {
    return <div className="stats-please-connect" dangerouslySetInnerHTML={{__html:t('stats_unavailable_login')}}></div>;
  } else if (loading) {
    return <div className="stats-loading">{t('loading_stats')}</div>;
  } else if (!stats) {
    return <div className="stats-empty">{t('no_stats_available')}</div>;
  }
  
  const {
    totalGames,
    bestScore,
    totalCorrect,
    totalIncorrect,
    avgTimePerRegion,
    avgTimePerCorrectRegion,
    avgDuration,
    mostPlayedMode,
    mostPlayedAtlas,
    firstGame,
    lastGame,
    perMode
  } = stats;
  const modeOptions = [
    { value: 'streak', label: t('streak_mode') },
    { value: 'time-attack', label: t('time_attack_mode') },
    { value: 'multiplayer', label: t('multiplayer_mode') }
  ];

  const getAtlasName = (atlas: string): string => {
    return atlasFiles[atlas]?.name || t('unknown_atlas');
  }
  return (
    <div className="stats-page">
      <header className="stats-header">
        <h1>{t('your_statistics')}</h1>
        <p className="stats-period">
          {t('stats_from')} {formatDate(firstGame)} {t('to')} {formatDate(lastGame)}
        </p>
      </header>
      
      {/* Overview Section */}
      <section className="stats-overview">
        <div className="summary-cards">
          <StatCard 
            title={t('total_games')} 
            value={totalGames} 
            icon={<GameIcon />} 
          />
          <StatCard 
            title={t('best_score')} 
            value={bestScore} 
            icon={<TrophyIcon />} 
          />
          <StatCard 
            title={t('correct_answers')} 
            value={totalCorrect} 
            icon={<CheckIcon />} 
          />
          <StatCard 
            title={t('accuracy')} 
            value={`${((totalCorrect / (totalCorrect + totalIncorrect)) * 100).toFixed(1)}%`} 
            icon={<TargetIcon />} 
          />
        </div>
        
        <div className="performance-metrics">
          <h3>{t('performance_metrics')}</h3>
          <MetricRow label={t('avg_time_per_region')} value={formatTime({ms:avgTimePerRegion})} />
          <MetricRow label={t('avg_time_per_correct')} value={formatTime({ms:avgTimePerCorrectRegion})} />
          <MetricRow label={t('avg_session_duration')} value={formatTime({ms:avgDuration})} />
          <MetricRow label={t('blind_mode_games')} value={`${stats.blindModeGames || 0} (${(stats.blindModePercentage || 0).toFixed(1)}%)`} />
        </div>
        
        <div className="favorites">
          <h3>{t('your_favorites')}</h3>
          <FavoriteItem 
            type="mode" 
            value={t(mostPlayedMode+"_mode")} 
            icon={getModeIcon(mostPlayedMode)} 
          />
          <FavoriteItem 
            type="atlas" 
            value={getAtlasName(mostPlayedAtlas)} 
            icon={getAtlasIcon(mostPlayedAtlas)} 
          />
        </div>
      </section>
      
      {/* Charts Section */}
      <section className="performance-charts">
        <div className="chart-container">
          <h3>{t('score_progression')}</h3>
          <LineChart 
            data={getAllSessionsProgression()} 
            xKey="date" 
            yKey="score" 
            color="#4CAF50"
            tickColor="#BBB"
            axisTitleColor="#999"
          />
        </div>
        
        <div className="chart-container">
          <h3>{t('activity_over_time')}</h3>
          <BarChart 
            data={getActivityByMonth()} 
            xKey="month" 
            yKey="games" 
            color="#2196F3" 
            axisTitleColor="#999"
          />
        </div>
      </section>
      
      {/* Game Modes Tabs */}
      <section className="game-mode-details">
        <h2>{t('game_mode_details')}</h2>
        
        <Tabs defaultActiveKey="streak">
          <Tab eventKey="streak" title={t('streak_mode')}>
            <div className="mode-stats">
              <div className="stats-grid">
                <StatItem label={t('games_played')} value={perMode.streak?.games || 0} />
                <StatItem label={t('best_score')} value={perMode.streak?.bestScore || 0} />
                <StatItem label={t('avg_score')} value={perMode.streak?.avgScore.toFixed(1) || 0} />
                <StatItem label={t('avg_duration')} value={formatTime({ms:perMode.streak?.avgDuration || null})} />
              </div>
              
              <div className="mode-chart">
                <h4>{t('streak_progression')}</h4>
                <LineChart 
                  data={perMode.streak?.progression.map(item => ({
                      ...item,
                      date: formatDate(item.date, 'MMM d') // Format the date string
                    })) || []} 
                  xKey="date" 
                  yKey="score" 
                  color="#E91E63" 
                  tickColor="#BBB"
                  axisTitleColor="#999"
                />
              </div>
            </div>
          </Tab>
          
          <Tab eventKey="time-attack" title={t('time_attack_mode')}>
            <div className="mode-stats">
              <div className="stats-grid">
                <StatItem label={t('games_played')} value={perMode['time-attack']?.games || 0} />
                <StatItem label={t('best_score')} value={perMode['time-attack']?.bestScore || 0} />
                <StatItem label={t('avg_score')} value={perMode['time-attack']?.avgScore.toFixed(1) || 0} />
                <StatItem label={t('avg_duration')} value={formatTime({ms:perMode['time-attack']?.avgDuration || null})} />
              </div>
              
              <div className="mode-chart">
                <h4>{t('time_attack_progression')}</h4>
                <LineChart 
                  data={perMode['time-attack']?.progression.map(item => ({
                      ...item,
                      date: formatDate(item.date, 'MMM d') // Format the date string
                    })) || []} 
                  xKey="date" 
                  yKey="score" 
                  color="#FF9800" 
                />
              </div>
            </div>
          </Tab>
          
          <Tab eventKey="multiplayer" title={t('multiplayer_mode')}>
            <div className="mode-stats">
              <div className="stats-grid">
                <StatItem label={t('games_played')} value={perMode.multiplayer?.games || 0} />
                <StatItem label={t('best_score')} value={perMode.multiplayer?.bestScore || 0} />
                <StatItem label={t('avg_score')} value={perMode.multiplayer?.avgScore.toFixed(1) || 0} />
                <StatItem label={t('avg_duration')} value={formatTime({ms:perMode.multiplayer?.avgDuration || null})} />
              </div>
              
              <div className="mode-chart">
                <h4>{t('multiplayer_progression')}</h4>
                <LineChart 
                  data={perMode.multiplayer?.progression.map(item => ({
                      ...item,
                      date: formatDate(item.date, 'MMM d') // Format the date string
                    })) || []} 
                  xKey="date" 
                  yKey="score" 
                  color="#3F51B5" 
                />
              </div>
            </div>
          </Tab>
        </Tabs>      </section>
      
      {/* Blind Mode Section */}      
      {showBlindModeSection && (
      <section className="blind-mode-stats">
        <h2>{t('blind_mode_statistics')}</h2>
        <div className="stats-grid">
          <StatItem label={t('games_played')} value={stats.blindModeGames || 0} />
          <StatItem label={t('best_score')} value={stats.blindModeBestScore || 0} />
          <StatItem label={t('avg_score')} value={(stats.blindModeAvgScore || 0).toFixed(1)} />
          <StatItem label={t('score_multiplier')} value="1.5x" />
        </div>
        
        <div className="blind-mode-charts">
          <div className="chart-container">
            <h4>{t('blind_mode_distribution')}</h4>
            <PieChart 
              data={getBlindModeDistribution()} 
            />
          </div>
          
          <div className="chart-container">
            <h4>{t('score_comparison')}</h4>
            <BarChart 
              data={getBlindModeComparison().map(item => ({
                mode: item.name,
                score: Math.round(item.value)
              }))} 
              xKey="mode" 
              yKey="score" 
              color="#9C27B0" 
            />
          </div>
        </div>
      </section>
      )}
      
      {/* Session History */}
      <section className="session-history">
        <h2>{t('recent_sessions')}</h2>
        <div className="filter-controls">
          <div className="filter-select-stats">
            <label htmlFor="mode-filter">{t('mode')}</label>
            <select
              id="mode-filter"
              className="form-control"
              value={historyModeFilter}
              onChange={(e) => setHistoryModeFilter(e.target.value as GameMode)}
            >
              <option value="">{t('all_modes')}</option>
              {modeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          <div className="filter-select-stats">
            <label htmlFor="blind-mode-filter">{t('blind_mode')}</label>
            <select
              id="blind-mode-filter"
              className="form-control"
              value={historyBlindModeFilter === null ? "" : historyBlindModeFilter.toString()}
              onChange={(e) => {
                if (e.target.value === "") {
                  setHistoryBlindModeFilter(null);
                } else {
                  setHistoryBlindModeFilter(e.target.value === "true");
                }
              }}
            >
              <option value=""></option>
              <option value="true">{t('yes')}</option>
              <option value="false">{t('no')}</option>
            </select>
          </div>
          
          <div className="filter-select-stats">
            <label htmlFor="date-range-filter">{t('date_range')}</label>
            <select
              id="date-range-filter"
              className="form-control"
              value={selectedDateRange}
              onChange={(e) => setSelectedDateRange(e.target.value)}
            >
              {dateRangeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="sessions-table-container">
          <table className="sessions-table">
            <thead>
              <tr>
                <th>{t('date')}</th>
                <th>{t('mode')}</th>
                <th>{t('atlas')}</th>
                <th>{t('blind_mode')}</th>
                <th>{t('score')}</th>
                <th>{t('correct')}</th>
                <th>{t('incorrect')}</th>
                <th>{t('duration')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.length > 0 ? (
                filteredSessions.map(session => (
                  <tr key={session.id}>
                    <td>{formatDate(session.createdAt)}</td>
                    <td>{t(session.mode + '_mode')}</td>
                    <td>{getAtlasName(session.atlas)}</td>
                    <td>{session.blindMode ? t('yes') : t('no')}</td>
                    <td>{session.score}</td>
                    <td>{session.correct}</td>
                    <td>{session.incorrect}</td>
                    <td>{formatTime({ms:session.duration})}</td>
                    <td>
                      {session.mode === 'multiplayer' ? (
                        <a href={session.multiplayerClassicChallengeId
                          ? `/multiplayer/?replay_multi=${session.multiplayerClassicChallengeId}`
                          : `/multiplayer/?replay_session=${session.id}`}
                          className="review-link">
                          {t("review_button") || "Revoir"}
                        </a>
                      ) : (session.mode === 'streak' || session.mode === 'time-attack') && new Date(session.createdAt) >= new Date('2026-04-02') && (
                        <a href={`/singleplayer/${session.mode}/?replay_session=${session.id}`}
                          className="review-link">
                          {t("review_button") || "Revoir"}
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              ) : (                <tr>
                  <td colSpan={9} className="no-sessions">
                    <div className="no-data-message">
                      {t('no_matching_sessions')}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
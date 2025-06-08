import React, { useState, useEffect } from 'react';
import './Leaderboard.css';
import atlasFiles from '../utils/atlas_files';
import { useApp } from '../context/AppContext';

interface LeaderboardEntry {
  username: string;
  mode: string;
  best_score: number;
  atlas: string;
}

interface AtlasOption {
  value: string;
  label: string;
  count?: number; // Optional count for sorting/display
}

interface LeaderboardProps {
  initialMode?: string;
  initialAtlas?: string;
  className?: string;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ 
  initialMode = '',
  initialAtlas = '',
  className = ''
}) => {
  const { t, userUsername } = useApp();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter states
  const [mode, setMode] = useState<string>(initialMode);
  const [atlas, setAtlas] = useState<string>(initialAtlas);
  const [timeLimit, setTimeLimit] = useState<number>(30); // Default 7 days
  const [numberLimit, setNumberLimit] = useState<number>(10);

  const [modeOptions, setModeOptions] = useState<{ value: string; label: string }[]>([]);
  const [atlasOptions, setAtlasOptions] = useState<string[]>([]);
  const [timeLimitOptions, setTimeLimitOptions] = useState<{ value: number; label: string }[]>([]);

  useEffect(() => {
    // Initialize mode and atlas options
    setModeOptions([
      { value: '', label: t('all_modes') },
      { value: 'streak', label: t('streak_mode') },
      { value: 'time-attack', label: t('time_attack_mode') },
      { value: 'multiplayer', label: t('multiplayer_mode') }
    ]);
    
    setAtlasOptions(['', 'total', 'harvard-oxford']);

    setTimeLimitOptions([
      { value: 7, label: t('last_week') },
      { value: 30, label: t('last_month') },
      { value: 90, label: t('last_3_months') },
      { value: 365, label: t('last_year') },
      { value: 0, label: t('all_time') }
    ]);

    fetchPopularAtlases();
  }, [t]);

  const fetchPopularAtlases = async () => {
    try {
      const response = await fetch('/api/get-most-used-atlases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: 5 }), // Get top 5 most used atlases
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.atlases) {
        // Map the atlases to option format
        const options: string[] = data.atlases.map((item: { atlas: string; count: number }) => {
          return item.atlas;
        });
        
        // Add the "all atlases" option at the beginning
        options.unshift("total");
        options.unshift("");
        
        // Update the atlas options
        setAtlasOptions(options);
      }
    } catch (err) {
      console.error('Failed to fetch popular atlases:', err);
    }
  };



  const fetchLeaderboard = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/get-leaderboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: mode !== '' ? mode : undefined,
          atlas: atlas !== '' ? atlas : undefined,
          appendTotal: atlas == '',
          numberLimit,
          timeLimit: timeLimit || 0 // 0 means no time limit
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.leaderboard && Array.isArray(data.leaderboard)) {
      const sortedLeaderboard = [...data.leaderboard].sort((a, b) => b.best_score - a.best_score);
      const limitedLeaderboard = sortedLeaderboard.slice(0, numberLimit);
        setLeaderboard(limitedLeaderboard);
      } else {
        setLeaderboard([]);
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
      setError(t('error_loading_leaderboard'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [mode, atlas, timeLimit, numberLimit]); // Re-fetch when filters change

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMode(e.target.value);
  };

  const handleAtlasChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setAtlas(e.target.value);
  };

  const handleTimeLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTimeLimit(parseInt(e.target.value));
  };

  const handleNumberLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNumberLimit(parseInt(e.target.value));
  };

  const getModeName = (modeCode: string): string => {
    const mode = modeOptions.find(m => m.value === modeCode);
    return mode ? mode.label : modeCode;
  };

  const getAtlasName = (atlasCode: string): string => {
    const atlas = atlasOptions.find(a => a === atlasCode);
    if(atlas=== "total") {
      return t('combined_score');
    } else if(atlas === "") {
      return t('all_atlases');
    } else {
        return atlas ? atlasFiles?.[atlas]?.name : ""
    }
  };

  return (
    <div className={`leaderboard-container ${className}`}>      
      <div className="leaderboard-filters">
        <div className="filter-group">
          <label htmlFor="mode-filter">{t('game_mode')}:</label>
          <select 
            id="mode-filter" 
            value={mode} 
            onChange={handleModeChange}
            className="filter-select"
          >
            {modeOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label htmlFor="atlas-filter">{t('atlas')}:</label>
          <select 
            id="atlas-filter" 
            value={atlas} 
            onChange={handleAtlasChange}
            className="filter-select"
          >
            {atlasOptions.map(option => (
              <option key={option} value={option}>
                {getAtlasName(option)}
              </option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label htmlFor="time-filter">{t('time_period')}:</label>
          <select 
            id="time-filter" 
            value={timeLimit} 
            onChange={handleTimeLimitChange}
            className="filter-select"
          >
            {timeLimitOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label htmlFor="limit-filter">{t('show')}:</label>
          <select 
            id="limit-filter" 
            value={numberLimit} 
            onChange={handleNumberLimitChange}
            className="filter-select"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>
      
      {loading ? (
        <div className="leaderboard-loading">
          <div className="sk-chase">
            <div className="sk-chase-dot"></div>
            <div className="sk-chase-dot"></div>
            <div className="sk-chase-dot"></div>
            <div className="sk-chase-dot"></div>
            <div className="sk-chase-dot"></div>
            <div className="sk-chase-dot"></div>
          </div>
        </div>
      ) : error ? (
        <div className="leaderboard-error">
          <p>{error}</p>
          <button onClick={fetchLeaderboard} className="retry-button">
            {t('try_again')}
          </button>
        </div>
      ) : (
        <div className="leaderboard-table-container">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>{t('rank')}</th>
                <th>{t('player')}</th>
                <th>{t('mode')}</th>
                <th>{t('atlas')}</th>
                <th>{t('score')}</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length > 0 ? (
                leaderboard.map((entry, index) => (
                  <tr key={`${entry.username}-${entry.mode}-${entry.atlas}`} 
                      className={`${entry.atlas === 'total' ? 'total-row' : ''} ${entry.username == userUsername ? "current-user-row" : ""}`} >
                    <td className="rank-cell">{index + 1}</td>
                    <td className="username-cell">{entry.username}</td>
                    <td className="mode-cell">{getModeName(entry.mode)}</td>
                    <td className="atlas-cell">{getAtlasName(entry.atlas)}</td>
                    <td className="score-cell">{entry.best_score}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="no-data">
                    {t('no_leaderboard_data')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
import React, { useState, useEffect, useRef, forwardRef } from 'react';
import './Leaderboard.css';
import atlasFiles from '../utils/atlas_files';
import { useApp } from '../context/AppContext';

interface FilterDropdownProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const FilterDropdown = forwardRef<HTMLDivElement, FilterDropdownProps>(
  ({ label, value, options, onChange, isOpen, onToggle }, ref) => {
    const selectedLabel = options.find(opt => opt.value === value)?.label || label;

    return (
      <div ref={ref} className="filter-dropdown-wrapper">
        <label>{label}:</label>
        <button className="filter-dropdown-btn" onClick={onToggle}>
          {selectedLabel}
        </button>
        {isOpen && (
          <div className="filter-dropdown-menu">
            {options.map(option => (
              <button
                key={option.value}
                className={`filter-dropdown-item ${option.value === value ? 'active' : ''}`}
                onClick={() => {
                  onChange(option.value);
                  onToggle();
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);
FilterDropdown.displayName = 'FilterDropdown';

interface LeaderboardEntry {
  username: string;
  mode: string;
  best_score: number;
  atlas: string;
  blind_mode: boolean;
}

interface LeaderboardProps {
  initialMode?: string;
  initialAtlas?: string;
  className?: string;
  initialBlindMode?: null | true | false;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ 
  initialMode = '',
  initialAtlas = '',
  initialBlindMode = null,
  className = ''
}) => {
  const { t, userUsername } = useApp();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter states
  const [mode, setMode] = useState<string>(initialMode);
  const [atlas, setAtlas] = useState<string>(initialAtlas);
  const [blindMode, setBlindMode] = useState<boolean | null>(initialBlindMode);
  const [timeLimit, setTimeLimit] = useState<number>(30); // Default 7 days
  const [numberLimit, setNumberLimit] = useState<number>(10);

  const [modeOptions, setModeOptions] = useState<{ value: string; label: string }[]>([]);
  const [atlasOptions, setAtlasOptions] = useState<string[]>([]);
  const [timeLimitOptions, setTimeLimitOptions] = useState<{ value: number; label: string }[]>([]);

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    // Initialize mode and atlas options
    setModeOptions([
      { value: '', label: t('all_modes') },
      { value: 'streak', label: t('streak_mode') },
      { value: 'time-attack', label: t('time_attack_mode') },
      { value: 'multiplayer', label: t('multiplayer_mode') }
    ]);
    
    setAtlasOptions(['', 'harvard-oxford']);

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
          blindMode: blindMode === null ? null : blindMode,
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
  }, [mode, atlas, timeLimit, numberLimit, blindMode]); // Re-fetch when filters change

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      let clicked = false;
      Object.values(dropdownRefs.current).forEach(ref => {
        if (ref && ref.contains(event.target as Node)) {
          clicked = true;
        }
      });
      if (!clicked) setOpenDropdown(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleBlindModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "") {
      setBlindMode(null);
    } else {
      setBlindMode(value === "true");
    }
  }

  const getModeName = (modeCode: string): string => {
    const mode = modeOptions.find(m => m.value === modeCode);
    return mode ? mode.label : modeCode;
  };

  const getAtlasName = (atlasCode: string): string => {
    const atlas = atlasOptions.find(a => a === atlasCode);
    if(atlas === "") {
      return t('all_atlases');
    } else {
        return atlas ? atlasFiles?.[atlas]?.name ?? "" : ""
    }
  };

  return (
    <div className={`leaderboard-container ${className}`}>      
      <div className="leaderboard-filters">
        <FilterDropdown
          label={t('game_mode')}
          value={mode}
          options={modeOptions.map(opt => ({ value: opt.value, label: opt.label }))}
          onChange={(val) => setMode(val)}
          isOpen={openDropdown === 'mode'}
          onToggle={() => setOpenDropdown(openDropdown === 'mode' ? null : 'mode')}
          ref={(el) => { dropdownRefs.current['mode'] = el; }}
        />
        <FilterDropdown
          label={t('atlas')}
          value={atlas}
          options={atlasOptions.map(opt => ({ value: opt, label: getAtlasName(opt) }))}
          onChange={(val) => setAtlas(val)}
          isOpen={openDropdown === 'atlas'}
          onToggle={() => setOpenDropdown(openDropdown === 'atlas' ? null : 'atlas')}
          ref={(el) => { dropdownRefs.current['atlas'] = el; }}
        />
        <FilterDropdown
          label={t('time_period')}
          value={timeLimit.toString()}
          options={timeLimitOptions.map(opt => ({ value: opt.value.toString(), label: opt.label }))}
          onChange={(val) => setTimeLimit(parseInt(val))}
          isOpen={openDropdown === 'time'}
          onToggle={() => setOpenDropdown(openDropdown === 'time' ? null : 'time')}
          ref={(el) => { dropdownRefs.current['time'] = el; }}
        />
        <FilterDropdown
          label={t('show')}
          value={numberLimit.toString()}
          options={[
            { value: '10', label: '10' },
            { value: '25', label: '25' },
            { value: '50', label: '50' },
            { value: '100', label: '100' }
          ]}
          onChange={(val) => setNumberLimit(parseInt(val))}
          isOpen={openDropdown === 'limit'}
          onToggle={() => setOpenDropdown(openDropdown === 'limit' ? null : 'limit')}
          ref={(el) => { dropdownRefs.current['limit'] = el; }}
        />
        <FilterDropdown
          label={t('blind_mode')}
          value={blindMode === null ? "" : blindMode.toString()}
          options={[
            { value: '', label: '—' },
            { value: 'true', label: t("yes") },
            { value: 'false', label: t("no") }
          ]}
          onChange={(val) => handleBlindModeChange({ target: { value: val } } as any)}
          isOpen={openDropdown === 'blind'}
          onToggle={() => setOpenDropdown(openDropdown === 'blind' ? null : 'blind')}
          ref={(el) => { dropdownRefs.current['blind'] = el; }}
        />
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
                <th>{t('blind_mode')}</th>
                <th>{t('score')}</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length > 0 ? (
                leaderboard.map((entry, index) => (
                  <tr key={`${entry.username}-${entry.mode}-${entry.atlas}-${entry.blind_mode}`}
                      className={`${entry.username == userUsername ? "current-user-row" : ""}`} >
                    <td className="rank-cell">
                      {(index === 0 || index === 1 || index === 2) ? (
                        <span className={`rank-badge rank-${index + 1}`}>{index + 1}</span>
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </td>
                    <td className="username-cell">{entry.username}</td>
                    <td className="mode-cell">{getModeName(entry.mode)}</td>
                    <td className="atlas-cell">{getAtlasName(entry.atlas)}</td>
                    <td className="atlas-cell">{entry.blind_mode ? t("yes") : t("no")}</td>
                    <td className="score-cell">
                      {entry.mode === 'multiplayer' 
                        ? `${Number(entry.best_score).toFixed(1)}%` 
                        : entry.best_score}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="no-data">
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
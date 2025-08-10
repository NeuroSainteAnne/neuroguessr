import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getAtlasUsageStats } from '../utils/atlas_usage_tracker';
import './CacheMonitor.css';

interface CacheMonitorProps {
  isVisible?: boolean;
  onClose?: () => void;
}

export const CacheMonitor: React.FC<CacheMonitorProps> = ({ isVisible = false, onClose }) => {
  const { getCacheStats, clearCache, t } = useApp();
  const [stats, setStats] = useState<ReturnType<typeof getCacheStats> | null>(null);
  const [usageStats, setUsageStats] = useState<ReturnType<typeof getAtlasUsageStats> | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  // Refresh stats periodically when visible
  useEffect(() => {
    if (isVisible) {
      const updateStats = () => {
        setStats(getCacheStats());
        setUsageStats(getAtlasUsageStats());
      };
      
      updateStats(); // Initial update
      const interval = setInterval(updateStats, 1000); // Update every second
      setRefreshInterval(interval);
      
      return () => {
        if (interval) clearInterval(interval);
      };
    } else {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    }
  }, [isVisible, getCacheStats]);

  const handleClearCache = () => {
    clearCache();
    setStats(getCacheStats()); // Refresh stats immediately
    setUsageStats(getAtlasUsageStats());
  };

  if (!isVisible || !stats) {
    return null;
  }

  return (
    <div className="cache-monitor-overlay">
      <div className="cache-monitor">
        <div className="cache-monitor-header">
          <h3>🗄️ NIfTI Cache Monitor</h3>
          <button onClick={onClose} className="close-button">✕</button>
        </div>
        
        <div className="cache-stats">
          <h4>📋 Cache Statistics</h4>
          <div className="stat-row">
            <span className="stat-label">Memory Cache:</span>
            <span className="stat-value">{stats.entryCount} NIfTI files</span>
          </div>
          
          <div className="stat-row">
            <span className="stat-label">JSON Cache:</span>
            <span className="stat-value">{stats.jsonEntryCount} files</span>
          </div>
          
          <div className="stat-row">
            <span className="stat-label">IndexedDB Cache:</span>
            <span className="stat-value">{stats.indexedDBEntryCount} NIfTI files</span>
          </div>
          
          <div className="stat-row">
            <span className="stat-label">Estimated Memory:</span>
            <span className="stat-value">{stats.totalSize.toFixed(1)} MB</span>
          </div>
          
          <div className="stat-row">
            <span className="stat-label">Memory Requests:</span>
            <span className="stat-value">{stats.totalRequests}</span>
          </div>
          
          <div className="stat-row">
            <span className="stat-label">JSON Requests:</span>
            <span className="stat-value">{stats.jsonTotalRequests}</span>
          </div>
          
          <div className="stat-row">
            <span className="stat-label">IndexedDB Requests:</span>
            <span className="stat-value">{stats.indexedDBTotalRequests}</span>
          </div>
          
          <div className="stat-row">
            <span className="stat-label">Memory Hit Rate:</span>
            <span className={`stat-value ${stats.hitRate > 50 ? 'success' : 'warning'}`}>
              {stats.hitRate.toFixed(1)}%
            </span>
          </div>
          
          <div className="stat-row">
            <span className="stat-label">JSON Hit Rate:</span>
            <span className={`stat-value ${stats.jsonTotalRequests > 0 ? (stats.jsonCacheHits / stats.jsonTotalRequests * 100 > 50 ? 'success' : 'warning') : ''}`}>
              {stats.jsonTotalRequests > 0 ? (stats.jsonCacheHits / stats.jsonTotalRequests * 100).toFixed(1) : '0.0'}%
            </span>
          </div>
          
          <div className="stat-row">
            <span className="stat-label">IndexedDB Hit Rate:</span>
            <span className={`stat-value ${stats.indexedDBTotalRequests > 0 ? (stats.indexedDBCacheHits / stats.indexedDBTotalRequests * 100 > 50 ? 'success' : 'warning') : ''}`}>
              {stats.indexedDBTotalRequests > 0 ? (stats.indexedDBCacheHits / stats.indexedDBTotalRequests * 100).toFixed(1) : '0.0'}%
            </span>
          </div>
          
          <div className="stat-row">
            <span className="stat-label">Miss Rate:</span>
            <span className={`stat-value ${stats.missRate < 50 ? 'success' : 'warning'}`}>
              {stats.missRate.toFixed(1)}%
            </span>
          </div>
        </div>

        {usageStats && (
          <div className="usage-stats">
            <h4>📊 Usage Analytics</h4>
            <div className="stat-row">
              <span className="stat-label">Atlases Used:</span>
              <span className="stat-value">{usageStats.totalAtlases}</span>
            </div>
            
            <div className="stat-row">
              <span className="stat-label">Total Sessions:</span>
              <span className="stat-value">{usageStats.totalSessions}</span>
            </div>
            
            <div className="stat-row">
              <span className="stat-label">Total Time:</span>
              <span className="stat-value">{(usageStats.totalTime / 60000).toFixed(1)} min</span>
            </div>
            
            {usageStats.mostUsed && (
              <div className="stat-row">
                <span className="stat-label">Most Used:</span>
                <span className="stat-value success">{usageStats.mostUsed}</span>
              </div>
            )}
          </div>
        )}
        
        <div className="cache-actions">
          <button 
            onClick={handleClearCache} 
            className="clear-cache-button"
            title="Clear all cached NIfTI files"
          >
            🗑️ Clear Cache
          </button>
        </div>
        
        <div className="cache-info">
          <p className="info-text">
            💡 The cache stores loaded NIfTI files in memory for faster access. 
            A higher hit rate indicates better performance.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CacheMonitor;

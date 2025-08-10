/**
 * Atlas Usage Analytics for Smart Preloading
 * 
 * This module tracks which atlases are used most frequently by the user
 * and provides recommendations for preloading
 */

import { consoleLog } from "./logging";

interface AtlasUsageData {
  [atlasKey: string]: {
    count: number;
    lastUsed: number;
    totalTime: number; // Total time spent with this atlas
  };
}

class AtlasUsageTracker {
  private readonly STORAGE_KEY = 'neuroguessr_atlas_usage';
  private readonly MAX_HISTORY_DAYS = 30; // Keep data for 30 days
  private usageData: AtlasUsageData = {};
  private currentSession: { atlas: string; startTime: number } | null = null;

  constructor() {
    this.loadUsageData();
    this.cleanOldData();
  }

  /**
   * Load usage data from localStorage
   */
  private loadUsageData(): void {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.usageData = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load atlas usage data:', error);
      this.usageData = {};
    }
  }

  /**
   * Save usage data to localStorage
   */
  private saveUsageData(): void {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.usageData));
    } catch (error) {
      console.warn('Failed to save atlas usage data:', error);
    }
  }

  /**
   * Clean data older than MAX_HISTORY_DAYS
   */
  private cleanOldData(): void {
    const cutoffTime = Date.now() - (this.MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000);
    let hasChanges = false;

    for (const [atlas, data] of Object.entries(this.usageData)) {
      if (data.lastUsed < cutoffTime) {
        delete this.usageData[atlas];
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.saveUsageData();
    }
  }

  /**
   * Record that an atlas is being used
   */
  public startAtlasSession(atlasKey: string): void {
    // End previous session if any
    this.endAtlasSession();

    this.currentSession = {
      atlas: atlasKey,
      startTime: Date.now()
    };

    // Initialize usage data if not exists
    if (!this.usageData[atlasKey]) {
      this.usageData[atlasKey] = {
        count: 0,
        lastUsed: 0,
        totalTime: 0
      };
    }

    // Increment usage count and update last used time
    this.usageData[atlasKey].count++;
    this.usageData[atlasKey].lastUsed = Date.now();

    this.saveUsageData();
    consoleLog('verbose', `📊 Started atlas session: ${atlasKey}`);
  }

  /**
   * End the current atlas session
   */
  public endAtlasSession(): void {
    if (this.currentSession) {
      const sessionTime = Date.now() - this.currentSession.startTime;
      const atlas = this.currentSession.atlas;

      if (this.usageData[atlas]) {
        this.usageData[atlas].totalTime += sessionTime;
        this.saveUsageData();
      }

      console.log(`📊 Ended atlas session: ${atlas} (${(sessionTime / 1000).toFixed(1)}s)`);
      this.currentSession = null;
    }
  }

  /**
   * Get the most frequently used atlases
   */
  public getMostUsedAtlases(limit: number = 5): string[] {
    const sorted = Object.entries(this.usageData)
      .map(([atlas, data]) => ({
        atlas,
        score: this.calculateUsageScore(data)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return sorted.map(item => item.atlas);
  }

  /**
   * Calculate a usage score based on frequency, recency, and time spent
   */
  private calculateUsageScore(data: AtlasUsageData[string]): number {
    const now = Date.now();
    const daysSinceLastUse = (now - data.lastUsed) / (24 * 60 * 60 * 1000);
    
    // Recency factor (more recent = higher score)
    const recencyFactor = Math.max(0, 1 - (daysSinceLastUse / this.MAX_HISTORY_DAYS));
    
    // Frequency factor
    const frequencyFactor = Math.log(data.count + 1);
    
    // Time factor (more time spent = higher score)
    const timeFactor = Math.log((data.totalTime / 1000) + 1);
    
    return (frequencyFactor * 0.4) + (recencyFactor * 0.4) + (timeFactor * 0.2);
  }

  /**
   * Get recommendations for preloading
   */
  public getPreloadRecommendations(maxRecommendations: number = 3): string[] {
    const mostUsed = this.getMostUsedAtlases(maxRecommendations);
    
    // If we don't have enough data, fall back to popular defaults
    const defaultAtlases = ['harvard-oxford', 'desikan', 'destrieux'];
    const recommendations = [...mostUsed];
    
    for (const defaultAtlas of defaultAtlases) {
      if (recommendations.length >= maxRecommendations) break;
      if (!recommendations.includes(defaultAtlas)) {
        recommendations.push(defaultAtlas);
      }
    }

    return recommendations.slice(0, maxRecommendations);
  }

  /**
   * Get usage statistics
   */
  public getUsageStats(): {
    totalAtlases: number;
    totalSessions: number;
    totalTime: number;
    mostUsed: string | null;
  } {
    const totalAtlases = Object.keys(this.usageData).length;
    const totalSessions = Object.values(this.usageData).reduce((sum, data) => sum + data.count, 0);
    const totalTime = Object.values(this.usageData).reduce((sum, data) => sum + data.totalTime, 0);
    
    let mostUsed = null;
    let highestScore = 0;
    
    for (const [atlas, data] of Object.entries(this.usageData)) {
      const score = this.calculateUsageScore(data);
      if (score > highestScore) {
        highestScore = score;
        mostUsed = atlas;
      }
    }

    return {
      totalAtlases,
      totalSessions,
      totalTime,
      mostUsed
    };
  }

  /**
   * Clear all usage data
   */
  public clearUsageData(): void {
    this.usageData = {};
    this.currentSession = null;
    
    // Check if we're in a browser environment
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.STORAGE_KEY);
    }
    
    console.log('🧹 Atlas usage data cleared');
  }

  /**
   * Export usage data for debugging
   */
  public exportUsageData(): AtlasUsageData {
    return { ...this.usageData };
  }
}

// Create singleton instance
export const atlasUsageTracker = new AtlasUsageTracker();

// Export convenience functions
export const startAtlasSession = atlasUsageTracker.startAtlasSession.bind(atlasUsageTracker);
export const endAtlasSession = atlasUsageTracker.endAtlasSession.bind(atlasUsageTracker);
export const getMostUsedAtlases = atlasUsageTracker.getMostUsedAtlases.bind(atlasUsageTracker);
export const getPreloadRecommendations = atlasUsageTracker.getPreloadRecommendations.bind(atlasUsageTracker);
export const getAtlasUsageStats = atlasUsageTracker.getUsageStats.bind(atlasUsageTracker);

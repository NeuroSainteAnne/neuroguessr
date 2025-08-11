import { niftiCache, loadJSONFromCache } from './nifti_cache';
import atlasFiles from './atlas_files';
import { consoleLog } from './logging';

/**
 * Performance Optimization Utilities for NIfTI Loading
 * 
 * This module provides utilities to optimize NIfTI loading performance
 * by leveraging cache information and providing intelligent loading strategies
 */

export interface LoadingStrategy {
  shouldPreload: boolean;
  priority: 'high' | 'medium' | 'low';
  estimatedLoadTime: number; // in milliseconds
  cacheStatus: 'cached' | 'not-cached' | 'unknown';
}

/**
 * Analyze loading strategy for an atlas
 */
export function analyzeAtlasLoadingStrategy(atlasKey: string): LoadingStrategy {
  const atlas = atlasFiles[atlasKey];
  if (!atlas) {
    return {
      shouldPreload: false,
      priority: 'low',
      estimatedLoadTime: 0,
      cacheStatus: 'unknown'
    };
  }

  const niiFile = `/atlas/nii/${atlas.nii}`;
  const isCached = niftiCache.isCached(niiFile);
  
  // Estimate file size based on common atlas patterns
  const estimatedSizeMB = estimateAtlasSize(atlasKey);
  
  // Estimate load time (cached = 50ms, network = 100ms per MB + 500ms base)
  const estimatedLoadTime = isCached 
    ? 50 
    : (estimatedSizeMB * 100) + 500;
  
  // Determine priority based on difficulty and popularity
  let priority: 'high' | 'medium' | 'low' = 'medium';
  if (atlas.difficulty <= 1) priority = 'high';
  else if (atlas.difficulty >= 4) priority = 'low';
  
  return {
    shouldPreload: atlas.difficulty <= 2 && !isCached,
    priority,
    estimatedLoadTime,
    cacheStatus: isCached ? 'cached' : 'not-cached'
  };
}

/**
 * Estimate atlas file size based on characteristics
 */
function estimateAtlasSize(atlasKey: string): number {
  // These are rough estimates based on typical atlas sizes
  const sizeEstimates: Record<string, number> = {
    'tissues': 8,           // Tissue segmentation - smaller
    'harvard-oxford': 12,   // Standard cortical atlas
    'desikan': 15,          // DK atlas
    'destrieux': 18,        // Destrieux - more detailed
    'allen': 25,            // Allen atlas - high resolution
    'yeo7': 10,            // Functional networks
    'yeo17': 12,           // More networks
    'subcortical': 14,      // Subcortical structures
    'cerebellum': 16,       // Cerebellum specific
    'thalamus': 12,         // Thalamic nuclei
    'HippoAmyg': 8,        // Hippocampus/Amygdala
    'xtract': 20,          // White matter tracts
    'JHU': 18,             // JHU atlas
    'territories': 14       // Arterial territories
  };

  return sizeEstimates[atlasKey] || 15; // Default 15MB
}

/**
 * Get optimized loading order for multiple atlases
 */
export function getOptimizedLoadingOrder(atlasKeys: string[]): string[] {
  const strategies = atlasKeys.map(key => ({
    atlas: key,
    strategy: analyzeAtlasLoadingStrategy(key)
  }));

  // Sort by: cached first, then by priority, then by estimated load time
  return strategies
    .sort((a, b) => {
      // Cached items first
      if (a.strategy.cacheStatus === 'cached' && b.strategy.cacheStatus !== 'cached') return -1;
      if (b.strategy.cacheStatus === 'cached' && a.strategy.cacheStatus !== 'cached') return 1;
      
      // Then by priority
      const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
      const priorityDiff = priorityOrder[a.strategy.priority] - priorityOrder[b.strategy.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Finally by load time
      return a.strategy.estimatedLoadTime - b.strategy.estimatedLoadTime;
    })
    .map(item => item.atlas);
}

/**
 * Check if preloading would be beneficial
 */
export function shouldPreloadAtlas(atlasKey: string): boolean {
  const strategy = analyzeAtlasLoadingStrategy(atlasKey);
  return strategy.shouldPreload;
}

/**
 * Get cache efficiency metrics
 */
export function getCacheEfficiencyMetrics() {
  const stats = niftiCache.getStats();
  
  return {
    efficiency: stats.totalRequests > 0 ? (stats.cacheHits / stats.totalRequests) : 0,
    memoryUtilization: stats.totalSize,
    recommendedAction: getRecommendedCacheAction(stats),
    performance: getPerformanceRating(stats)
  };
}

/**
 * Get recommended cache action based on current state
 */
function getRecommendedCacheAction(stats: ReturnType<typeof niftiCache.getStats>): string {
  if (stats.totalRequests === 0) {
    return 'No action needed - cache not yet used';
  }
  
  const hitRate = stats.cacheHits / stats.totalRequests;
  
  if (hitRate < 0.3) {
    return 'Consider preloading frequently used atlases';
  } else if (hitRate > 0.8 && stats.totalSize > 400) {
    return 'Excellent performance - consider increasing cache size';
  } else if (hitRate > 0.6) {
    return 'Good performance - cache is working well';
  } else {
    return 'Moderate performance - may benefit from optimization';
  }
}

/**
 * Get performance rating
 */
function getPerformanceRating(stats: ReturnType<typeof niftiCache.getStats>): 'excellent' | 'good' | 'fair' | 'poor' {
  if (stats.totalRequests === 0) return 'fair';
  
  const hitRate = stats.cacheHits / stats.totalRequests;
  
  if (hitRate >= 0.8) return 'excellent';
  if (hitRate >= 0.6) return 'good';
  if (hitRate >= 0.4) return 'fair';
  return 'poor';
}

/**
 * Prefetch atlases likely to be needed next
 */
export async function prefetchLikelyAtlases(currentAtlas: string): Promise<void> {
  // Define atlas relationships (atlases commonly used together)
  const atlasRelationships: Record<string, string[]> = {
    'harvard-oxford': ['desikan', 'destrieux'],
    'desikan': ['harvard-oxford', 'destrieux'],
    'destrieux': ['harvard-oxford', 'desikan'],
    'tissues': ['harvard-oxford', 'subcortical'],
    'subcortical': ['tissues', 'thalamus'],
    'yeo7': ['yeo17'],
    'yeo17': ['yeo7'],
  };

  const relatedAtlases = atlasRelationships[currentAtlas] || [];
  
  for (const atlasKey of relatedAtlases) {
    if (shouldPreloadAtlas(atlasKey)) {
      try {
        // Preload both NIfTI and JSON files
        await Promise.all([
          niftiCache.preloadAtlas(atlasKey),
          prefetchAtlasJSON(atlasKey)
        ]);
        consoleLog('verbose', `🔮 Prefetched related atlas: ${atlasKey} (NIfTI + JSON)`);
      } catch (error) {
        console.warn(`Failed to prefetch ${atlasKey}:`, error);
      }
    }
  }
}

/**
 * Prefetch JSON files for an atlas in all available languages
 */
async function prefetchAtlasJSON(atlasKey: string): Promise<void> {
  const atlas = atlasFiles[atlasKey];
  if (!atlas) return;

  const languages = ['en', 'fr']; // Add other languages as needed
  const prefetchPromises: Promise<any>[] = [];

  for (const lang of languages) {
    const jsonUrl = `/atlas/descr/${lang}/${atlas.json}`;
    prefetchPromises.push(
      loadJSONFromCache(jsonUrl).catch(error => {
        // Don't throw on individual language failures
        console.warn(`Failed to prefetch JSON for ${atlasKey} (${lang}):`, error);
      })
    );
  }

  await Promise.allSettled(prefetchPromises);
}

/**
 * Log performance insights
 */
export function logPerformanceInsights(): void {
  const metrics = getCacheEfficiencyMetrics();
  const stats = niftiCache.getStats();
  
  consoleLog('verbose', '🔍 NIfTI Cache Performance Insights:');
  consoleLog('verbose', `   Efficiency: ${(metrics.efficiency * 100).toFixed(1)}%`);
  consoleLog('verbose', `   Memory Usage: ${metrics.memoryUtilization.toFixed(1)} MB`);
  consoleLog('verbose', `   Rating: ${metrics.performance}`);
  consoleLog('verbose', `   Recommendation: ${metrics.recommendedAction}`);
  consoleLog('verbose', `   Memory Cache: ${stats.entryCount} entries`);
  consoleLog('verbose', `   JSON Cache: ${stats.jsonEntryCount} entries`);
  consoleLog('verbose', `   IndexedDB Cache: ${stats.indexedDBEntryCount} entries`);
  consoleLog('verbose', `   Memory Hit/Miss: ${stats.cacheHits}/${stats.cacheMisses}`);
  consoleLog('verbose', `   JSON Hit/Miss: ${stats.jsonCacheHits}/${stats.jsonCacheMisses}`);
  consoleLog('verbose', `   IndexedDB Hit/Miss: ${stats.indexedDBCacheHits}/${stats.indexedDBCacheMisses}`);
}

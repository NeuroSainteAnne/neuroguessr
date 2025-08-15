import { niftiCache } from './nifti_cache';
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
    consoleLog("verbose", `Atlas analysis failed: atlas '${atlasKey}' not found`);
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
  
  consoleLog("verbose", `Atlas ${atlasKey} analysis: cached=${isCached}, size=${estimatedSizeMB}MB, loadTime=${estimatedLoadTime}ms, priority=${priority}`);
  
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
    'tissues': 0.6,           // Tissue segmentation - smaller
    'harvard-oxford': 0.6,   // Standard cortical atlas
    'desikan': 0.6,          // DK atlas
    'destrieux': 0.6,        // Destrieux - more detailed
    'allen': 2,            // Allen atlas - high resolution
    'yeo7': 0.6,            // Functional networks
    'yeo17': 0.6,           // More networks
    'subcortical': 0.6,      // Subcortical structures
    'cerebellum': 0.6,       // Cerebellum specific
    'thalamus': 0.6,         // Thalamic nuclei
    'HippoAmyg': 0.6,        // Hippocampus/Amygdala
    'xtract': 0.6,          // White matter tracts
    'JHU': 0.6,             // JHU atlas
    'territories': 0.6       // Arterial territories
  };

  return sizeEstimates[atlasKey] || 3; // Default 15MB
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

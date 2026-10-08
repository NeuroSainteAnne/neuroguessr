import type { NVImage } from '@niivue/niivue';
import atlasFiles from './atlas_files';
import { consoleLog } from './logging';

type NVImageConstructor = {
  new (): NVImage;
  loadFromUrl(options: { url: string }): Promise<NVImage>;
}

interface CacheEntry {
  nvImage: NVImage;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

interface JSONCacheEntry {
  data: any;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
  etag?: string | undefined;
  lastModified?: string | undefined;
}

interface IndexedDBCacheEntry {
  url: string;
  arrayBuffer: ArrayBuffer;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
}

interface CacheStats {
  totalSize: number;
  entryCount: number;
  hitRate: number;
  missRate: number;
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  // JSON cache stats
  jsonEntryCount: number;
  jsonCacheHits: number;
  jsonCacheMisses: number;
  jsonTotalRequests: number;
  // IndexedDB cache stats
  indexedDBEntryCount: number;
  indexedDBCacheHits: number;
  indexedDBCacheMisses: number;
  indexedDBTotalRequests: number;
}

/**
 * NIfTI File Cache System
 * 
 * This cache system provides:
 * - Memory-efficient caching of NVImage objects
 * - LRU (Least Recently Used) eviction policy
 * - Automatic preloading of frequently used files
 * - Cache statistics and monitoring
 * - Configurable cache size limits
 */
export class NIfTICacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private jsonCache: Map<string, JSONCacheEntry> = new Map();
  private maxCacheSize: number;
  private maxMemoryMB: number;
  private stats: CacheStats;
  private nvImageModule: NVImageConstructor | null = null;
  
  // IndexedDB properties
  private db: IDBDatabase | null = null;
  private dbName = 'neuroguessr_cache';
  private dbVersion = 1;
  private niftiStoreName = 'nifti_files';
  
  // Preload configuration
  private preloadList: string[] = [
    '/atlas/mni152_downsampled.nii.gz', // Background MNI
  ];

  constructor(maxCacheSize: number = 50, maxMemoryMB: number = 500) {
    this.maxCacheSize = maxCacheSize;
    this.maxMemoryMB = maxMemoryMB;
    this.stats = {
      totalSize: 0,
      entryCount: 0,
      hitRate: 0,
      missRate: 0,
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      jsonEntryCount: 0,
      jsonCacheHits: 0,
      jsonCacheMisses: 0,
      jsonTotalRequests: 0,
      indexedDBEntryCount: 0,
      indexedDBCacheHits: 0,
      indexedDBCacheMisses: 0,
      indexedDBTotalRequests: 0,
    };

    // Load JSON cache from localStorage on initialization
    this.loadJSONCacheFromStorage();
    
    // Initialize IndexedDB
    this.initIndexedDB().catch((error: any) => {
      console.warn('Failed to initialize IndexedDB:', error);
    });

    // Bind methods to preserve 'this' context
    this.loadNIfTI = this.loadNIfTI.bind(this);
    this.loadJSON = this.loadJSON.bind(this);
    this.preloadCommonFiles = this.preloadCommonFiles.bind(this);
    this.clearCache = this.clearCache.bind(this);
  }

  /**
   * Initialize the cache with the NVImage module
   */
  public initialize(nvImageModule: NVImageConstructor): void {
    this.nvImageModule = nvImageModule;
    
    // Start preloading common files in the background
    this.preloadCommonFiles().catch(error => {
      console.warn('Background preloading failed:', error);
    });
  }

  /**
   * Load a NIfTI file from cache or network
   */
  public async loadNIfTI(url: string): Promise<NVImage> {
    this.stats.totalRequests++;
    
    // Check memory cache first
    const cached = this.cache.get(url);
    if (cached) {
      this.stats.cacheHits++;
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      this.updateStats();
      
      consoleLog('verbose', `📋 Memory Cache HIT for ${url}`);
      
      try {
        // Return a clone to prevent modification of cached object
        return cached.nvImage.clone();
      } catch (error) {
        console.warn(`Failed to clone cached image for ${url}, removing from cache:`, error);
        this.cache.delete(url);
        // Fall through to IndexedDB/network loading
      }
    }

    // Check IndexedDB cache
    const indexedDBData = await this.loadFromIndexedDB(url);
    if (indexedDBData) {
      this.stats.indexedDBCacheHits++;
      consoleLog('verbose', `💾 IndexedDB Cache HIT for ${url}`);
      
      try {
        if (!this.nvImageModule) {
          throw new Error('NVImage module not initialized');
        }
        
        // Create NVImage from ArrayBuffer
        const nvImage = await this.createNVImageFromArrayBuffer(indexedDBData);
        
        // Add to memory cache for faster subsequent access
        await this.addToCache(url, nvImage);
        
        this.updateStats();
        return nvImage.clone();
      } catch (error) {
        console.warn(`Failed to load from IndexedDB cache for ${url}:`, error);
        // Remove corrupted entry and fall through to network loading
        await this.removeFromIndexedDB(url);
      }
    }

    // Cache miss - load from network
    this.stats.cacheMisses++;
    this.stats.indexedDBCacheMisses++;
    consoleLog('normal', `🌐 Cache MISS for ${url} - loading from network`);
    
    if (!this.nvImageModule) {
      throw new Error('NVImage module not initialized');
    }

    try {
      // First, fetch the raw file data for IndexedDB storage
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      
      // Create NVImage from the fetched data
      const blob = new Blob([arrayBuffer]);
      const blobUrl = URL.createObjectURL(blob);
      
      let nvImage: NVImage;
      try {
        nvImage = await this.nvImageModule.loadFromUrl({ url: blobUrl });
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
      
      // Validate the loaded image
      if (!nvImage || typeof nvImage.clone !== 'function') {
        throw new Error('Invalid NVImage object received');
      }
      
      // Add to memory cache
      await this.addToCache(url, nvImage);
      
      // Add raw data to IndexedDB cache
      await this.addRawDataToIndexedDB(url, arrayBuffer);
      
      this.updateStats();
      return nvImage.clone();
    } catch (error) {
      console.error(`Failed to load NIfTI file from ${url}:`, error);
      throw error;
    }
  }

  /**
   * Load JSON data from cache or network
   */
  public async loadJSON(url: string): Promise<any> {
    this.stats.jsonTotalRequests++;
    
    const cached = this.jsonCache.get(url);

    // Build conditional request headers if we have a cached entry
    const headers: Record<string, string> = {};
    if (cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    } else if (cached?.lastModified) {
      headers['If-Modified-Since'] = cached.lastModified;
    }

    try {
      const response = await fetch(url, { headers });

      // 304 Not Modified — cached data is still fresh
      if (response.status === 304 && cached) {
        this.stats.jsonCacheHits++;
        cached.accessCount++;
        cached.lastAccessed = Date.now();
        this.updateStats();
        consoleLog('verbose', `📋 JSON Cache REVALIDATED (304) for ${url}`);
        return JSON.parse(JSON.stringify(cached.data));
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // New or updated data
      const jsonData = await response.json();
      const etag = response.headers.get('etag') ?? undefined;
      const lastModified = response.headers.get('last-modified') ?? undefined;

      await this.addJSONToCache(url, jsonData, etag, lastModified);

      if (cached) {
        consoleLog('normal', `🔄 JSON Cache UPDATED for ${url}`);
      } else {
        this.stats.jsonCacheMisses++;
        consoleLog('normal', `🌐 JSON Cache MISS for ${url}`);
      }

      this.updateStats();
      return jsonData;

    } catch (error) {
      // Network failure: fall back to stale cache if available
      if (cached) {
        console.warn(`Network error for ${url}, returning stale cache:`, error);
        return JSON.parse(JSON.stringify(cached.data));
      }
      console.error(`Failed to load JSON file from ${url}:`, error);
      throw error;
    }
  }

  /**
   * Add a loaded NVImage to the cache
   */
  private async addToCache(url: string, nvImage: NVImage): Promise<void> {
    try {
      // Check if we need to make space
      while (this.shouldEvict()) {
        this.evictLRU();
      }

      // Validate the image before caching
      if (!nvImage || typeof nvImage.clone !== 'function') {
        console.warn(`Invalid NVImage for ${url}, skipping cache`);
        return;
      }

      const entry: CacheEntry = {
        nvImage: nvImage.clone(), // Store a clone to prevent external modification
        timestamp: Date.now(),
        accessCount: 1,
        lastAccessed: Date.now(),
      };

      this.cache.set(url, entry);
      this.stats.entryCount = this.cache.size;
      
      consoleLog('verbose', `💾 Cached ${url} (${this.cache.size}/${this.maxCacheSize})`);
    } catch (error) {
      console.warn(`Failed to cache ${url}:`, error);
    }
  }

  /**
   * Add JSON data to the cache
   */
  private async addJSONToCache(url: string, data: any, etag?: string, lastModified?: string): Promise<void> {
    try {
      // Check if we need to make space in JSON cache
      while (this.shouldEvictJSON()) {
        this.evictJSONLRU();
      }

      // Calculate approximate size of JSON data
      const dataSize = JSON.stringify(data).length * 2; // Approximate bytes (UTF-16)

      const entry: JSONCacheEntry = {
        data: JSON.parse(JSON.stringify(data)), // Store a deep clone
        timestamp: Date.now(),
        accessCount: 1,
        lastAccessed: Date.now(),
        size: dataSize,
        etag,
        lastModified,
      };

      this.jsonCache.set(url, entry);
      this.stats.jsonEntryCount = this.jsonCache.size;
      
      // Persist to localStorage
      this.saveJSONCacheToStorage();
      
      consoleLog('verbose', `💾 Cached JSON ${url} (${this.jsonCache.size} JSON entries)`);
    } catch (error) {
      console.warn(`Failed to cache JSON ${url}:`, error);
    }
  }

  /**
   * Check if cache eviction is needed
   */
  private shouldEvict(): boolean {
    return this.cache.size >= this.maxCacheSize || this.getEstimatedMemoryUsageMB() > this.maxMemoryMB;
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    if (this.cache.size === 0) return;

    let oldestUrl = '';
    let oldestTime = Infinity;

    for (const [url, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestUrl = url;
      }
    }

    if (oldestUrl) {
      this.cache.delete(oldestUrl);
      consoleLog('verbose', `🗑️ Evicted ${oldestUrl} from cache`);
    }
  }

  /**
   * Check if JSON cache eviction is needed
   */
  private shouldEvictJSON(): boolean {
    const maxJSONEntries = 100; // Allow up to 100 JSON files in cache
    const maxJSONSizeMB = 50; // Maximum 50MB for JSON cache
    
    return this.jsonCache.size >= maxJSONEntries || this.getJSONMemoryUsageMB() > maxJSONSizeMB;
  }

  /**
   * Evict the least recently used JSON entry
   */
  private evictJSONLRU(): void {
    if (this.jsonCache.size === 0) return;

    let oldestUrl = '';
    let oldestTime = Infinity;

    for (const [url, entry] of this.jsonCache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestUrl = url;
      }
    }

    if (oldestUrl) {
      this.jsonCache.delete(oldestUrl);
      this.saveJSONCacheToStorage(); // Persist changes
      consoleLog('verbose', `🗑️ Evicted JSON ${oldestUrl} from cache`);
    }
  }

  /**
   * Calculate JSON cache memory usage
   */
  private getJSONMemoryUsageMB(): number {
    let totalSize = 0;
    for (const entry of this.jsonCache.values()) {
      totalSize += entry.size;
    }
    return totalSize / (1024 * 1024); // Convert bytes to MB
  }

  /**
   * Estimate memory usage based on actual file sizes
   */
  private getEstimatedMemoryUsageMB(): number {
    let totalSizeMB = 0;
    
    for (const url of this.cache.keys()) {
      // Estimate memory usage based on known file sizes
      if (url.includes('reconstructed_allen_05mm_uint.nii.gz')) {
        totalSizeMB += 4; // 4MB for Allen atlas
      } else if (url.includes('mni152_downsampled.nii.gz')) {
        totalSizeMB += 0.9; // 900KB for MNI background
      } else {
        totalSizeMB += 0.5; // 500KB for other atlases
      }
    }
    
    return totalSizeMB;
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    this.stats.entryCount = this.cache.size;
    this.stats.jsonEntryCount = this.jsonCache.size;
    this.stats.hitRate = this.stats.totalRequests > 0 
      ? (this.stats.cacheHits / this.stats.totalRequests) * 100 
      : 0;
    this.stats.missRate = this.stats.totalRequests > 0 
      ? (this.stats.cacheMisses / this.stats.totalRequests) * 100 
      : 0;
    this.stats.totalSize = this.getEstimatedMemoryUsageMB();
  }

  /**
   * Preload commonly used NIfTI files
   */
  public async preloadCommonFiles(): Promise<void> {
    if (!this.nvImageModule) {
      console.warn('Cannot preload: NVImage module not initialized');
      return;
    }

    consoleLog('minimal', '🚀 Starting background preloading of common NIfTI files...');
    
    for (const url of this.preloadList) {
      try {
        // Check if already cached in memory or IndexedDB
        if (this.cache.has(url)) {
          consoleLog('verbose', `⏭️ Skipping ${url} - already cached in memory`);
          continue;
        }

        // Check IndexedDB cache as well
        const indexedDBData = await this.loadFromIndexedDB(url);
        if (indexedDBData) {
          consoleLog('verbose', `⏭️ Skipping ${url} - already cached in IndexedDB`);
          // Load into memory cache for faster access
          try {
            const nvImage = await this.createNVImageFromArrayBuffer(indexedDBData);
            await this.addToCache(url, nvImage);
            consoleLog('verbose', `📋 Moved ${url} from IndexedDB to memory cache`);
          } catch (error) {
            console.warn(`Failed to load from IndexedDB during preload for ${url}:`, error);
            // Remove corrupted entry
            await this.removeFromIndexedDB(url);
          }
          continue;
        }

        consoleLog('verbose', `⬇️ Preloading ${url}...`);
        const nvImage = await this.nvImageModule.loadFromUrl({ url });
        await this.addToCache(url, nvImage);
        
        // Add a small delay to avoid overwhelming the browser
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.warn(`Failed to preload ${url}:`, error);
      }
    }
    
    consoleLog('minimal', '✅ Background preloading completed');
  }

  /**
   * Preload a specific atlas
   */
  public async preloadAtlas(atlasKey: string): Promise<void> {
    consoleLog("verbose", `Starting preload for atlas: ${atlasKey}`);
    if (!this.nvImageModule) {
      console.warn('Cannot preload atlas: NVImage module not initialized');
      consoleLog("verbose", `Preload failed for ${atlasKey}: NVImage module not initialized`);
      return;
    }

    const atlas = atlasFiles[atlasKey];
    if (!atlas) {
      console.warn(`Atlas ${atlasKey} not found`);
      consoleLog("verbose", `Preload failed for ${atlasKey}: atlas not found in files`);
      return;
    }

    const url = `/atlas/nii/${atlas.nii}`;
    
    // Check if already cached in memory
    if (this.cache.has(url)) {
      consoleLog('verbose', `⏭️ Atlas ${atlasKey} already cached in memory`);
      return;
    }

    // Check IndexedDB cache as well
    const indexedDBData = await this.loadFromIndexedDB(url);
    if (indexedDBData) {
      consoleLog('verbose', `⏭️ Atlas ${atlasKey} already cached in IndexedDB`);
      // Load into memory cache for faster access
      try {
        const nvImage = await this.createNVImageFromArrayBuffer(indexedDBData);
        await this.addToCache(url, nvImage);
        consoleLog('minimal', `📋 Atlas ${atlasKey} moved from IndexedDB to memory cache`);
        return;
      } catch (error) {
        console.warn(`Failed to load atlas ${atlasKey} from IndexedDB:`, error);
        // Remove corrupted entry and continue with network load
        await this.removeFromIndexedDB(url);
      }
    }

    consoleLog("verbose", `Preloading atlas ${atlasKey} from ${url}`);
    try {
      consoleLog('verbose', `⬇️ Preloading atlas ${atlasKey}...`);
      const nvImage = await this.nvImageModule.loadFromUrl({ url });
      await this.addToCache(url, nvImage);
      consoleLog('minimal', `✅ Atlas ${atlasKey} preloaded successfully`);
    } catch (error) {
      console.warn(`Failed to preload atlas ${atlasKey}:`, error);
    }
  }

  /**
   * Check if a file is cached in memory
   */
  public isCached(url: string): boolean {
    return this.cache.has(url);
  }

  /**
   * Check if a file is cached in either memory or IndexedDB
   */
  public async isAnywhereCached(url: string): Promise<boolean> {
    // Check memory cache first (faster)
    if (this.cache.has(url)) {
      return true;
    }
    
    // Check IndexedDB cache
    const indexedDBData = await this.loadFromIndexedDB(url);
    return indexedDBData !== null;
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Clear the entire cache
   */
  public clearCache(): void {
    this.cache.clear();
    this.jsonCache.clear();
    
    // Clear localStorage as well
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem('neuroguessr_json_cache');
      } catch (error) {
        console.warn('Failed to clear localStorage cache:', error);
      }
    }
    
    // Clear IndexedDB as well
    this.clearIndexedDB().catch((error: any) => {
      console.warn('Failed to clear IndexedDB cache:', error);
    });
    
    this.stats = {
      totalSize: 0,
      entryCount: 0,
      hitRate: 0,
      missRate: 0,
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      jsonEntryCount: 0,
      jsonCacheHits: 0,
      jsonCacheMisses: 0,
      jsonTotalRequests: 0,
      indexedDBEntryCount: 0,
      indexedDBCacheHits: 0,
      indexedDBCacheMisses: 0,
      indexedDBTotalRequests: 0,
    };
    consoleLog('minimal', '🧹 Cache cleared (including localStorage and IndexedDB)');
  }

  /**
   * Remove a specific entry from cache
   */
  public removeFromCache(url: string): boolean {
    const removed = this.cache.delete(url);
    if (removed) {
      consoleLog('verbose', `🗑️ Removed ${url} from cache`);
      this.updateStats();
    }
    return removed;
  }

  /**
   * Get list of cached URLs
   */
  public getCachedUrls(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache entry details (for debugging)
   */
  public getCacheEntry(url: string): CacheEntry | null {
    const entry = this.cache.get(url);
    return entry ? { ...entry } : null;
  }

  /**
   * Warmup cache with specific atlases
   */
  public async warmupCache(atlasKeys: string[]): Promise<void> {
    consoleLog('normal', `🔥 Warming up cache with ${atlasKeys.length} atlases...`);
    
    for (const atlasKey of atlasKeys) {
      await this.preloadAtlas(atlasKey);
    }
    
    consoleLog('normal', '🔥 Cache warmup completed');
  }

  /**
   * Load JSON cache from localStorage
   */
  private loadJSONCacheFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return; // Server-side or no localStorage support
    }

    try {
      const storedCache = localStorage.getItem('neuroguessr_json_cache');
      if (!storedCache) return;

      const parsedCache = JSON.parse(storedCache);
      const now = Date.now();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

      for (const [url, entry] of Object.entries(parsedCache)) {
        const cacheEntry = entry as JSONCacheEntry;
        
        // Check if entry is not too old
        if (now - cacheEntry.timestamp < maxAge) {
          this.jsonCache.set(url, cacheEntry);
        }
      }

      this.stats.jsonEntryCount = this.jsonCache.size;
      consoleLog('verbose', `📥 Loaded ${this.jsonCache.size} JSON entries from localStorage`);
    } catch (error) {
      console.warn('Failed to load JSON cache from localStorage:', error);
      // Clear corrupted cache
      try {
        localStorage.removeItem('neuroguessr_json_cache');
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Save JSON cache to localStorage
   */
  private saveJSONCacheToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return; // Server-side or no localStorage support
    }

    try {
      const cacheData: Record<string, JSONCacheEntry> = {};
      for (const [url, entry] of this.jsonCache.entries()) {
        cacheData[url] = entry;
      }

      localStorage.setItem('neuroguessr_json_cache', JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Failed to save JSON cache to localStorage:', error);
      
      // If storage is full, try to clear old entries
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        this.clearOldJSONCacheEntries();
        try {
          const cacheData: Record<string, JSONCacheEntry> = {};
          for (const [url, entry] of this.jsonCache.entries()) {
            cacheData[url] = entry;
          }
          localStorage.setItem('neuroguessr_json_cache', JSON.stringify(cacheData));
        } catch (retryError) {
          console.warn('Failed to save JSON cache even after cleanup:', retryError);
        }
      }
    }
  }

  /**
   * Clear old JSON cache entries when storage is full
   */
  private clearOldJSONCacheEntries(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 1 day
    let removedCount = 0;

    for (const [url, entry] of this.jsonCache.entries()) {
      if (now - entry.lastAccessed > maxAge) {
        this.jsonCache.delete(url);
        removedCount++;
      }
    }

    consoleLog('verbose', `🧹 Cleared ${removedCount} old JSON cache entries to free storage`);
  }

  /**
   * Initialize IndexedDB database
   */
  private async initIndexedDB(): Promise<void> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('IndexedDB not available');
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        consoleLog('verbose', '🗄️ IndexedDB initialized successfully');
        this.loadIndexedDBStats().then(resolve).catch(reject);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store for NIfTI files
        if (!db.objectStoreNames.contains(this.niftiStoreName)) {
          const store = db.createObjectStore(this.niftiStoreName, { keyPath: 'url' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
        }
      };
    });
  }

  /**
   * Load IndexedDB statistics
   */
  private async loadIndexedDBStats(): Promise<void> {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction([this.niftiStoreName], 'readonly');
      const store = transaction.objectStore(this.niftiStoreName);
      const countRequest = store.count();

      return new Promise((resolve, reject) => {
        countRequest.onsuccess = () => {
          this.stats.indexedDBEntryCount = countRequest.result;
          resolve();
        };
        countRequest.onerror = () => reject(new Error('Failed to count IndexedDB entries'));
      });
    } catch (error) {
      console.warn('Failed to load IndexedDB stats:', error);
    }
  }

  /**
   * Load NIfTI data from IndexedDB
   */
  private async loadFromIndexedDB(url: string): Promise<ArrayBuffer | null> {
    if (!this.db) return null;

    this.stats.indexedDBTotalRequests++;

    try {
      const transaction = this.db.transaction([this.niftiStoreName], 'readonly');
      const store = transaction.objectStore(this.niftiStoreName);
      const request = store.get(url);

      return new Promise((resolve, _reject) => {
        request.onsuccess = () => {
          const result = request.result as IndexedDBCacheEntry | undefined;
          if (result) {
            // Update access statistics
            result.accessCount++;
            result.lastAccessed = Date.now();
            
            // Update the entry in IndexedDB
            this.updateIndexedDBEntry(result).catch(console.warn);
            
            resolve(result.arrayBuffer);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => {
          console.warn(`Failed to load ${url} from IndexedDB:`, request.error);
          resolve(null);
        };
      });
    } catch (error) {
      console.warn(`Error accessing IndexedDB for ${url}:`, error);
      return null;
    }
  }

  /**
   * Add raw file data to IndexedDB
   */
  private async addRawDataToIndexedDB(url: string, arrayBuffer: ArrayBuffer): Promise<void> {
    if (!this.db) return;

    try {
      // Check storage quota and clean up if needed
      await this.cleanupIndexedDBIfNeeded();

      const entry: IndexedDBCacheEntry = {
        url,
        arrayBuffer: arrayBuffer.slice(), // Create a copy
        timestamp: Date.now(),
        accessCount: 1,
        lastAccessed: Date.now(),
        size: arrayBuffer.byteLength,
      };

      const transaction = this.db.transaction([this.niftiStoreName], 'readwrite');
      const store = transaction.objectStore(this.niftiStoreName);
      
      return new Promise((resolve, reject) => {
        const request = store.put(entry);
        request.onsuccess = () => {
          this.stats.indexedDBEntryCount++;
          consoleLog('verbose', `💾 Stored ${url} in IndexedDB (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB)`);
          resolve();
        };
        request.onerror = () => {
          console.warn(`Failed to store ${url} in IndexedDB:`, request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.warn(`Failed to add ${url} to IndexedDB:`, error);
    }
  }

  /**
   * Update IndexedDB entry statistics
   */
  private async updateIndexedDBEntry(entry: IndexedDBCacheEntry): Promise<void> {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction([this.niftiStoreName], 'readwrite');
      const store = transaction.objectStore(this.niftiStoreName);
      store.put(entry);
    } catch (error) {
      console.warn('Failed to update IndexedDB entry:', error);
    }
  }

  /**
   * Remove entry from IndexedDB
   */
  private async removeFromIndexedDB(url: string): Promise<void> {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction([this.niftiStoreName], 'readwrite');
      const store = transaction.objectStore(this.niftiStoreName);
      
      return new Promise((resolve, reject) => {
        const request = store.delete(url);
        request.onsuccess = () => {
          this.stats.indexedDBEntryCount = Math.max(0, this.stats.indexedDBEntryCount - 1);
          consoleLog('verbose', `🗑️ Removed ${url} from IndexedDB`);
          resolve();
        };
        request.onerror = () => {
          console.warn(`Failed to remove ${url} from IndexedDB:`, request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.warn(`Failed to remove ${url} from IndexedDB:`, error);
    }
  }

  /**
   * Create NVImage from ArrayBuffer
   */
  private async createNVImageFromArrayBuffer(arrayBuffer: ArrayBuffer): Promise<NVImage> {
    if (!this.nvImageModule) {
      throw new Error('NVImage module not initialized');
    }

    try {
      // Create a blob URL from the ArrayBuffer
      const blob = new Blob([arrayBuffer]);
      const url = URL.createObjectURL(blob);
      
      try {
        // Load the NVImage from the blob URL
        const nvImage = await this.nvImageModule.loadFromUrl({ url });
        
        // Clean up the blob URL
        URL.revokeObjectURL(url);
        
        return nvImage;
      } catch (error) {
        // Clean up on error
        URL.revokeObjectURL(url);
        throw error;
      }
    } catch (error) {
      console.error('Failed to create NVImage from ArrayBuffer:', error);
      throw error;
    }
  }

  /**
   * Clean up IndexedDB if storage is getting full
   */
  private async cleanupIndexedDBIfNeeded(): Promise<void> {
    if (!this.db) return;

    try {
      // Check if we have too many entries (simple cleanup strategy)
      if (this.stats.indexedDBEntryCount > 50) { // Max 50 NIfTI files
        await this.cleanupOldIndexedDBEntries();
      }
    } catch (error) {
      console.warn('Failed to cleanup IndexedDB:', error);
    }
  }

  /**
   * Remove old entries from IndexedDB
   */
  private async cleanupOldIndexedDBEntries(): Promise<void> {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction([this.niftiStoreName], 'readwrite');
      const store = transaction.objectStore(this.niftiStoreName);
      const index = store.index('lastAccessed');
      
      // Get all entries sorted by lastAccessed
      const request = index.openCursor();
      const entriesToRemove: string[] = [];
      let removedCount = 0;
      const maxToRemove = 10; // Remove oldest 10 entries

      return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
          if (cursor && removedCount < maxToRemove) {
            entriesToRemove.push(cursor.value.url);
            removedCount++;
            cursor.continue();
          } else {
            // Remove the collected entries
            const removePromises = entriesToRemove.map(url => this.removeFromIndexedDB(url));
            Promise.all(removePromises).then(() => {
              consoleLog('verbose', `🧹 Cleaned up ${removedCount} old IndexedDB entries`);
              resolve();
            }).catch(reject);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('Failed to cleanup old IndexedDB entries:', error);
    }
  }

  /**
   * Clear all IndexedDB data
   */
  private async clearIndexedDB(): Promise<void> {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction([this.niftiStoreName], 'readwrite');
      const store = transaction.objectStore(this.niftiStoreName);
      
      return new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => {
          this.stats.indexedDBEntryCount = 0;
          consoleLog('verbose', '🧹 Cleared all IndexedDB entries');
          resolve();
        };
        request.onerror = () => {
          console.warn('Failed to clear IndexedDB:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.warn('Failed to clear IndexedDB:', error);
    }
  }

  public async prefetchAtlasJSON(atlasKey: string): Promise<void> {
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
}

// Create a singleton instance
export const niftiCache = new NIfTICacheManager();

// Export convenience functions
export const loadNIfTIFromCache = niftiCache.loadNIfTI;
export const loadJSONFromCache = niftiCache.loadJSON;
export const prefetchAtlasJSON = niftiCache.prefetchAtlasJSON;
export const preloadAtlas = niftiCache.preloadAtlas.bind(niftiCache);
export const warmupCache = niftiCache.warmupCache.bind(niftiCache);
export const getCacheStats = niftiCache.getStats.bind(niftiCache);
export const clearNIfTICache = niftiCache.clearCache.bind(niftiCache);

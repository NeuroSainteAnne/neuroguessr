import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { isTokenValid, refreshToken } from '../utils/helper_login';
import { jwtDecode } from 'jwt-decode';
import type { AtlasRegion, DisplayOptions, CustomTokenPayload, ColorMap, Challenge } from '../types/types';
import i18nInstance from './i18n';
import type { PageContext } from 'vike/types'
import atlasFiles from '../utils/atlas_files';
import { useTranslation } from 'react-i18next';
import type { NVImage } from '@niivue/niivue';
import { niftiCache, loadNIfTIFromCache, getCacheStats, preloadAtlas } from '../utils/nifti_cache';
import { consoleLog } from '../utils/logging';
import './AppContext.css';

type NVImageConstructor = {
  new (): NVImage;
  loadFromUrl(options: { url: string }): Promise<NVImage>;
}

export type SourceElement = {
  auteur: string;
  journal: string;
  year: string;
  doi: string;
}

// Header message type
export type HeaderMessage = {
  id: string;
  text: string;
  color?: string | undefined;
  fontSize?: string | undefined; // CSS font-size value (e.g., '1rem', '16px')
  fontWeight?: string | undefined; // CSS font-weight value (e.g., 'bold', 'normal', '500')
  minDuration?: number | undefined; // in milliseconds
  addedAt: number;
  colorDuration?: number | undefined; // in milliseconds
  colorAddedAt?: number | undefined;
  infoContent?: string | undefined; // Optional additional info content for tooltips or details
  infoSource?: SourceElement[] | undefined; // Optional source or reference for the message content
};

export type AddHeaderMessageOptions = {
  text: string;
  color?: string | undefined;
  fontSize?: string; // CSS font-size value (e.g., '1rem', '16px')
  fontWeight?: string | undefined; // CSS font-weight value (e.g., 'bold', 'normal', '500')
  minDuration?: number; // in milliseconds, default 5000
  colorDuration?: number; // in milliseconds, duration after which color fades out
  forceClear?: boolean; // if true, clears all existing messages before adding
  infoContent?: string | undefined; // Optional additional info content for tooltips or details
  infoSource?: SourceElement[] | undefined; // Optional source or reference for the message content
};

// Tooltip type
export type TooltipState = {
  visible: boolean;
  text: string;
  x: number;
  y: number;
  direction: string;
};

// Define the shape of our context
type AppContextType = {
  // page context
  pageContext: PageContext;

  // User authentication
  isGuest: boolean;
  isLoggedIn: boolean;
  authToken: string;
  userUsername: string;
  userFirstName: string;
  userLastName: string;
  userIsAdmin: boolean;
  userPublishToLeaderboard: boolean | null;
  
  // UI state
  currentLanguage: string;
  notifications: { id: string; message: string; isSuccess: boolean, removing: boolean }[];
  
  // Header state - New unified message system
  headerMessages: HeaderMessage[];
  
  // Legacy header state (kept for backward compatibility with headerErrors, headerStreak, headerTime)
  headerErrors: string;
  headerStreak: string;
  headerScore: string;
  headerTime: string;
  
  // Viewer options
  viewerOptions: DisplayOptions;
  
  // Overlays
  showHelpOverlay: boolean;
  showLegalOverlay: boolean;
  showContributorsOverlay: boolean;
  showInfoOverlay: boolean;

  // Atlas data
  atlasRegions: AtlasRegion[];
  askedAtlas: {atlas: string, lut?: ColorMap, mapping? : Record<number,number>, inverseMapping? : Record<number,number>, blindMode?: boolean} | undefined;
  askedRegion: number | null;
  
  // Next Challenge data
  nextChallenge: Challenge | null;
  nextChallengeLoading: boolean;
  nextChallengeError: string | null;
  
  // Niivue module
  nvimageModule: NVImageConstructor | null;
  preloadedBackgroundMNI: NVImage | null;
  preloadedAtlas: NVImage | null;
  isMobileView: boolean;
  
  // Functions
  activateGuestMode: () => void;
  setIsLoggedIn: (value: boolean) => void;
  updateToken: (token: string | null) => void;
  logout: () => void;
  handleChangeLanguage: (lang: string) => void;
  showNotification: (message: string, isSuccess: boolean, i18params?: object, duration?: number) => void;
  
  // New header message functions
  addHeaderMessage: (options: AddHeaderMessageOptions) => void;
  addHeaderMessages: (options: AddHeaderMessageOptions[]) => void;
  clearHeaderMessages: () => void;
  setAllHeaderMessagesColor: (color: string | undefined, colorDuration?: number) => void;
  
  // Header functions 
  setHeaderScore: (score: string) => void;
  setHeaderErrors: (errors: string) => void;
  setHeaderStreak: (streak: string) => void;
  setHeaderTime: (time: string) => void;
  setViewerOption: (options: DisplayOptions) => void;
  setAskedAtlas: (atlas: {atlas: string, lut?: ColorMap, mapping? : Record<number,number>, inverseMapping? : Record<number,number>, blindMode?: boolean} | undefined) => void;
  setAskedRegion: (region: number | null) => void;
  setShowHelpOverlay: (show: boolean) => void;
  setShowLegalOverlay: (show: boolean) => void;
  setShowContributorsOverlay: (show: boolean) => void;
  setShowInfoOverlay: (show: boolean) => void;
  setIsMobileView: (isMobile: boolean) => void;
  refreshNextChallenge: (token?: string | null) => void;
  t: (text: string, b?: any|undefined) => string //TFunction<"translation", undefined>;
  copyToClipboard: (text: string) => Promise<boolean>;
  
  // Cache management
  getCacheStats: () => ReturnType<typeof getCacheStats>;
  preloadAtlas: (atlasKey: string) => Promise<void>;
  clearCache: () => void;
  
  // Tooltip system
  tooltip: TooltipState;
  showTooltip: (text: string, x: number, y: number, direction?: string) => void;
  hideTooltip: () => void;
};

// Create the context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Create a provider component
export function AppProvider({ children, pageContext }: { children: React.ReactNode, pageContext: PageContext }) {
  const { t, i18n } = useTranslation("translation", { i18n: i18nInstance });
  const [nvimageModule, setnvimageModule] = useState<NVImageConstructor|null>(null);
  const [preloadedBackgroundMNI, setPreloadedBackgroundMNI] = useState<NVImage|null>(null);
  const [preloadedAtlas, setPreloadedAtlas] = useState<NVImage|null>(null);
  
  let initToken : string | any = null;
  if(typeof localStorage !== 'undefined'){
      initToken = localStorage?.getItem('authToken');
  }
  if(initToken && !isTokenValid(initToken)) {
    initToken = null;
  }
  const initPayload = initToken ? jwtDecode<CustomTokenPayload>(initToken) : null;

  // Authentication state
  const [isGuest, setIsGuest] = useState<boolean>(
    typeof localStorage !== 'undefined' && 
    localStorage && 
    localStorage.getItem('guestMode') === "true" || false
  );
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(initToken ? true : false);
  const [authToken, setAuthToken] = useState<string>(initToken || "");
  const [userUsername, setUserUsername] = useState<string>(initPayload?.username || "");
  const [userFirstName, setUserFirstName] = useState<string>(initPayload?.firstname || "");
  const [userLastName, setUserLastName] = useState<string>(initPayload?.lastname || "");
  const [userIsAdmin, setUserIsAdmin] = useState<boolean>(initPayload?.admin || false);
  const [userPublishToLeaderboard, setUserPublishToLeaderboard] = useState<boolean | null>(initPayload?.publishToLeaderboard || null);

  // UI state
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
  
  // Tooltip state
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    text: '',
    x: 0,
    y: 0,
    direction: "down"
  });
  
  // Header state - New unified message system
  const [headerMessages, setHeaderMessages] = useState<HeaderMessage[]>([]);
  
  // Legacy header state (kept for backward compatibility)
  const [headerErrors, setHeaderErrors] = useState<string>("");
  const [headerStreak, setHeaderStreak] = useState<string>("");
  const [headerScore, setHeaderScore] = useState<string>("");
  const [headerTime, setHeaderTime] = useState<string>("");
  
  // Viewer options
  const [viewerOptions, setViewerOptions] = useState<DisplayOptions>({
    displayType: "MultiPlanarRender",
    radiologicalOrientation: true,
    displayAtlas: true,
    displayOpacity: 0.6,
    brainOpacity: 1.0,
    clipPlane: 2,  // 2 = no clipping (niivue default)
  });
  
  // Atlas data
  const [atlasRegions, setAtlasRegions] = useState<AtlasRegion[]>([]);
  const [askedAtlas, setAskedAtlas] = useState<{atlas: string, lut?: ColorMap, mapping?: Record<number,number>, inverseMapping?: Record<number,number>, blindMode?:boolean}|undefined>(undefined);
  const [askedRegion, setAskedRegion] = useState<number | null>(null);

  // Next Challenge data
  const [nextChallenge, setNextChallenge] = useState<Challenge | null>(null);
  const [nextChallengeLoading, setNextChallengeLoading] = useState<boolean>(true);
  const [nextChallengeError, setNextChallengeError] = useState<string | null>(null);
  const [lastChallengeFetch, setLastChallengeFetch] = useState<number>(0);

  // Mobile view state
  const [isMobileView, setIsMobileView] = useState<boolean>(false);
  
  // Load Niivue module
  useEffect(() => {
    let isMounted = true;
    import('@niivue/niivue').then((mod) => {
      if (isMounted) {
        setnvimageModule(() => mod.NVImage);
        // Initialize the cache with the NVImage module
        niftiCache.initialize(mod.NVImage);
      }
    });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if(typeof window !== 'undefined' && window.localStorage){
      const lang = localStorage.getItem('language');
      if(lang && lang !== i18n.language) {
        setCurrentLanguage(lang);
        i18n.changeLanguage(lang);
      }
    }
  }, [i18n]);
  
  // Load MNI background when niivueModule is available
  useEffect(() => {
    if (nvimageModule) {
      const niiFile = "/atlas/mni152_downsampled.nii.gz";
      loadNIfTIFromCache(niiFile).then((nvImage) => {
        setPreloadedBackgroundMNI(nvImage);
        consoleLog('normal', `🧠 MNI background loaded from cache`);
      }).catch((error: any) => {
        console.error("Error loading NIfTI file:", error);
        showNotification('error_loading_atlas', false, { atlas: 'MNI152' });
        setPreloadedBackgroundMNI(null);
      });
    }
  }, [nvimageModule]);
  
  // Load requested atlas when it changes
  useEffect(() => {
    if (askedAtlas && nvimageModule) {
      const atlas = atlasFiles[askedAtlas.atlas];
      if (atlas) {        
        const niiFile = "/atlas/nii/" + atlas.nii;
        loadNIfTIFromCache(niiFile).then((nvImage) => {
          setPreloadedAtlas(nvImage);
          consoleLog('normal', `🗺️ Atlas ${askedAtlas.atlas} loaded from cache`);
        }).catch((error: any) => {
          console.error("Error loading NIfTI file:", error);
          showNotification('error_loading_atlas', false, { atlas: askedAtlas.atlas });
          setPreloadedAtlas(null);
        });
      }
    }
  }, [askedAtlas, nvimageModule]);

  // Load atlas regions 
  useEffect(() => {
    loadAtlasLabels()
  }, [currentLanguage])

  // Load labels for all atlases
  async function loadAtlasLabels() {
    const loadingAtlasRegions : AtlasRegion[] = [];
    for (const [atlas, { json, name }] of Object.entries(atlasFiles)) {
        try {
            const jsonFile = "/atlas/descr/" + currentLanguage + "/" + json;
            const response = await fetch(jsonFile);
            if (!response.ok) throw new Error(`HTTP ${response.status} for ${atlas}`);
            const labels = await response.json();
            const regions = Object.entries(labels.labels)
                .filter(([id]) => Number(id) > 0 && Number.isInteger(Number(id)))
                .map(([id, label]) => ({
                id: Number(id),
                name: String(label) || `Region ${id}`,
                atlas,
                atlasName: name
                }));
            loadingAtlasRegions.push(...regions);
            consoleLog('verbose', `Loaded ${regions.length} regions for ${atlas} (${name})`);
        } catch (error) {
            console.error(`Failed to load labels for ${atlas}:`, error);
            showNotification('error_loading_atlas', false, { atlas: name });
        }
    }
    consoleLog('verbose', 'Total regions loaded:', atlasRegions.length);
    if (loadingAtlasRegions.length === 0) {
        showNotification('no_regions_loaded', false);
        setAtlasRegions([])
    } else {
        setAtlasRegions(loadingAtlasRegions)
    }
  }
  
  // Notification system
  const [notifications, setNotifications] = useState<
    { id: string; message: string; isSuccess: boolean, removing: boolean }[]
  >([]);
  const showNotification = useCallback((message: string, isSuccess: boolean, i18params = {}, duration=3000) => {
    const id = Date.now() + "-" + Math.floor(Math.random() * 10000); // Unique ID for each notification
    const newNotification = {
      id,
      message: t(message, i18params),
      isSuccess,
      removing: false,
    };
    // Add the new notification to the queue
    setNotifications((prev) => [...prev, newNotification]);
    // Automatically remove the notification after 3 seconds
    setTimeout(() => {
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === id ? { ...notification, removing: true } : notification
        )
      );
      setTimeout(() => {
        setNotifications((prev) => prev.filter((notification) => notification.id !== id));
      }, 500);
    }, duration);
  }, [t]);

  // Overlay system
  const [showHelpOverlay, setShowHelpOverlay] = useState<boolean>(false);
  const [showLegalOverlay, setShowLegalOverlay] = useState<boolean>(false);
  const [showContributorsOverlay, setShowContributorsOverlay] = useState<boolean>(false);
  const [showInfoOverlay, setShowInfoOverlay] = useState<boolean>(false);
  
  // Header message system
  const addHeaderMessages = useCallback((optionsArray: AddHeaderMessageOptions[]) => {
    setHeaderMessages(prev => {
      const now = Date.now();

      // Check if any message has forceClear
      const shouldClear = optionsArray.some(opt => opt.forceClear);

      // Auto-cleanup expired messages before adding new ones
      let base = shouldClear ? [] : prev.filter(msg => !isHeaderMessageExpired(msg, now));

      // Create all new messages
      const newMessages: HeaderMessage[] = optionsArray.map((options, index) => {
        const { text, color, fontSize = undefined, fontWeight = undefined, minDuration = undefined, colorDuration = undefined, infoContent = undefined, infoSource = undefined } = options;
        return {
          id: `${now}-${index}-${Math.random()}`,
          text,
          color,
          fontSize,
          fontWeight,
          minDuration,
          addedAt: now,
          colorDuration,
          colorAddedAt: color ? now : undefined,
          infoContent: infoContent,
          infoSource: infoSource
        };
      });

      // Filter out all duplicate messages
      const result = [...base];
      for (const newMsg of newMessages) {
        const isDuplicate = result.some(msg => msg.text === newMsg.text);
        if (!isDuplicate) {
          result.push(newMsg);
        }
      }

      return result;
    });
  }, []);

  const addHeaderMessage = useCallback((options: AddHeaderMessageOptions) => {
    addHeaderMessages([options]);
  }, [addHeaderMessages]);

  const clearHeaderMessages = useCallback(() => {
    setHeaderMessages([]);
  }, []);

  const setAllHeaderMessagesColor = useCallback((color: string | undefined, colorDuration?: number) => {
    setHeaderMessages(prev => {
      const now = Date.now();
      return prev.map(msg => ({
        ...msg,
        color,
        addedAt: now,
        colorDuration: colorDuration !== undefined ? colorDuration : msg.colorDuration,
        colorAddedAt: color ? now : undefined
      }));
    });
  }, []);

  const isHeaderMessageExpired = (msg: HeaderMessage, now: number) => {
    if (msg.minDuration === undefined){
      return true
    }
    const elapsed = now - msg.addedAt;
    const minDuration = msg.minDuration;
    return elapsed >= minDuration;
  };
  
  // Auto-cleanup expired messages and colors
  useEffect(() => {
    if (headerMessages.length === 0) return;
    
    const checkExpiredMessages = () => {
      const now = Date.now();
      setHeaderMessages(prev => {
        let updated = [...prev];
        
        // First, expire colors if colorDuration has passed
        updated = updated.map(msg => {
          if (msg.color && msg.colorDuration !== undefined && msg.colorAddedAt !== undefined) {
            const colorElapsed = now - msg.colorAddedAt;
            if (colorElapsed >= msg.colorDuration) {
              return { ...msg, color: undefined, colorAddedAt: undefined };
            }
          }
          return msg;
        });
        
        // Then, handle message expiration
        const nonExpired = updated.filter(msg => !isHeaderMessageExpired(msg, now));
        const expired = updated.filter(msg => isHeaderMessageExpired(msg, now));

        // Only cleanup if there are more than one non-expired message
        if (nonExpired.length < 1 && expired.length === 0) {
          return updated;
        }

        // Find the latest expired message (highest addedAt)
        const latestExpired = expired.length > 0
          ? expired.reduce((latest, current) => current.addedAt > latest.addedAt ? current : latest)
          : null;

        // Keep non-expired messages AND all messages with the same addedAt as the latest expired message
        return updated.filter(msg => 
          !isHeaderMessageExpired(msg, now) || 
          (latestExpired && msg.addedAt === latestExpired.addedAt)
        );
      });
    };
    
    const interval = setInterval(checkExpiredMessages, 100);
    return () => clearInterval(interval);
  }, [headerMessages]);
  
  // Language handler
  const handleChangeLanguage = async (lang: string) => {
    consoleLog("verbose", `Changing language from ${currentLanguage} to ${lang}`);
    setCurrentLanguage(lang);
    i18n.changeLanguage(lang);
    if(typeof window !== 'undefined' && window.localStorage) localStorage.setItem('language', lang);
    if(isLoggedIn && authToken) {
        consoleLog("verbose", `Syncing language preference ${lang} to server for logged-in user`);
        try {
            // Send the data to the server
            const response = await fetch('/api/config-user', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({"language": lang}),
            });
            await response.json();
            consoleLog("verbose", `Language preference ${lang} synced to server successfully`);
        } catch (error) {
            // Handle network or other errors
            console.error('Error updating language config:', error);
            consoleLog("verbose", `Failed to sync language preference to server: ${error}`);
        }
    }
  };
  
  // Authentication handlers
  const updateToken = (token: string | null) => {
    consoleLog("verbose", `Updating authentication token: ${token ? 'token provided' : 'token cleared'}`);
    if (token) {
      try {
        // Decode token to get expiration info - use generic payload type for exp
        const payload = jwtDecode<CustomTokenPayload & { exp?: number }>(token);
        if (payload.exp) {
          const expirationDate = new Date(payload.exp * 1000); // Convert from seconds to milliseconds
          const timeUntilExpiry = expirationDate.getTime() - Date.now();
          const minutesUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60));
          
          consoleLog("verbose", `Token expires at: ${expirationDate.toISOString()} (in ${minutesUntilExpiry} minutes)`);
        } else {
          consoleLog("verbose", "Token has no expiration date");
        }
      } catch (error) {
        consoleLog("verbose", "Could not decode token for expiration info");
      }
      
      if(typeof window !== 'undefined' && window.localStorage) localStorage.setItem('authToken', token);
      setAuthToken(token);
      setIsLoggedIn(true);
      consoleLog("verbose", "User logged in successfully, token stored");
    } else {
      if(typeof window !== 'undefined' && window.localStorage) localStorage.removeItem('authToken');
      setAuthToken("");
      setIsLoggedIn(false);
      consoleLog("verbose", "User logged out, token removed");
    }
  };
  
  const logout = () => {
    if(typeof window !== 'undefined' && window.localStorage) localStorage.removeItem('authToken');
    setAuthToken("");
    setIsLoggedIn(false);
    refreshNextChallenge(null);
    if(typeof window !== 'undefined' && 
      (!window.location.href.includes("/welcome") || 
      window.location.href.includes("multiplayer-create"))) {
      window.location.href = '/welcome';
    }
  };
  
  const activateGuestMode = () => {
    setIsGuest(true);
    if(typeof window !== 'undefined' && window.localStorage) localStorage.setItem('guestMode', 'true');
  };

  // Next Challenge functions
  const fetchNextChallenge = async (token?: string | null) => {
    // Avoid fetching too frequently (cache for 30 seconds)
    const now = Date.now();
    if (now - lastChallengeFetch < 30000 && nextChallenge) {
      return;
    }

    try {
      setNextChallengeLoading(true);
      // Fetch both next realtime and next classic challenge
      consoleLog("verbose", "Fetching next challenges from server...", {tokenProvided: !!token});
      const [rtResponse, ccResponse] = await Promise.all([
        fetch('/api/multi/next-realtime-challenge'),
        fetch('/api/multi/next-classic-challenge', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token || (token !== null && isLoggedIn && authToken) ? { 'Authorization': `Bearer ${token || authToken}` } : {})
          }
        })
      ]);

      let rtChallenge = null;
      let ccChallenge = null;

      if (rtResponse.ok) {
        const rtData = await rtResponse.json();
        rtChallenge = rtData.challenge ? {type:"realtime", ...rtData.challenge} : null;
      }

      if (ccResponse.ok) {
        const ccData = await ccResponse.json();
        ccChallenge = ccData.challenge ? {type:"classic", ...ccData.challenge} : null;
      }

      // Decide which challenge is earlier
      let chosenChallenge = null;
      if (rtChallenge && ccChallenge) {
        // Compare startTime (realtime) and startDate (classic)
        const rtTime = new Date(rtChallenge.startTime).getTime();
        const ccTime = new Date(ccChallenge.startDate).getTime();
        chosenChallenge = rtTime <= ccTime ? rtChallenge : ccChallenge;
      } else if (rtChallenge) {
        chosenChallenge = rtChallenge;
      } else if (ccChallenge) {
        chosenChallenge = ccChallenge;
      }
      setNextChallenge(chosenChallenge);
      setNextChallengeError(null);
      setLastChallengeFetch(now);
    } catch (err) {
      console.error('Error fetching next challenge:', err);
      setNextChallengeError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setNextChallengeLoading(false);
    }
  };

  const refreshNextChallenge = (token?: string | null) => {
    setLastChallengeFetch(0); // Reset cache
    setNextChallenge(null); // Clear existing challenge to force refresh
    fetchNextChallenge(token);
  };
   
  // Viewer option handler
  const setViewerOption = (options: DisplayOptions) => {
    setViewerOptions(options);
  };
  
  // Effects for token validation
  useEffect(() => {
    if (authToken && isTokenValid(authToken)) {
      setIsGuest(false);
      setIsLoggedIn(true);
      refreshToken().then((newToken) => {
          consoleLog("verbose", "Token refreshed successfully");
          updateToken(newToken);
      });       
    }
  }, []);

  // Fetch next challenge on mount and periodically
  useEffect(() => {
    fetchNextChallenge();
    
    // Refresh every minute to update countdown
    const interval = setInterval(fetchNextChallenge, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // Automatic token refresh for logged-in users
  useEffect(() => {
    let refreshInterval: NodeJS.Timeout | null = null;

    if (isLoggedIn && authToken) {
      // Log current token expiration when starting refresh interval
      try {
        const payload = jwtDecode<CustomTokenPayload & { exp?: number }>(authToken);
        if (payload.exp) {
          const expirationDate = new Date(payload.exp * 1000);
          const timeUntilExpiry = expirationDate.getTime() - Date.now();
          const minutesUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60));
          consoleLog("verbose", `Starting automatic token refresh - current token expires at: ${expirationDate.toISOString()} (in ${minutesUntilExpiry} minutes)`);
        }
      } catch (error) {
        consoleLog("verbose", "Starting automatic token refresh - could not decode current token expiration");
      }
      
      refreshInterval = setInterval(async () => {
        try {
          consoleLog("verbose", "Attempting automatic token refresh");
          const newToken = await refreshToken();
          
          if (newToken) {
            consoleLog("verbose", "Token refreshed successfully");
            updateToken(newToken);
          } else {
            consoleLog("verbose", "Token refresh failed - logging out user");
            logout();
            showNotification('session_expired', false);
          }
        } catch (error) {
          console.error('Token refresh error:', error);
          consoleLog("verbose", `Token refresh error: ${error}`);
          logout();
          showNotification('session_expired', false);
        }
      }, 5*60000); // Refresh 5 minute (5*60,000 ms)
    }

    // Cleanup function
    return () => {
      if (refreshInterval) {
        consoleLog("verbose", "Stopping automatic token refresh");
        clearInterval(refreshInterval);
      }
    };
  }, [isLoggedIn, authToken]);
  
  // Effect to update user info when logged in
  useEffect(() => {
    if (isLoggedIn && authToken) {
      setIsGuest(false);
      if(localStorage !== undefined) localStorage.setItem('guestMode', 'false');
      consoleLog("verbose", "Processing user authentication token for user info extraction");

      
      try {
        const payload = jwtDecode<CustomTokenPayload>(authToken);
        consoleLog("verbose", `Decoded JWT payload for user: ${payload.username}, id: ${payload.id}`);
        setUserUsername(payload.username ? payload.username.normalize('NFC') : t('default_user'));
        setUserFirstName(payload.firstname ? payload.firstname.normalize('NFC') : t('default_user'));
        setUserLastName(payload.lastname || "");
        setUserIsAdmin(payload.admin || false);
        setUserPublishToLeaderboard(
          payload.publishToLeaderboard === undefined ? null : payload.publishToLeaderboard
        );
        if (typeof window !== 'undefined' && (window as any).umami && payload.id) {
          consoleLog("verbose", `Identifying user ${payload.id} to analytics`);
          (window as any).umami.identify(payload.id, {username: payload.username || ""})
        }
        consoleLog("verbose", `User info loaded: ${payload.username}, leaderboard: ${payload.publishToLeaderboard}`);
      } catch (error) {
        console.error("Error decoding token:", error);
        consoleLog("verbose", `Token decode failed, logging out user: ${error}`);
        logout();
      }
    }
  }, [isLoggedIn, authToken, t]);

  const copyToClipboard = async (text: string) : Promise<boolean> => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      // Modern approach (Chrome, Edge, etc.)
      return navigator.clipboard.writeText(text)
        .then(() => true)
        .catch(() => {
          // Fall back to execCommand if Clipboard API fails
          return fallbackCopyToClipboard(text);
        });
    } else {
      // Fallback for Firefox and older browsers
      return fallbackCopyToClipboard(text);
    }
  };

  const fallbackCopyToClipboard = (text: string): boolean => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      // Make the textarea out of viewport
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch (err) {
      console.error('Failed to copy text: ', err);
      return false;
    }
  };
  
  // Tooltip functions
  const showTooltip = (text: string, x: number, y: number, direction: string = "down") => {
    setTooltip({ visible: true, text, x, y, direction });
  };
  
  const hideTooltip = () => {
    setTooltip(prev => ({ ...prev, visible: false }));
  };
  
  return (
    <AppContext.Provider value={{
      // Page context
      pageContext,

      // Authentication state
      isGuest,
      isLoggedIn,
      authToken,
      userUsername,
      userFirstName,
      userLastName,
      userIsAdmin,
      userPublishToLeaderboard,
      
      // UI state
      currentLanguage,
      notifications,
      
      // Header state - New unified message system
      headerMessages,
      
      // Legacy header state
      headerErrors,
      headerStreak,
      headerScore,
      headerTime,
      
      // Viewer options
      viewerOptions,
      
      // Atlas data
      atlasRegions,
      askedAtlas,
      askedRegion,
      
      // Next Challenge data
      nextChallenge,
      nextChallengeLoading,
      nextChallengeError,
      
      // Niivue module
      nvimageModule,
      preloadedBackgroundMNI,
      preloadedAtlas,
      isMobileView,

      // Overlay state
      showHelpOverlay,
      showLegalOverlay,
      showContributorsOverlay,
      showInfoOverlay,
      
      // Functions
      activateGuestMode,
      setIsLoggedIn,
      updateToken,
      logout,
      handleChangeLanguage,
      showNotification,
      
      // New header message functions
      addHeaderMessage, addHeaderMessages,
      clearHeaderMessages,
      setAllHeaderMessagesColor,
      
      // Legacy header functions
      setHeaderScore,
      setHeaderErrors,
      setHeaderStreak,
      setHeaderTime,
      setViewerOption,
      setAskedAtlas,
      setAskedRegion,
      setShowHelpOverlay,
      setShowLegalOverlay,
      setShowContributorsOverlay,
      setShowInfoOverlay,
      setIsMobileView,
      refreshNextChallenge,
      copyToClipboard,

      // language functions
      t,
      
      // Cache management functions
      getCacheStats,
      preloadAtlas,
      clearCache: niftiCache.clearCache,
      
      // Tooltip functions
      tooltip,
      showTooltip,
      hideTooltip
    }}>
      {children}
      {/* Global tooltip component */}
      {tooltip.visible && (
        <div 
          className={`info-tooltip-fixed-${tooltip.direction}`}
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`
          }}
        >
          {tooltip.text}
        </div>
      )}
    </AppContext.Provider>
  );
}

// Create a custom hook for using the context
export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
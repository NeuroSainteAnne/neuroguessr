import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { isTokenValid, refreshToken } from '../utils/helper_login';
import { jwtDecode } from 'jwt-decode';
import type { AtlasRegion, DisplayOptions, CustomTokenPayload, ColorMap } from '../types';
import i18nInstance from './i18n';
import type { PageContext } from 'vike/types'
import atlasFiles from '../utils/atlas_files';
import { useTranslation } from 'react-i18next';
import type { NVImage } from '@niivue/niivue';
import { niftiCache, loadNIfTIFromCache, getCacheStats, preloadAtlas, warmupCache } from '../utils/nifti_cache';
import { startAtlasSession, endAtlasSession, getPreloadRecommendations } from '../utils/atlas_usage_tracker';
import { consoleLog } from '../utils/logging';

type NVImageConstructor = {
  new (): NVImage;
  loadFromUrl(options: { url: string }): Promise<NVImage>;
}

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
  userPublishToLeaderboard: boolean | null;
  
  // UI state
  currentLanguage: string;
  notifications: { id: string; message: string; isSuccess: boolean, removing: boolean }[];
  
  // Header state
  headerText: string;
  headerTextMode: string;
  headerScore: string;
  headerErrors: string;
  headerStreak: string;
  headerTime: string;
  
  // Viewer options
  viewerOptions: DisplayOptions;
  
  // Overlays
  showHelpOverlay: boolean;
  showLegalOverlay: boolean;

  // Atlas data
  atlasRegions: AtlasRegion[];
  askedAtlas: {atlas: string, lut?: ColorMap, mapping? : Record<number,number>, inverseMapping? : Record<number,number>, blindMode?: boolean} | undefined;
  askedRegion: number | null;
  
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
  setHeaderText: (text: string) => void;
  setHeaderTextMode: (mode: string) => void;
  setHeaderScore: (score: string) => void;
  setHeaderErrors: (errors: string) => void;
  setHeaderStreak: (streak: string) => void;
  setHeaderTime: (time: string) => void;
  setViewerOption: (options: DisplayOptions) => void;
  setAskedAtlas: (atlas: {atlas: string, lut?: ColorMap, mapping? : Record<number,number>, inverseMapping? : Record<number,number>, blindMode?: boolean} | undefined) => void;
  setAskedRegion: (region: number | null) => void;
  setShowHelpOverlay: (show: boolean) => void;
  setShowLegalOverlay: (show: boolean) => void;
  setIsMobileView: (isMobile: boolean) => void;
  t: (text: string, b?: any|undefined) => string //TFunction<"translation", undefined>;
  copyToClipboard: (text: string) => Promise<boolean>;
  
  // Cache management
  getCacheStats: () => ReturnType<typeof getCacheStats>;
  preloadAtlas: (atlasKey: string) => Promise<void>;
  warmupCache: (atlasKeys: string[]) => Promise<void>;
  clearCache: () => void;
};

// Create the context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Create a provider component
export function AppProvider({ children, pageContext }: { children: React.ReactNode, pageContext: PageContext }) {
  const { t, i18n } = useTranslation("translation", { i18n: i18nInstance });
  const [nvimageModule, setnvimageModule] = useState<NVImageConstructor|null>(null);
  const [preloadedBackgroundMNI, setPreloadedBackgroundMNI] = useState<NVImage|null>(null);
  const [preloadedAtlas, setPreloadedAtlas] = useState<NVImage|null>(null);
  
  // Authentication state
  const isClientSide = typeof document !== 'undefined';
  const [isGuest, setIsGuest] = useState<boolean>(
    typeof localStorage !== 'undefined' && 
    localStorage && 
    localStorage.getItem('guestMode') === "true" || false
  );
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string>(
    typeof localStorage !== 'undefined' ? localStorage?.getItem('authToken') || "" : ""
  );
  const [userUsername, setUserUsername] = useState<string>("");
  const [userFirstName, setUserFirstName] = useState<string>("");
  const [userLastName, setUserLastName] = useState<string>("");
  const [userPublishToLeaderboard, setUserPublishToLeaderboard] = useState<boolean | null>(null);
  
  // UI state
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
  
  // Header state
  const [headerText, setHeaderText] = useState<string>("");
  const [headerTextMode, setHeaderTextMode] = useState<string>("");
  const [headerScore, setHeaderScore] = useState<string>("");
  const [headerErrors, setHeaderErrors] = useState<string>("");
  const [headerStreak, setHeaderStreak] = useState<string>("");
  const [headerTime, setHeaderTime] = useState<string>("");
  
  // Viewer options
  const [viewerOptions, setViewerOptions] = useState<DisplayOptions>({
    displayType: "MultiPlanarRender",
    radiologicalOrientation: true,
    displayAtlas: true,
    displayOpacity: 0.6,
  });
  
  // Atlas data
  const [atlasRegions, setAtlasRegions] = useState<AtlasRegion[]>([]);
  const [askedAtlas, setAskedAtlas] = useState<{atlas: string, lut?: ColorMap, mapping?: Record<number,number>, inverseMapping?: Record<number,number>, blindMode?:boolean}|undefined>(undefined);
  const [askedRegion, setAskedRegion] = useState<number | null>(null);

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
        // Track atlas usage for smart preloading
        startAtlasSession(askedAtlas.atlas);
        
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
    
    // End previous atlas session when switching atlases
    return () => {
      if (askedAtlas) {
        endAtlasSession();
      }
    };
  }, [askedAtlas, nvimageModule]);

  // Load atlas regions 
  useEffect(() => {
    loadAtlasLabels()
  }, [currentLanguage])

  // Preload popular atlases when the app starts
  useEffect(() => {
    if (nvimageModule) {
      setTimeout(() => {
        // Get smart recommendations based on user's historical usage
        const recommendations = getPreloadRecommendations(4);
        consoleLog('normal', `🤖 Smart preloading recommendations: ${recommendations.join(', ')}`);

        warmupCache(recommendations).then(() => {
          consoleLog('verbose', `🔥 Smart atlas preloading completed successfully`);
        }).catch(error => {
          consoleLog('normal', `⚠️ Smart atlas preloading failed: ${error}`);
        });
      }, 2000); // Wait 2 seconds after app initialization
    }
  }, [nvimageModule]);

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
            //console.log(`Loaded ${regions.length} regions for ${atlas} (${name})`);
        } catch (error) {
            console.error(`Failed to load labels for ${atlas}:`, error);
            showNotification('error_loading_atlas', false, { atlas: name });
        }
    }
    //console.log('Total regions loaded:', atlasRegions.length);
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
  const showNotification = (message: string, isSuccess: boolean, i18params = {}, duration=3000) => {
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
  };

  // Overlay system
  const [showHelpOverlay, setShowHelpOverlay] = useState<boolean>(false);
  const [showLegalOverlay, setShowLegalOverlay] = useState<boolean>(false);
  
  // Language handler
  const handleChangeLanguage = async (lang: string) => {
    setCurrentLanguage(lang);
    i18n.changeLanguage(lang);
    if(typeof window !== 'undefined' && window.localStorage) localStorage.setItem('language', lang);
    if(isLoggedIn && authToken) {
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
        } catch (error) {
            // Handle network or other errors
            console.error('Error updating language config:', error);
        }
    }
  };
  
  // Authentication handlers
  const updateToken = (token: string | null) => {
    if (token) {
      if(typeof window !== 'undefined' && window.localStorage) localStorage.setItem('authToken', token);
      setAuthToken(token);
      setIsLoggedIn(true);
    } else {
      if(typeof window !== 'undefined' && window.localStorage) localStorage.removeItem('authToken');
      setAuthToken("");
      setIsLoggedIn(false);
    }
  };
  
  const logout = () => {
    if(typeof window !== 'undefined' && window.localStorage) localStorage.removeItem('authToken');
    setAuthToken("");
    setIsLoggedIn(false);
  };
  
  const activateGuestMode = () => {
    setIsGuest(true);
    if(typeof window !== 'undefined' && window.localStorage) localStorage.setItem('guestMode', 'true');
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
    }
  }, []);
  
  // Effect to update user info when logged in
  useEffect(() => {
    if (isLoggedIn && authToken) {
      setIsGuest(false);
      if(localStorage !== undefined) localStorage.setItem('guestMode', 'false');

      
      try {
        const payload = jwtDecode<CustomTokenPayload>(authToken);
        setUserUsername(payload.username ? payload.username.normalize('NFC') : t('default_user'));
        setUserFirstName(payload.firstname ? payload.firstname.normalize('NFC') : t('default_user'));
        setUserLastName(payload.lastname || "");
        setUserPublishToLeaderboard(
          payload.publishToLeaderboard === undefined ? null : payload.publishToLeaderboard
        );
        if (typeof window !== 'undefined' && (window as any).umami && payload.id) {
          (window as any).umami.identify(payload.id, {username: payload.username || ""})
        }
      } catch (error) {
        console.error("Error decoding token:", error);
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
      userPublishToLeaderboard,
      
      // UI state
      currentLanguage,
      notifications,
      
      // Header state
      headerText,
      headerTextMode,
      headerScore,
      headerErrors,
      headerStreak,
      headerTime,
      
      // Viewer options
      viewerOptions,
      
      // Atlas data
      atlasRegions,
      askedAtlas,
      askedRegion,
      
      // Niivue module
      nvimageModule,
      preloadedBackgroundMNI,
      preloadedAtlas,
      isMobileView,

      // Overlay state
      showHelpOverlay,
      showLegalOverlay,
      
      // Functions
      activateGuestMode,
      setIsLoggedIn,
      updateToken,
      logout,
      handleChangeLanguage,
      showNotification,
      setHeaderText,
      setHeaderTextMode,
      setHeaderScore,
      setHeaderErrors,
      setHeaderStreak,
      setHeaderTime,
      setViewerOption,
      setAskedAtlas,
      setAskedRegion,
      setShowHelpOverlay,
      setShowLegalOverlay,
      setIsMobileView,
      copyToClipboard,

      // language functions
      t,
      
      // Cache management functions
      getCacheStats,
      preloadAtlas,
      warmupCache,
      clearCache: niftiCache.clearCache
    }}>
      {children}
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
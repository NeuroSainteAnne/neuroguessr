import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { isTokenValid, refreshToken } from '../utils/helper_login';
import { jwtDecode } from 'jwt-decode';
import type { AtlasRegion, DisplayOptions, CustomTokenPayload } from '../types';
import i18nInstance from './i18n';
import type { PageContext } from 'vike/types'
import atlasFiles from '../utils/atlas_files';
import { useTranslation } from 'react-i18next';
import type { NVImage } from '@niivue/niivue';

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
  notificationMessage: string | null;
  notificationStatus: "error" | "success";
  
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
  askedAtlas: string | null;
  askedRegion: number | null;
  
  // Niivue module
  nvimageModule: NVImageConstructor | null;
  preloadedBackgroundMNI: NVImage | null;
  preloadedAtlas: NVImage | null;
  
  // Functions
  activateGuestMode: () => void;
  setIsLoggedIn: (value: boolean) => void;
  updateToken: (token: string | null) => void;
  logout: () => void;
  handleChangeLanguage: (lang: string) => void;
  showNotification: (message: string, isSuccess: boolean, i18params?: object) => void;
  setHeaderText: (text: string) => void;
  setHeaderTextMode: (mode: string) => void;
  setHeaderScore: (score: string) => void;
  setHeaderErrors: (errors: string) => void;
  setHeaderStreak: (streak: string) => void;
  setHeaderTime: (time: string) => void;
  setViewerOption: (options: DisplayOptions) => void;
  setAskedAtlas: (atlas: string | null) => void;
  setAskedRegion: (region: number | null) => void;
  setShowHelpOverlay: (show: boolean) => void;
  setShowLegalOverlay: (show: boolean) => void;
  t: (text: string, b?: any|undefined) => string //TFunction<"translation", undefined>;
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
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<"error" | "success">("success");
  
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
  const [askedAtlas, setAskedAtlas] = useState<string | null>(null);
  const [askedRegion, setAskedRegion] = useState<number | null>(null);
  
  // Load Niivue module
  useEffect(() => {
    let isMounted = true;
    import('@niivue/niivue').then((mod) => {
      if (isMounted) {
        setnvimageModule(() => mod.NVImage);
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
      nvimageModule.loadFromUrl({url: niiFile}).then((nvImage) => {
        setPreloadedBackgroundMNI(nvImage);
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
      const atlas = atlasFiles[askedAtlas];
      if (atlas) {
        const niiFile = "/atlas/nii/" + atlas.nii;
        nvimageModule.loadFromUrl({url: niiFile}).then((nvImage) => {
          setPreloadedAtlas(nvImage);
        }).catch((error: any) => {
          console.error("Error loading NIfTI file:", error);
          showNotification('error_loading_atlas', false, { atlas: askedAtlas });
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
  const showNotification = (message: string, isSuccess: boolean, i18params = {}) => {
    setNotificationStatus(isSuccess ? 'success' : 'error');
    setNotificationMessage(t(message, i18params));
    setTimeout(() => { setNotificationMessage(null) }, 3000);
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
  
  // Application features
  const launchNeurotheka = async (region: Partial<AtlasRegion>) => {
    updateToken(await refreshToken());
    if (region.atlas) setAskedAtlas(region.atlas);
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
      notificationMessage,
      notificationStatus,
      
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

      // language functions
      t
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
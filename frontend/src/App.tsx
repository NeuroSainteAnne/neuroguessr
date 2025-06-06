import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import Header from './Header'
import WelcomeScreen from './WelcomeScreen'
import i18n from 'i18next';
import { useTranslation } from "react-i18next";
const GameScreen = lazy(() => import('./GameScreen'));
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';
import ValidateEmailScreen from './ValidateEmailScreen';
import LandingPage from './LandingPage';
import Stats from './Stats';
import { isTokenValid, refreshToken } from './helper_login';
import ResetPasswordScreen from './ResetPasswordScreen';
import UserConfig from './UserConfig';
import atlasFiles from './atlas_files'
const Neurotheka = lazy(() => import('./Neurotheka'));
const MultiplayerGameScreen = lazy(() => import('./MultiplayerGameScreen'));
import { jwtDecode } from 'jwt-decode';

function App(myi18n?: any) {
   const [niivueModule, setNiivueModule] = useState<any>(null);
   useEffect(() => {
      let isMounted = true;
      import('@niivue/niivue').then((mod) => {
         if (isMounted) {
            setNiivueModule(mod)
         }
      });
      return () => { isMounted = false; };
   }, []);

   const isClientSide = typeof document !== 'undefined';
   const [isGuest, setIsGuest] = useState<boolean>(typeof localStorage !== 'undefined' && localStorage && localStorage.getItem('guestMode') == "true" || false)
   const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false)
   const [authToken, setAuthToken] = useState<string>(typeof localStorage !== 'undefined' ? localStorage?.getItem('authToken') || "" : "")
   const location = useLocation();
   const [userUsername, setUserUsername] = useState<string>("")
   const [userFirstName, setUserFirstName] = useState<string>("")
   const [userLastName, setUserLastName] = useState<string>("")
   const [userPublishToLeaderboard, setUserPublishToLeaderboard] = useState<boolean|null>(null)
   const [atlasRegions, setAtlasRegions] = useState<AtlasRegion[]>([])
   const { t, i18n } = myi18n?.myi18n || useTranslation();
   const [currentLanguage, setCurrentLanguage] = useState(i18n.language)
   const handleChangeLanguage = (lang: string) => {
      setCurrentLanguage(lang);
      i18n.changeLanguage(lang);
   }
   const notificationRef = useRef<HTMLInputElement>(null);
   const [notificationMessage, setNotificationMessage] = useState<string|null>(null)
   const [notificationStatus, setNotificationStatus] = useState<"error"|"success">("success")
   const [preloadedBackgroundMNI, setPreloadedBackgroundMNI] = useState<any|null>(null)
   const [askedAtlas, setAskedAtlas] = useState<string|null>(null)
   const [preloadedAtlas, setPreloadedAtlas] = useState<any|null>(null)
   const [loadEnforcer, setLoadEnforcer] = useState<number>(0)
   const [headerText, setHeaderText] = useState<string>("")
   const [headerTextMode, setHeaderTextMode] = useState<string>("")
   const [headerScore, setHeaderScore] = useState<string>("")
   const [headerErrors, setHeaderErrors] = useState<string>("")
   const [headerStreak, setHeaderStreak] = useState<string>("")
   const [headerTime, setHeaderTime] = useState<string>("")
   const [viewerOptions, setViewerOption] = useState<DisplayOptions>({
      displayType: "MultiPlanarRender",
      radiologicalOrientation: true,
      displayAtlas: true,
      displayOpacity: 0.6,
   })
  const [showHelpOverlay, setShowHelpOverlay] = useState<boolean>(false);
  const [showLegalOverlay, setShowLegalOverlay] = useState<boolean>(false);
  const helpContentRef = useRef<HTMLDivElement>(null);
  const legalContentRef = useRef<HTMLDivElement>(null);
  const helpButtonRef = useRef<HTMLDivElement>(null);
   const headerRef = useRef<HTMLDivElement>(null);
   const lowerBarRef = useRef<HTMLDivElement>(null);
   const pageContainerRef = useRef<HTMLDivElement>(null);

   useEffect(() => {
      const cleanup = async () => {
      updateToken(await refreshToken());
      setHeaderText("");
      setHeaderTextMode("normal");
      };
      cleanup();
   }, [location]); // This effect will run every time the location changes

   const activateGuestMode = () => {
      setIsGuest(true);
      localStorage.setItem('guestMode', 'true');
   }

   useEffect(() => {
      const rootElem = document.getElementById("root")
      if(rootElem) rootElem.style.opacity = "1";
      const loadElem = document.getElementById("loading-screen")
      if(loadElem) loadElem.style.display = "none";

      if (authToken && isTokenValid(authToken)) {
         setIsGuest(false);
         setIsLoggedIn(true);
      }
   }, [])

   useEffect(()=>{
      if(niivueModule){
         const niiFile = "/assets/atlas/mni152_downsampled.nii.gz";
         niivueModule.NVImage.loadFromUrl({url: niiFile}).then((nvImage: any) => {
            setPreloadedBackgroundMNI(nvImage);
         }).catch((error: any) => {
            console.error("Error loading NIfTI file:", error);
            showNotification('error_loading_atlas', false, { atlas: askedAtlas });
            setPreloadedBackgroundMNI(null)
         });
      }
   }, [niivueModule])

   useEffect(() => {
      loadAtlasLabels()
   }, [currentLanguage])

   // Load labels for all atlases
   async function loadAtlasLabels() {
      const loadingAtlasRegions : AtlasRegion[] = [];
      for (const [atlas, { json, name }] of Object.entries(atlasFiles)) {
         try {
            const jsonFile = "/assets/atlas/descr/" + currentLanguage + "/" + json;
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

   const showNotification = (message: string, isSuccess: boolean, i18params={}) => {
      setNotificationStatus(isSuccess ? 'success' : 'error');
      setNotificationMessage(t(message, i18params))
      setTimeout(() => {setNotificationMessage("")}, 3000);
   }

   const updateToken = (token: string|null) => {
      if(token){
         localStorage.setItem('authToken', token);
         setAuthToken(token);
         setIsLoggedIn(true);
      } else {
         localStorage.removeItem('authToken');
         setAuthToken("");
         setIsLoggedIn(false);
      }
   }

   const logout = () => {
      localStorage.removeItem('authToken');
      setAuthToken("");
      setIsLoggedIn(false);
   }

   const launchNeurotheka = async (region: Partial<AtlasRegion>) => {
      updateToken(await refreshToken());
      if(region.atlas) setAskedAtlas(region.atlas);
   }

   const launchSinglePlayerGame = async (atlas: string, mode: string) => {
      updateToken(await refreshToken());
      setAskedAtlas(atlas);
   }

   useEffect(() => {
      if (askedAtlas) {
         const atlas = atlasFiles[askedAtlas];
         if (atlas && niivueModule) {
            const niiFile = "/assets/atlas/nii/" + atlas.nii;
            niivueModule.NVImage.loadFromUrl({url: niiFile}).then((nvImage: any) => {
               setPreloadedAtlas(nvImage);
            }).catch((error: any) => {
               console.error("Error loading NIfTI file:", error);
               showNotification('error_loading_atlas', false, { atlas: askedAtlas });
               setPreloadedAtlas(null)
            });
         }
      }
   }, [askedAtlas, niivueModule])

   useEffect(() => {
      if (isLoggedIn) {
         setIsGuest(false);
         localStorage.setItem('guestMode', 'false');
         const payload = jwtDecode<CustomTokenPayload>(authToken)
         setUserUsername(payload.username ? payload.username.normalize('NFC') : t('default_user'))
         setUserFirstName(payload.firstname ? payload.firstname.normalize('NFC') : t('default_user'))
         setUserLastName(payload.lastname || "")
         setUserPublishToLeaderboard(payload.publishToLeaderboard === undefined ? null : payload.publishToLeaderboard)
      }
   }, [isLoggedIn, authToken])

   useEffect(() => {
      const handleClick = (event: MouseEvent) => {
         if (
            showHelpOverlay &&
            helpContentRef.current &&
            helpButtonRef.current &&
            !helpButtonRef.current.contains(event.target as Node) &&
            !helpContentRef.current.contains(event.target as Node)
         ) {
            setShowHelpOverlay(false);
         }
      };
      document.addEventListener('click', handleClick);
      return () => {
         document.removeEventListener('click', handleClick);
      };
   }, [showHelpOverlay])

   const callback: AppCallback = {
      handleChangeLanguage: handleChangeLanguage,
      activateGuestMode: activateGuestMode,
      setIsLoggedIn: setIsLoggedIn,
      updateToken: updateToken,
      logout: logout,
      launchNeurotheka: launchNeurotheka,
      setHeaderText: setHeaderText,
      setHeaderTextMode: setHeaderTextMode,
      setHeaderScore: setHeaderScore,
      setHeaderErrors: setHeaderErrors,
      setHeaderStreak: setHeaderStreak,
      setHeaderTime: setHeaderTime,
      setViewerOption: setViewerOption,
      launchSinglePlayerGame: launchSinglePlayerGame
   }

   return (
      <>
      <link rel="stylesheet" href="/assets/styles/main.css" />
      <link rel="stylesheet" href="/assets/styles/App.css" />
      <link rel="stylesheet" href="/assets/styles/Help.css" />
      <div className="main-container">
         <Header ref={headerRef} currentLanguage={currentLanguage} atlasRegions={atlasRegions}
            isLoggedIn={isLoggedIn} t={t} callback={callback}
            userFirstName={userFirstName} userLastName={userLastName} 
            headerText={headerText} headerTextMode={headerTextMode}
            headerScore={headerScore} headerErrors={headerErrors}
            headerStreak={headerStreak} headerTime={headerTime}
            viewerOptions={viewerOptions} />
            <div ref={pageContainerRef} className="page-container">
               <Routes>
                  <Route path="/" element={<Navigate to="/welcome" replace />} />
                  <Route path="/welcome" element={ <>
                     {!isGuest && !isLoggedIn && <LandingPage t={t} callback={callback} />}
                     {(isGuest || isLoggedIn) && <WelcomeScreen t={t} callback={callback} atlasRegions={atlasRegions} 
                        isLoggedIn={isLoggedIn} authToken={authToken} userUsername={userUsername} />}
                  </>} />
                  <Route path="/welcome/*" element={ <>
                     <WelcomeScreen t={t} callback={callback} atlasRegions={atlasRegions} 
                        isLoggedIn={isLoggedIn} authToken={authToken} userUsername={userUsername} />
                  </>} />
                  <Route path="/singleplayer/:askedAtlas?/:gameMode?" element={
                     (isClientSide?
                        <GameScreen t={t} callback={callback} currentLanguage={currentLanguage}
                           atlasRegions={atlasRegions} 
                           preloadedAtlas={preloadedAtlas}
                           preloadedBackgroundMNI={preloadedBackgroundMNI} 
                           viewerOptions={viewerOptions}
                           loadEnforcer={loadEnforcer}
                           isLoggedIn={isLoggedIn} authToken={authToken}
                           userPublishToLeaderboard={userPublishToLeaderboard}
                           niivueModule={niivueModule} />
                        :
                        <Suspense fallback={<LoadingScreen/>}>
                           <GameScreen t={t} callback={callback} currentLanguage={currentLanguage}
                              atlasRegions={atlasRegions} 
                              preloadedAtlas={preloadedAtlas}
                              preloadedBackgroundMNI={preloadedBackgroundMNI} 
                              viewerOptions={viewerOptions}
                              loadEnforcer={loadEnforcer}
                              isLoggedIn={isLoggedIn} authToken={authToken}
                              userPublishToLeaderboard={userPublishToLeaderboard}
                              niivueModule={niivueModule} />
                        </Suspense>)
                     } />
                  <Route path="/multiplayer-game/:askedSessionCode?/:askedSessionToken?" element={
                     (isClientSide?
                        <MultiplayerGameScreen t={t} callback={callback} authToken={authToken} isLoggedIn={isLoggedIn} userUsername={userUsername} 
                        loadEnforcer={loadEnforcer}
                        viewerOptions={viewerOptions}
                        preloadedBackgroundMNI={preloadedBackgroundMNI} 
                        currentLanguage={currentLanguage}
                        niivueModule={niivueModule} />
                        : <Suspense fallback={<LoadingScreen/>}>
                           <MultiplayerGameScreen t={t} callback={callback} authToken={authToken} isLoggedIn={isLoggedIn} userUsername={userUsername} 
                           loadEnforcer={loadEnforcer}
                           viewerOptions={viewerOptions}
                           preloadedBackgroundMNI={preloadedBackgroundMNI} 
                           currentLanguage={currentLanguage}
                           niivueModule={niivueModule} /></Suspense>)
                     } />
                  <Route path="/login" element={<LoginScreen t={t} callback={callback} currentLanguage={currentLanguage} />} />
                  <Route path="/register" element={<RegisterScreen t={t} callback={callback} currentLanguage={currentLanguage} />} />
                  <Route path="/validate" element={<ValidateEmailScreen t={t} callback={callback} />} />
                  <Route path="/resetpwd" element={<ResetPasswordScreen t={t} callback={callback} />} />
                  <Route path="/configuration" element={<UserConfig t={t} callback={callback} authToken={authToken} />} />
                  <Route path="/stats" element={<Stats t={t} callback={callback} authToken={authToken} />} />
                  <Route path="/neurotheka/:askedAtlas?/:askedRegion?" element={
                     (isClientSide?
                        <Neurotheka t={t} callback={callback} currentLanguage={currentLanguage}
                        atlasRegions={atlasRegions} 
                        preloadedAtlas={preloadedAtlas}
                        preloadedBackgroundMNI={preloadedBackgroundMNI} 
                        viewerOptions={viewerOptions}
                        loadEnforcer={loadEnforcer}
                        niivueModule={niivueModule} />
                        :
                     <Suspense fallback={<LoadingScreen/>}><Neurotheka t={t} callback={callback} currentLanguage={currentLanguage}
                        atlasRegions={atlasRegions} 
                        preloadedAtlas={preloadedAtlas}
                        preloadedBackgroundMNI={preloadedBackgroundMNI} 
                        viewerOptions={viewerOptions}
                        loadEnforcer={loadEnforcer}
                        niivueModule={niivueModule} /></Suspense>)
                  } />
                  <Route path="*" element={<div>Page not found</div>} />
               </Routes>
            <div className='lower-bar-phantom'></div>
            {notificationMessage && 
               <div id="notification" ref={notificationRef} className={notificationStatus}>{notificationMessage}</div>}
         </div>     
      </div> 
         
         {location.pathname.includes("welcome") && <>
            {showHelpOverlay && <div id="help-overlay" className="help-overlay">
               <div className="help-content" ref={helpContentRef}>
                  <button id="close-help" className="close-button" onClick={() => setShowHelpOverlay(false)}>&times;</button>
                  <h2 data-i18n="help_title">{t("help_title")}</h2>
                  <section>
                     <h3>{t("help_presentation_title")}</h3>
                     <p>{t("help_presentation_text")}</p>
                  </section>
                  <section>
                     <h3>{t("help_modes_title")}</h3>
                     <p dangerouslySetInnerHTML={{ __html: t("help_modes_navigation") }}></p>
                     <p dangerouslySetInnerHTML={{ __html: t("help_modes_practice") }}></p>
                     <p dangerouslySetInnerHTML={{ __html: t("help_modes_streak") }}></p>
                     <p dangerouslySetInnerHTML={{ __html: t("help_modes_time_attack") }}></p>
                  </section>
               </div>
            </div>}

            <div ref={helpButtonRef}>
               <button id="help-button" className="help-button" onClick={() => setShowHelpOverlay(true)}>
                  <i className="fas fa-question"></i>
               </button>
            </div>
         </>}

         {showLegalOverlay && <div id="legal-overlay" className="help-overlay">
            <div className="help-content" ref={legalContentRef}>
               <button id="close-help" className="close-button" onClick={() => setShowLegalOverlay(false)}>&times;</button>
               <h2>{t("legal_mentions_title")}</h2>
               <section>
                  <h3>{t("legal_mentions_license_title")}</h3>
                  <p dangerouslySetInnerHTML={{ __html: t("legal_mention_license") }}></p>
                  <p>{t("legal_mention_atlas")}</p>
                  <p dangerouslySetInnerHTML={{
                     __html: t("help_atlases_text").replace(
                        /\[doi:([^\]]+)\]/g,
                        (_match: string, doi: string) => `<a href="https://doi.org/${doi}" target='_blank'>${doi}</a>`
                     )
                  }}></p>
               </section>
               <section>
                  <h3>{t("legal_mentions_pedagogy_title")}</h3>
                  <p>{t("legal_mentions_pedagogy")}</p>
               </section>
            </div>
         </div>}

         
         <div ref={lowerBarRef} className='lower-bar'>
            <a
               href="https://github.com/FRramon/neuroguessr_web/"
               target="_blank"
               rel="noopener noreferrer"
            >
               <svg height="32" width="32" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className='lower-logo-github'>
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
               </svg>
            </a>
            <a
               href="https://www.ghu-paris.fr/"
               target="_blank"
               rel="noopener noreferrer"
            >
               <img src="/assets/interface/logo-ghu-64.png" alt="GHU Paris" className='lower-logo-ghu'/>
            </a>
            <a
               href="https://ipnp.paris5.inserm.fr/"
               target="_blank"
               rel="noopener noreferrer"
            >
               <img src="/assets/interface/logo-ipnp-64.png" alt="IPNP" className='lower-logo-ipnp'/>
            </a>
            <a
               href="https://u-paris.fr/"
               target="_blank"
               rel="noopener noreferrer"
            >
               <img src="/assets/interface/logo-upc-64.png" alt="Université Paris Cité"  className='lower-logo-upc'/>
            </a>
            <a onClick={(e) => setShowLegalOverlay(true)}>
               <span role="img" aria-label="legal" className='lower-legal-logo'>⚖️</span>
               <span className='lower-legal-text'>{t("legal_mentions_title")}</span>
            </a>
         </div>
      </>
   )
}

export const LoadingScreen = () => {
   return (
   <div id="loading-screen-inside">
    <div className="loader-container">
      <div className="loader">
        <div className="sk-chase">
          <div className="sk-chase-dot"></div>
          <div className="sk-chase-dot"></div>
          <div className="sk-chase-dot"></div>
          <div className="sk-chase-dot"></div>
          <div className="sk-chase-dot"></div>
          <div className="sk-chase-dot"></div>
        </div>
      </div>
    </div>
   </div>
   )
}

export default App

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import './App.css'
import './Help.css'
import Header from './Header'
import WelcomeScreen from './WelcomeScreen'
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

function App() {
   //const niivue = new Niivue();
   const [niivueModule, setNiivueModule] = useState<any>(null);
   const [niivue, setNiivue] = useState<any>(null);
   useEffect(() => {
      let isMounted = true;
      import('@niivue/niivue').then((mod) => {
         if (isMounted) {
            setNiivueModule(mod)
            setNiivue(new mod.Niivue({
               show3Dcrosshair: true,
               backColor: [0, 0, 0, 1],
               crosshairColor: [1, 1, 1, 1]
            }));
         }
      });
      return () => { isMounted = false; };
   }, []);

   const [isGuest, setIsGuest] = useState<boolean>(localStorage.getItem('guestMode') == "true" || false)
   const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false)
   const [authToken, setAuthToken] = useState<string>(localStorage.getItem('authToken') || "")
   const [currentPage, setCurrentPage] = useState<string>("")
   const [userUsername, setUserUsername] = useState<string>("")
   const [userFirstName, setUserFirstName] = useState<string>("")
   const [userLastName, setUserLastName] = useState<string>("")
   const [userPublishToLeaderboard, setUserPublishToLeaderboard] = useState<boolean|null>(null)
   const [atlasRegions, setAtlasRegions] = useState<AtlasRegion[]>([])
   const { t, i18n } = useTranslation();
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
   const [askedRegion, setAskedRegion] = useState<number|null>(null)
   const [gameMode, setGameMode] = useState<string|null>(null)
   const [askedSessionCode, setAskedSessionCode] = useState<string|null>(null)
   const [askedSessionToken, setAskedSessionToken] = useState<string|null>(null)
   const targetPage = useRef<string>("");
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
  const [welcomeSubpage, setWelcomeSubpage] = useState<string>("singleplayer")

   const startGame = (game: string) => {
      setCurrentPage(game);
   }

   function loadHash() {
      // Load hash from URL
      const hash = window.location.hash.replace(/^#\/?/, "");
      const parts = hash.split("/");
      const page = parts[0] || "welcome";
      if (page === "neurotheka"){
         const atlas = parts[1] || null;
         const region = parts[2] ? Number(parts[2]) : null;
         if(atlas && region) {  
            openNeurotheka({ id: region, name: "", atlas, atlasName: "" });
         }
      } else if (page === "singleplayer"){
         const mode = parts[1] || null;
         const atlas = parts[2] || null;
         if(mode && atlas) {  
            launchSinglePlayerGame(atlas, mode);
         }
      } else if (page === "multiplayer-game"){
         const code = parts[1] || null;
         const token = parts[2] || undefined;
         if(code) {  
            launchMultiPlayerGame(code, token);
         }
      } else if (page === "welcome"){
         setCurrentPage(page);
         const subpage = parts[1] || null;
         if(subpage) {  
            setWelcomeSubpage(subpage);
         } else {
            setWelcomeSubpage("singleplayer")
         }
      } else {
         setCurrentPage(page);
      }
   }

   const gotoPage = (page: string) => {
      checkToken();
      setCurrentPage(page);
      setHeaderText("");
      setHeaderTextMode("normal"); 
      window.location.hash = `#/${page}`;
   }
   const gotoWelcomeSubpage = (subpage: string) => {
      checkToken();
      setCurrentPage("welcome");
      setWelcomeSubpage(subpage)
   }

   useEffect(()=>{
      if(currentPage == "welcome"){
         if(welcomeSubpage){
            window.location.hash = `#/${currentPage}/${welcomeSubpage}`;
         }
      }
   }, [welcomeSubpage])

   const activateGuestMode = () => {
      setIsGuest(true);
      localStorage.setItem('guestMode', 'true');
      setCurrentPage("welcome");
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
      loadHash();
      const onHashChange = () => { loadHash() }
      window.addEventListener("hashchange", onHashChange);
      return () => window.removeEventListener("hashchange", onHashChange);
   }, [])

   useEffect(()=>{
      if(niivue){
         const niiFile = "assets/atlas/mni152_downsampled.nii.gz";
         niivue.loadFromUrl(niiFile).then((nvImage: any) => {
            setPreloadedBackgroundMNI(nvImage);
         }).catch((error: any) => {
            console.error("Error loading NIfTI file:", error);
            showNotification('error_loading_atlas', false, { atlas: askedAtlas });
            setPreloadedBackgroundMNI(null)
         });
      }
   }, [niivue])

   useEffect(() => {
      loadAtlasLabels()
   }, [currentLanguage])

   // Load labels for all atlases
   async function loadAtlasLabels() {
      const loadingAtlasRegions : AtlasRegion[] = [];
      for (const [atlas, { json, name }] of Object.entries(atlasFiles)) {
         try {
            const jsonFile = "assets/atlas/descr/" + currentLanguage + "/" + json;
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
            console.log(`Loaded ${regions.length} regions for ${atlas} (${name})`);
         } catch (error) {
            console.error(`Failed to load labels for ${atlas}:`, error);
            showNotification('error_loading_atlas', false, { atlas: name });
         }
      }
      console.log('Total regions loaded:', atlasRegions.length);
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

   const loginWithToken = async (token: string) => {
      localStorage.setItem('authToken', token);
      setAuthToken(token);
      setIsLoggedIn(true);
   }

   const checkToken = async () => {
      if(authToken){
         if (isTokenValid(authToken)) {
            setIsLoggedIn(true);
            refreshToken();
         } else {
            setIsLoggedIn(false);
            localStorage.removeItem('authToken');
            setAuthToken("");
            showNotification('invalid_token', false);
         }
      }
   }

   const logout = () => {
      localStorage.removeItem('authToken');
      setAuthToken("");
      setIsLoggedIn(false);
   }

   const openNeurotheka = (region: AtlasRegion) => {
      checkToken();
      targetPage.current  ="neurotheka"
      setHeaderText(t("loading"));
      setAskedAtlas(region.atlas);
      setAskedRegion(region.id);
      setLoadEnforcer(prev => prev + 1);
      window.location.hash = `#/neurotheka/${region.atlas}/${region.id}`;
   }
   useEffect(() => {
      if (askedAtlas) {
         setCurrentPage(targetPage.current);
      }
   }, [askedAtlas, askedRegion, loadEnforcer, gameMode]);

   useEffect(() => {
      if (askedSessionCode){
         setCurrentPage(targetPage.current);
      }
   }, [askedSessionCode, askedSessionToken])

   const launchSinglePlayerGame = (atlas: string, mode: string) => {
      targetPage.current = "singleplayer"
      checkToken();
      setHeaderText(t("loading"));
      setAskedAtlas(atlas);
      setGameMode(mode);
      setLoadEnforcer(prev => prev + 1);
      window.location.hash = `#/singleplayer/${mode}/${atlas}`;
   }
   const launchMultiPlayerGame = (sessionCode: string, sessionToken?: string) => {
      targetPage.current = "multiplayer-game"
      setAskedSessionCode(sessionCode);
      setAskedSessionToken(sessionToken || null);
      setLoadEnforcer(prev => prev + 1);
      window.location.hash = `#/multiplayer-game/${sessionCode}${sessionToken ? `/${sessionToken}` : ``}`;
   }


   useEffect(() => {
      if (askedAtlas) {
         const atlas = atlasFiles[askedAtlas];
         if (atlas && niivue && niivueModule) {
            const niiFile = "assets/atlas/nii/" + atlas.nii;
            niivueModule.NVImage.loadFromUrl({url: niiFile}).then((nvImage: any) => {
               setPreloadedAtlas(nvImage);
            }).catch((error: any) => {
               console.error("Error loading NIfTI file:", error);
               showNotification('error_loading_atlas', false, { atlas: askedAtlas });
               setPreloadedAtlas(null)
            });
         }
      }
   }, [askedAtlas, niivue, niivueModule])

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
      startGame: startGame,
      gotoPage: gotoPage,
      handleChangeLanguage: handleChangeLanguage,
      activateGuestMode: activateGuestMode,
      setIsLoggedIn: setIsLoggedIn,
      loginWithToken: loginWithToken,
      logout: logout,
      openNeurotheka: openNeurotheka,
      setHeaderText: setHeaderText,
      setHeaderTextMode: setHeaderTextMode,
      setHeaderScore: setHeaderScore,
      setHeaderErrors: setHeaderErrors,
      setHeaderStreak: setHeaderStreak,
      setHeaderTime: setHeaderTime,
      setViewerOption: setViewerOption,
      launchSinglePlayerGame: launchSinglePlayerGame,
      launchMultiPlayerGame: launchMultiPlayerGame,
      setWelcomeSubpage: setWelcomeSubpage,
      gotoWelcomeSubpage: gotoWelcomeSubpage
   }

   return (
      <>
         <Header currentLanguage={currentLanguage} currentPage={currentPage} atlasRegions={atlasRegions}
            isLoggedIn={isLoggedIn} t={t} callback={callback}
            userFirstName={userFirstName} userLastName={userLastName} 
            headerText={headerText} headerTextMode={headerTextMode}
            headerScore={headerScore} headerErrors={headerErrors}
            headerStreak={headerStreak} headerTime={headerTime}
            viewerOptions={viewerOptions} />
         {currentPage === "welcome" && <>
            {!isGuest && !isLoggedIn && <LandingPage t={t} callback={callback} />}
            {(isGuest || isLoggedIn) && <WelcomeScreen t={t} callback={callback} atlasRegions={atlasRegions} 
               isLoggedIn={isLoggedIn} authToken={authToken} userUsername={userUsername} 
               welcomeSubpage={welcomeSubpage} />}
         </>}
         {currentPage === "singleplayer" && 
            <Suspense fallback={<LoadingScreen/>}>
               <GameScreen t={t} callback={callback} currentLanguage={currentLanguage}
                  atlasRegions={atlasRegions} 
                  askedAtlas={askedAtlas} gameMode={gameMode}
                  preloadedAtlas={preloadedAtlas}
                  preloadedBackgroundMNI={preloadedBackgroundMNI} 
                  viewerOptions={viewerOptions}
                  loadEnforcer={loadEnforcer}
                  isLoggedIn={isLoggedIn} authToken={authToken}
                  userPublishToLeaderboard={userPublishToLeaderboard}
                  niivue={niivue} niivueModule={niivueModule} />
            </Suspense>}
         {currentPage === "multiplayer-game" &&
            <Suspense fallback={<LoadingScreen/>}>
               <MultiplayerGameScreen t={t} callback={callback} authToken={authToken} userUsername={userUsername} 
                  askedSessionCode={askedSessionCode} askedSessionToken={askedSessionToken} loadEnforcer={loadEnforcer}
                  viewerOptions={viewerOptions}
                  preloadedBackgroundMNI={preloadedBackgroundMNI} 
                  currentLanguage={currentLanguage}
                  niivue={niivue} niivueModule={niivueModule} />
            </Suspense>}
         {currentPage === "login" && <LoginScreen t={t} callback={callback} currentLanguage={currentLanguage} />}
         {currentPage === "register" && <RegisterScreen t={t} callback={callback} currentLanguage={currentLanguage} />}
         {currentPage === "validate" && <ValidateEmailScreen t={t} callback={callback} />}
         {currentPage === "resetpwd" && <ResetPasswordScreen t={t} callback={callback} />}
         {currentPage === "config" && <UserConfig t={t} callback={callback} authToken={authToken} />}
         {currentPage === "stats" && <Stats t={t} callback={callback} authToken={authToken} />}
         {notificationMessage && 
            <div id="notification" ref={notificationRef} className={notificationStatus}>{notificationMessage}</div>}
         {currentPage === "neurotheka" && 
            <Suspense fallback={<LoadingScreen/>}>
               <Neurotheka t={t} callback={callback} currentLanguage={currentLanguage}
                  atlasRegions={atlasRegions} 
                  askedAtlas={askedAtlas} askedRegion={askedRegion}
                  preloadedAtlas={preloadedAtlas}
                  preloadedBackgroundMNI={preloadedBackgroundMNI} 
                  viewerOptions={viewerOptions}
                  loadEnforcer={loadEnforcer} 
                  niivue={niivue} niivueModule={niivueModule} />
            </Suspense>}
               
         {currentPage === "welcome" && <>
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
                        (_match, doi) => `<a href="https://doi.org/${doi}" target='_blank'>${doi}</a>`
                     )
                  }}></p>
               </section>
               <section>
                  <h3>{t("legal_mentions_pedagogy_title")}</h3>
                  <p>{t("legal_mentions_pedagogy")}</p>
               </section>
            </div>
         </div>}

         <div className='lower-bar-phantom'></div>
         <div className='lower-bar'>
            <a
               href="https://github.com/FRramon/neuroguessr_web/"
               target="_blank"
               rel="noopener noreferrer"
            >
               <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
               </svg>
               GitHub
            </a>
            <a onClick={(e) => setShowLegalOverlay(true)}>
               <span role="img" aria-label="legal">⚖️</span>
               {t("legal_mentions_title")}
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

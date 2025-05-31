import { useEffect, useRef, useState } from 'react';
import './App.css'
import './Help.css'
import Header from './Header'
import WelcomeScreen from './WelcomeScreen'
import { useTranslation } from "react-i18next";
import GameScreen from './GameScreen';
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';
import ValidateEmailScreen from './ValidateEmailScreen';
import LandingPage from './LandingPage';
import Stats from './Stats';
import { getTokenPayload, isTokenValid, refreshToken } from './helper_login';
import ResetPasswordScreen from './ResetPasswordScreen';
import UserConfig from './UserConfig';
import atlasFiles from './atlas_files'
import {Niivue, NVImage} from '@niivue/niivue';
import Neurotheka from './Neurotheka';
import MultiplayerConfigScreen from './MultiplayerConfigScreen';
import MultiplayerGameScreen from './MultiplayerGameScreen';

function App() {
   const niivue = new Niivue();
   const [isGuest, setIsGuest] = useState<boolean>(localStorage.getItem('guestMode') == "true" || false)
   const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false)
   const [authToken, setAuthToken] = useState<string>(localStorage.getItem('authToken') || "")
   const [currentPage, setCurrentPage] = useState<string>("")
   const [userUsername, setUserUsername] = useState<string>("")
   const [userFirstName, setUserFirstName] = useState<string>("")
   const [userLastName, setUserLastName] = useState<string>("")
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
   const [preloadedBackgroundMNI, setPreloadedBackgroundMNI] = useState<NVImage|null>(null)
   const [askedAtlas, setAskedAtlas] = useState<string|null>(null)
   const [preloadedAtlas, setPreloadedAtlas] = useState<NVImage|null>(null)
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
  const helpContentRef = useRef<HTMLDivElement>(null);
  const helpButtonRef = useRef<HTMLDivElement>(null);

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
      const niiFile = "assets/atlas/mni152.nii.gz";
      niivue.loadFromUrl(niiFile).then((nvImage) => {
         setPreloadedBackgroundMNI(nvImage);
      }).catch((error) => {
         console.error("Error loading NIfTI file:", error);
         showNotification('error_loading_atlas', false, { atlas: askedAtlas });
         setPreloadedBackgroundMNI(null)
      });
      loadHash();
      const onHashChange = () => { loadHash() }
      window.addEventListener("hashchange", onHashChange);
      return () => window.removeEventListener("hashchange", onHashChange);
   }, [])

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
         if (atlas) {
            const niiFile = "assets/atlas/nii/" + atlas.nii;
            NVImage.loadFromUrl({url: niiFile}).then((nvImage) => {
               setPreloadedAtlas(nvImage);
            }).catch((error) => {
               console.error("Error loading NIfTI file:", error);
               showNotification('error_loading_atlas', false, { atlas: askedAtlas });
               setPreloadedAtlas(null)
            });
         }
      }
   }, [askedAtlas])

   useEffect(() => {
      if (isLoggedIn) {
         setIsGuest(false);
         localStorage.setItem('guestMode', 'false');
         const payload = getTokenPayload(authToken)
         setUserUsername(payload.username || t('default_user'))
         setUserFirstName(payload.firstname || t('default_user'))
         setUserLastName(payload.lastname || "")
      }
   }, [isLoggedIn])

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
      launchMultiPlayerGame: launchMultiPlayerGame
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
            {(isGuest || isLoggedIn) && <WelcomeScreen t={t} callback={callback} atlasRegions={atlasRegions} />}
         </>}
         {currentPage === "singleplayer" && 
            <GameScreen t={t} callback={callback} currentLanguage={currentLanguage}
               atlasRegions={atlasRegions} 
               askedAtlas={askedAtlas} gameMode={gameMode}
               preloadedAtlas={preloadedAtlas}
               preloadedBackgroundMNI={preloadedBackgroundMNI} 
               viewerOptions={viewerOptions}
               loadEnforcer={loadEnforcer}
               isLoggedIn={isLoggedIn} authToken={authToken} />}
         {currentPage === "multiplayer-config" && <>
            <MultiplayerConfigScreen t={t} callback={callback} authToken={authToken} userUsername={userUsername} />
         </>}
         {currentPage === "multiplayer-game" && <>
            <MultiplayerGameScreen t={t} callback={callback} authToken={authToken} userUsername={userUsername} 
               askedSessionCode={askedSessionCode} askedSessionToken={askedSessionToken} loadEnforcer={loadEnforcer} />
         </>}
         {currentPage === "login" && <LoginScreen t={t} callback={callback} />}
         {currentPage === "register" && <RegisterScreen t={t} callback={callback} />}
         {currentPage === "validate" && <ValidateEmailScreen t={t} callback={callback} />}
         {currentPage === "resetpwd" && <ResetPasswordScreen t={t} callback={callback} />}
         {currentPage === "config" && <UserConfig t={t} callback={callback} authToken={authToken} />}
         {currentPage === "stats" && <Stats t={t} callback={callback} authToken={authToken} />}
         {notificationMessage && 
            <div id="notification" ref={notificationRef} className={notificationStatus}>{notificationMessage}</div>}
         {currentPage === "neurotheka" && 
            <Neurotheka t={t} callback={callback} currentLanguage={currentLanguage}
               atlasRegions={atlasRegions} 
               askedAtlas={askedAtlas} askedRegion={askedRegion}
               preloadedAtlas={preloadedAtlas}
               preloadedBackgroundMNI={preloadedBackgroundMNI} 
               viewerOptions={viewerOptions}
               loadEnforcer={loadEnforcer} />}
         {currentPage === "welcome" && <>
            {showHelpOverlay && <div id="help-overlay" className="help-overlay">
               <div className="help-content" ref={helpContentRef}>
                  <button id="close-help" className="close-button" onClick={() => setShowHelpOverlay(false)}>&times;</button>
                  <h2 data-i18n="help_title">Help</h2>
                  <section>
                     <h3>{t("help_presentation_title")}</h3>
                     <p>{t("help_presentation_text")}</p>
                  </section>
                  <section>
                     <h3>{t("help_atlases_title")}</h3>
                     <p dangerouslySetInnerHTML={{ __html: t("help_atlases_text") }}></p>
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
      </>
   )
}

export default App

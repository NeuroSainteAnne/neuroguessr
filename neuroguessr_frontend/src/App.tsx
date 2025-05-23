import { useEffect, useRef, useState } from 'react';
import './App.css'
import Header from './Header'
import WelcomeScreen from './WelcomeScreen'
import { useTranslation } from "react-i18next";
import GameScreen from './GameScreen';
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';
import ValidateEmailScreen from './ValidateEmailScreen';
import LandingPage from './LandingPage';
import Stats from './Stats';
import { getTokenPayload, isTokenValid } from './helper_login';
import ResetPasswordScreen from './ResetPasswordScreen';
import UserConfig from './UserConfig';
import atlasFiles from './atlas_files'

function App() {
   const [isGuest, setIsGuest] = useState<boolean>(localStorage.getItem('guestMode') == "true" || false)
   const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false)
   const [authToken, setAuthToken] = useState<string>(localStorage.getItem('authToken') || "")
   const [currentPage, setCurrentPage] = useState<string>(() => {
      const queryParameters = new URLSearchParams(window.location.search)
      if (queryParameters.get("validate")) return "validate"
      if (queryParameters.get("resetpwd")) return "resetpwd"
      return "welcome"
   })
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

   const startGame = (game: string) => {
      setCurrentPage(game);
   }
   const gotoPage = (game: string) => {
      setCurrentPage(game);
   }

   const activateGuestMode = () => {
      setIsGuest(true);
      localStorage.setItem('guestMode', 'true');
      setCurrentPage("welcome");
   }

   useEffect(() => {
      if (authToken && isTokenValid(authToken)) {
         setIsGuest(false);
         setIsLoggedIn(true);
      }
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

   const logout = () => {
      localStorage.removeItem('authToken');
      setAuthToken("");
      setIsLoggedIn(false);
   }

   useEffect(() => {
      if (isLoggedIn) {
         setIsGuest(false);
         localStorage.setItem('guestMode', 'false');
         const payload = getTokenPayload(authToken)
         setUserFirstName(payload.firstname || t('default_user'))
         setUserLastName(payload.lastname || "")
      }
   }, [isLoggedIn])

   const callback: AppCallback = {
      startGame: startGame,
      gotoPage: gotoPage,
      handleChangeLanguage: handleChangeLanguage,
      setCurrentPage: setCurrentPage,
      activateGuestMode: activateGuestMode,
      setIsLoggedIn: setIsLoggedIn,
      loginWithToken: loginWithToken,
      logout: logout
   }

   return (
      <>
         <Header currentLanguage={currentLanguage} isLoggedIn={isLoggedIn} t={t} callback={callback}
            userFirstName={userFirstName} userLastName={userLastName} />
         {currentPage === "welcome" && <>
            {!isGuest && !isLoggedIn && <LandingPage t={t} callback={callback} />}
            {(isGuest || isLoggedIn) && <WelcomeScreen t={t} callback={callback} atlasRegions={atlasRegions} />}
         </>}
         {currentPage === "game" && <GameScreen t={t} callback={callback} />}
         {currentPage === "login" && <LoginScreen t={t} callback={callback} />}
         {currentPage === "register" && <RegisterScreen t={t} callback={callback} />}
         {currentPage === "validate" && <ValidateEmailScreen t={t} callback={callback} />}
         {currentPage === "resetpwd" && <ResetPasswordScreen t={t} callback={callback} />}
         {currentPage === "config" && <UserConfig t={t} callback={callback} authToken={authToken} />}
         {currentPage === "stats" && <Stats t={t} callback={callback} authToken={authToken} />}
         {notificationMessage && 
            <div id="notification" ref={notificationRef} className={notificationStatus}>{notificationMessage}</div>}
      </>
   )
}

export default App

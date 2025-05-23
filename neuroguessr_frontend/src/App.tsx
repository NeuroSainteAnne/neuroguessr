import { useEffect, useState } from 'react';
import './App.css'
import Header from './Header'
import WelcomeScreen from './WelcomeScreen'
import { useTranslation } from "react-i18next";
import GameScreen from './GameScreen';
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';
import ValidateEmailScreen from './ValidateEmailScreen';
import LandingPage from './LandingPage';
import { getTokenPayload, isTokenValid } from './helper_login';
import ResetPasswordScreen from './ResetPasswordScreen';

function App() {
 const [isGuest, setIsGuest] = useState<boolean>(localStorage.getItem('guestMode') == "true" || false)
 const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false)
 const [authToken, setAuthToken] = useState<string>(localStorage.getItem('authToken') || "")
 const [currentPage, setCurrentPage] = useState<string>(()=>{
    const queryParameters = new URLSearchParams(window.location.search)
    if(queryParameters.get("validate")) return "validate"
    if(queryParameters.get("resetpwd")) return "resetpwd"
    return "welcome"
 })
 const [userFirstName, setUserFirstName] = useState<string>("")
 const [userLastName, setUserLastName] = useState<string>("")
 const { t, i18n } = useTranslation();
 const [currentLanguage, setCurrentLanguage] = useState(i18n.language)
 const handleChangeLanguage = (lang: string) => {
   setCurrentLanguage(lang);
   i18n.changeLanguage(lang);
 }

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

 useEffect(()=>{
  if (authToken && isTokenValid(authToken)) {
    setIsGuest(false);
    setIsLoggedIn(true);
  }
 }, [])

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

 useEffect(()=>{
    if(isLoggedIn){
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
        { !isGuest && !isLoggedIn && <LandingPage t={t} callback={callback} /> }
        { (isGuest || isLoggedIn) && <WelcomeScreen t={t} callback={callback} /> }
      </>}
      {currentPage === "game" && <GameScreen t={t} callback={callback} />}
      {currentPage === "login" && <LoginScreen t={t} callback={callback} />}
      {currentPage === "register" && <RegisterScreen t={t} callback={callback} />}
      {currentPage === "validate" && <ValidateEmailScreen t={t} callback={callback} />}
      {currentPage === "resetpwd" && <ResetPasswordScreen t={t} callback={callback} />}
    </>
  )
}

export default App

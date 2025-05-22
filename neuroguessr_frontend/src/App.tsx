import { useEffect, useState } from 'react';
import './App.css'
import Header from './Header'
import WelcomeScreen from './WelcomeScreen'
import { useTranslation } from "react-i18next";
import GameScreen from './GameScreen';
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';
import ValidateEmailScreen from './ValidateEmailScreen';

function App() {
 const queryParameters = new URLSearchParams(window.location.search)
 const validateEmail = queryParameters.get("validate")
 const [currentPage, setCurrentPage] = useState<string>(validateEmail?"validate":"welcome")
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

 const callback: AppCallback = {
    startGame: startGame,
    gotoPage: gotoPage
 }
 
  return (
    <>
      <Header handleChangeLanguage={handleChangeLanguage} 
              currentLanguage={currentLanguage}
              setCurrentPage={setCurrentPage} />
      {currentPage === "welcome" && <WelcomeScreen t={t} callback={callback} />}
      {currentPage === "game" && <GameScreen t={t} callback={callback} />}
      {currentPage === "login" && <LoginScreen t={t} callback={callback} />}
      {currentPage === "register" && <RegisterScreen t={t} callback={callback} />}
      {currentPage === "validate" && <ValidateEmailScreen t={t} callback={callback} />}
    </>
  )
}

export default App

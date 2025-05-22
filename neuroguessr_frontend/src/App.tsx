import { useEffect, useState } from 'react';
import './App.css'
import Header from './Header'
import WelcomeScreen from './WelcomeScreen'
import { useTranslation } from "react-i18next";
import GameScreen from './GameScreen';

function App() {
 const [currentPage, setCurrentPage] = useState<string>("welcome")
 const { t, i18n } = useTranslation();
 const [currentLanguage, setCurrentLanguage] = useState(i18n.language)
 const handleChangeLanguage = (lang: string) => {
   setCurrentLanguage(lang);
   i18n.changeLanguage(lang);
 }

 const startGame = (game: string) => {
    setCurrentPage(game);
 }

 const callback: AppCallback = {
    startGame: startGame
 }
 
  return (
    <>
      <Header handleChangeLanguage={handleChangeLanguage} 
              currentLanguage={currentLanguage}
              setCurrentPage={setCurrentPage} />
      {currentPage === "welcome" && <WelcomeScreen t={t} callback={callback} />}
      {currentPage === "game" && <GameScreen t={t} callback={callback} />}
    </>
  )
}

export default App

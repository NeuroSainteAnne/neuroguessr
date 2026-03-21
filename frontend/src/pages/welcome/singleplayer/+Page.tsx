import { useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import GameSelector from '../GameSelector';
import SearchBar from '../../../components/SearchBar';
import News from '../../../components/News';
import { GameSelectorProvider } from '../../../context/GameSelectorContext';
import { SingleSelector } from './SingleSelector';
import { NextChallenge } from '../../../components/NextChallenge';

export function Page() {
   const { atlasRegions, activateGuestMode, isLoggedIn } = useApp();
   useEffect(()=>{
    if(!isLoggedIn) activateGuestMode();
   }, [])
  
  return (
    <>
      <title>NeuroGuessr</title>
      <News />
      {atlasRegions.length > 0 && <SearchBar />}
      <NextChallenge />
      <GameSelectorProvider>
        <GameSelector />
        <div id="single-player-options" className="single-player-options-container">
            <SingleSelector />
        </div>
      </GameSelectorProvider>
    </>
  );
}
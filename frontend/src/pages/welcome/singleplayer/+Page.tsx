import React, { useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import GameSelector from '../GameSelector';
import SearchBar from '../../../components/SearchBar';
import { GameSelectorProvider } from '../../../context/GameSelectorContext';
import { SingleSelector } from './SingleSelector';
import { Help } from '../../../components/Help';
import Leaderboard from '../../../components/Leaderboard';

export function Page() {
   const { atlasRegions, activateGuestMode, isLoggedIn } = useApp();
   useEffect(()=>{
    if(!isLoggedIn) activateGuestMode();
   }, [])
  
  return (
    <>
      <title>NeuroGuessr</title>
      {atlasRegions.length > 0 && <SearchBar />}
      <GameSelectorProvider>
        <GameSelector />
        <div id="single-player-options" className="single-player-options-container">
            <SingleSelector />
        </div>
      </GameSelectorProvider>
      <Help />
    </>
  );
}
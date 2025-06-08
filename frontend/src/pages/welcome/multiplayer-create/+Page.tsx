import React, { useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import GameSelector from '../GameSelector';
import SearchBar from '../../../components/SearchBar';
import { GameSelectorProvider } from '../../../context/GameSelectorContext';
import MultiplayerConfigScreen from './MultiplayerConfigScreen';

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
        <div className="page-container">
            <MultiplayerConfigScreen />
        </div>
      </GameSelectorProvider>
    </>
  );
}
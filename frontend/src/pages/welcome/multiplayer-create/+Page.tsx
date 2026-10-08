import { useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { GameSelectorProvider } from '../../../context/GameSelectorContext';
import { GameSelectorWithSearch } from '../GameSelectorWithSearch';
import MultiplayerConfigScreen from './MultiplayerConfigScreen';

export function Page() {
   const { activateGuestMode, isLoggedIn } = useApp();
   useEffect(()=>{
    if(!isLoggedIn) activateGuestMode();
   }, [])

  return (
    <>
      <title>NeuroGuessr</title>
      <GameSelectorProvider>
        <GameSelectorWithSearch />
        <MultiplayerConfigScreen />
      </GameSelectorProvider>
    </>
  );
}
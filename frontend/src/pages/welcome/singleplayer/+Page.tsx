import { useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { GameSelectorProvider } from '../../../context/GameSelectorContext';
import { GameSelectorWithSearch } from '../GameSelectorWithSearch';
import { GameSelectorAtlas } from '../GameSelectorAtlas';

export function Page() {
   const { activateGuestMode, isLoggedIn } = useApp();

   useEffect(()=>{
    if(!isLoggedIn) activateGuestMode();
   }, []);

  return (
    <>
      <title>NeuroGuessr</title>


      <GameSelectorProvider>
        <div className="centered-container">
            <GameSelectorWithSearch />
            <GameSelectorAtlas />
        </div>
      </GameSelectorProvider>
    </>
  );
}
import { useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { GameSelectorWithSearch } from '../GameSelectorWithSearch';
import Leaderboard from '../../../components/Leaderboard';

export function Page() {
   const { activateGuestMode, isLoggedIn } = useApp();
   useEffect(()=>{
    if(!isLoggedIn) activateGuestMode();
   }, [])

  return (
    <>
      <title>NeuroGuessr</title>
      <GameSelectorWithSearch />
      <Leaderboard />
    </>
  );
}
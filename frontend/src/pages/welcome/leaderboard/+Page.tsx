import { useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import GameSelector from '../GameSelector';
import SearchBar from '../../../components/SearchBar';
import Leaderboard from '../../../components/Leaderboard';
import { NextChallenge } from '../../../components/NextChallenge';
import News from '../../../components/News';

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
      <GameSelector />
      <Leaderboard />
    </>
  );
}
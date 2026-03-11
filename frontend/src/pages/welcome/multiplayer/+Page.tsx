import { useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import GameSelector from '../GameSelector';
import SearchBar from '../../../components/SearchBar';
import { MultiBox } from './MultiBox';
import { NextChallenge } from '../../../components/NextChallenge';

export function Page() {
   const { atlasRegions, activateGuestMode, isLoggedIn } = useApp();
   useEffect(()=>{
    if(!isLoggedIn) activateGuestMode();
   }, [])
  
  return (
    <>
      <title>NeuroGuessr</title>
      {atlasRegions.length > 0 && <SearchBar />}
      <NextChallenge />
      <GameSelector />
      <MultiBox />
    </>
  );
}
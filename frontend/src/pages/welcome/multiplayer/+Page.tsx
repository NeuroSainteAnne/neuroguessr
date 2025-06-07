import React, { useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import GameSelector from '../GameSelector';
import SearchBar from '../../../components/SearchBar';
import { MultiBox } from './MultiBox';

export function Page() {
   const { atlasRegions, activateGuestMode, isLoggedIn } = useApp();
   useEffect(()=>{
    if(!isLoggedIn) activateGuestMode();
   }, [])
  
  return (
    <>
      {atlasRegions.length > 0 && <SearchBar />}
      <GameSelector />
      <MultiBox />
    </>
  );
}
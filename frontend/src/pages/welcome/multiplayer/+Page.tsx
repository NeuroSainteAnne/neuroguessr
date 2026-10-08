import { useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { GameSelectorWithSearch } from '../GameSelectorWithSearch';
import { MultiBox } from './MultiBox';

export function Page() {
   const { activateGuestMode, isLoggedIn } = useApp();
   useEffect(()=>{
    if(!isLoggedIn) activateGuestMode();
   }, [])

  return (
    <>
      <title>NeuroGuessr</title>
      <GameSelectorWithSearch />
      <MultiBox />
    </>
  );
}
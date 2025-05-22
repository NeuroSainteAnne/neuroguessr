import { useEffect, useState } from 'react';
import SearchBar from './SearchBar'
import type { TFunction } from 'i18next';
import GameSelector from './GameSelector';

function WelcomeScreen({t, callback}:{ t: TFunction<"translation", undefined>, callback: AppCallback }) {
   return (
    <>
      <SearchBar t={t} callback={callback} />
      <GameSelector t={t} callback={callback} />
    </>
  )
}

export default WelcomeScreen

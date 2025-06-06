import React from 'react';
import { useEffect, useState } from 'react';
import SearchBar from './SearchBar'
import type { TFunction } from 'i18next';
import GameSelector from './GameSelector';

function WelcomeScreen({t, callback, atlasRegions, isLoggedIn, authToken, userUsername}:
  { t: TFunction<"translation", undefined>, callback: AppCallback, atlasRegions:AtlasRegion[], 
    isLoggedIn: boolean, authToken: string, userUsername: string }) {
   return (
    <>
      <title>NeuroGuessr - Home Page</title>
      {atlasRegions.length > 0 && <SearchBar t={t} callback={callback} atlasRegions={atlasRegions} />}
      <GameSelector t={t} callback={callback} isLoggedIn={isLoggedIn} authToken={authToken} userUsername={userUsername} />
    </>
  )
}

export default WelcomeScreen

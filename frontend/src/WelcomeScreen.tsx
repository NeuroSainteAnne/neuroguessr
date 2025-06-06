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
      <title>NeuroGuessr</title>
      <meta name="description" content="Neuroguessr: a game for learning neuroanatomy." />
      <meta property="og:title" content="NeuroGuessr" />
      <meta property="og:image" content="https://neuroguessr.org/assets/interface/neuroguessr-128.png" />
      <meta property="og:url" content="https://neuroguessr.org/" />
      <meta property="og:type" content="website" />
      {atlasRegions.length > 0 && <SearchBar t={t} callback={callback} atlasRegions={atlasRegions} />}
      <GameSelector t={t} callback={callback} isLoggedIn={isLoggedIn} authToken={authToken} userUsername={userUsername} />
    </>
  )
}

export default WelcomeScreen

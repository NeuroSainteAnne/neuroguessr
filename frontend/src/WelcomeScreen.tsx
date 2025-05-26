import { useEffect, useState } from 'react';
import SearchBar from './SearchBar'
import type { TFunction } from 'i18next';
import GameSelector from './GameSelector';

function WelcomeScreen({t, callback, atlasRegions}:
  { t: TFunction<"translation", undefined>, callback: AppCallback, atlasRegions:AtlasRegion[] }) {
   return (
    <>
      {atlasRegions.length > 0 && <SearchBar t={t} callback={callback} atlasRegions={atlasRegions} />}
      <GameSelector t={t} callback={callback} />
    </>
  )
}

export default WelcomeScreen

import React, { useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';

function Stats({t, callback, authToken}: 
    { t: TFunction<"translation", undefined>, callback: AppCallback, authToken: string }) {

    return(<>
      <title>NeuroGuessr - Stats</title>
      <link rel="stylesheet" href="/assets/styles/Stats.css" />
      Placeholder for Stats module
    </>)

}

export default Stats;
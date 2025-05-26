import { useEffect, useRef, useState } from 'react';
import './Stats.css'
import type { TFunction } from 'i18next';

function Stats({t, callback, authToken}: 
    { t: TFunction<"translation", undefined>, callback: AppCallback, authToken: string }) {

    return(<>Placeholder for Stats module</>)

}

export default Stats;
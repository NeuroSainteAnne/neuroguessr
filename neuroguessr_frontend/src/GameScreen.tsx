import type { TFunction } from 'i18next';
import './GameScreen.css'
import { useEffect, useState } from 'react';

function GameScreen({t, callback}:{ t: TFunction<"translation", undefined>, callback: AppCallback }) {
    const [time, setTime] = useState(0);
      useEffect(() => {
        const intervalId = setInterval(() => setTime(time + 1), 1000);
        return () => clearInterval(intervalId);
    }, [time]);
  return (
    <>
        <div>Placeholder for game screen</div>
        <div className="timer">
            {time}
        </div>
    </>
  )
}

export default GameScreen

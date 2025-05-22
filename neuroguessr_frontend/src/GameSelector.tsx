import type { TFunction } from 'i18next';
import './GameSelector.css'

function GameSelector({t, callback}:{ t: TFunction<"translation", undefined>, callback: AppCallback }) {
  return (
    <>
        <div>Placeholder for mode selection</div>
        <div>Placeholder for login</div>
        <div>Placeholder for game selection</div>
        <button onClick={()=>{callback.startGame("game")}}>{t("play_button")}</button>
    </>
  )
}

export default GameSelector

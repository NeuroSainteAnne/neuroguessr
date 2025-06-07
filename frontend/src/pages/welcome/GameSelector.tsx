import { useApp } from '../../context/AppContext';
import './GameSelector.css';

function GameSelector() {
  const { t, pageContext } = useApp();
  const parts = pageContext.urlPathname.split('/')
  const isSingleplayer = (!parts[2] || parts[2] == 'singleplayer') 

  return (
    <>
        <div className="player-selection-buttons">
          <a id="single-player-button" 
              className={(isSingleplayer?"player-mode-button selected":"player-mode-button")}
              href="/welcome/singleplayer">
                {t("single_player_button")}
          </a>
          <a id="single-player-button" 
              className={(!isSingleplayer?"player-mode-button selected":"player-mode-button")}
              href="/welcome/multiplayer">
                {t("multiplayer_button")}
          </a>
        </div>
    </>
  )
}

export default GameSelector

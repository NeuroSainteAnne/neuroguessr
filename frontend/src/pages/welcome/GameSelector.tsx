import { useApp } from '../../context/AppContext';
import './GameSelector.css';

function GameSelector() {
  const { t, pageContext } = useApp();
  const parts = pageContext.urlPathname.split('/')
  const welcomeSubPage = parts[2] || 'singleplayer'

  return (
    <>
        <div className="player-selection-buttons">
          <a id="single-player-button" 
              className={(welcomeSubPage == "leaderboard"?"player-mode-button selected":"player-mode-button")}
              href="/welcome/leaderboard">
                {t("leaderboard_button")}
          </a>
          <a id="single-player-button" 
              className={(welcomeSubPage == "singleplayer"?"player-mode-button selected":"player-mode-button")}
              href="/welcome/singleplayer">
                {t("single_player_button")}
          </a>
          <a id="single-player-button" 
              className={(welcomeSubPage == "multiplayer"?"player-mode-button selected":"player-mode-button")}
              href="/welcome/multiplayer">
                {t("multiplayer_button")}
          </a>
        </div>
    </>
  )
}

export default GameSelector

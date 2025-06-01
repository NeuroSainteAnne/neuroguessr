import type { TFunction } from 'i18next';
import './GameSelector.css'
import atlasFiles, { atlasCategories } from './atlas_files';
import { useState } from 'react';
import MultiplayerConfigScreen from './MultiplayerConfigScreen';

function GameSelector({ t, callback, isLoggedIn, authToken, userUsername }: 
    { t: TFunction<"translation", undefined>, callback: AppCallback, isLoggedIn: boolean, authToken: string, userUsername: string }) {
  const [selectedCategory, setSelectedCategory] = useState<string>("cortical_regions");
  const [selectedAtlas, setSelectedAtlas] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<string>("");
  const [selectedPlayer, setSelectedPlayer] = useState<string>("singleplayer");
  const [multiplayerInputCode, setMultiplayerInputCode] = useState<string>("")
  const [createMultiplayerMode, setCreateMultiplayerMode] = useState<boolean>(false)

  const handleLaunchSinglePlayerGame = () => {
    if (selectedPlayer == "singleplayer" && selectedAtlas && selectedMode) {
      callback.launchSinglePlayerGame(selectedAtlas, selectedMode);
    }
  }

  const handleJoinMultiplayer = () =>  {
    if(parseInt(multiplayerInputCode) >= 10000000 && parseInt(multiplayerInputCode) <= 99999999){
      console.log(multiplayerInputCode)
      callback.launchMultiPlayerGame(multiplayerInputCode, undefined);
    }
  }

  const handleCreateMultiplayer = () => {
    setCreateMultiplayerMode(true)
  }

  return (
    <>
      <div className="centered-container">
        <div className="player-selection-buttons">
          <button id="single-player-button" 
              className={(selectedPlayer=="singleplayer"?"player-mode-button selected":"player-mode-button")}
              onClick={()=>setSelectedPlayer("singleplayer")}>
                {t("single_player_button")}
          </button>
          <button id="single-player-button" 
              className={(selectedPlayer=="multiplayer"?"player-mode-button selected":"player-mode-button")}
              onClick={()=>{setCreateMultiplayerMode(false); setSelectedPlayer("multiplayer")}}>
                {t("multiplayer_button")}
          </button>
        </div>

        { selectedPlayer=="singleplayer" && <div id="single-player-options" className="single-player-options-container hidden">
          <section className="atlas-selection">
            <h2><img src="assets/interface/numero-1.png" alt="Atlas Icon" /> <span data-i18n="select_atlas">Select Atlas</span></h2>
            <GameSelectorAtlas t={t} selectedAtlas={selectedAtlas} setSelectedAtlas={setSelectedAtlas}
              selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory}/>
          </section>

          <section className="mode-selection">
            <h2><img src="assets/interface/numero-2.png" alt="Game Mode Icon" /> <span data-i18n="select_game_mode">Select Game Mode</span></h2>
            <div className="mode-buttons">
              <button className={selectedMode=="navigation"?"mode-button selected":"mode-button"}
                      onClick={() => setSelectedMode("navigation")}>
                <img src="assets/interface/boussole.png" alt="Boussole Icon" />
                <span>{t("navigation_mode")}</span>
                <span className="mode-description">{t("navigation_description")}</span>
              </button>
              <button className={selectedMode=="practice"?"mode-button selected":"mode-button"}
                      onClick={() => setSelectedMode("practice")}>
                <img src="assets/interface/practice.png" alt="Practice Icon" />
                <span>{t("practice_mode")}</span>
                <span className="mode-description">{t("practice_description")}</span>
              </button>
              <button className={selectedMode=="streak"?"mode-button selected":"mode-button"}
                      onClick={() => setSelectedMode("streak")}>
                <img src="assets/interface/flame.png" alt="Flame Icon" />
                <span>{t("streak_mode")}</span>
                <span className="mode-description">{t("streak_description")}</span>
              </button>
              <button className={selectedMode=="time-attack"?"mode-button selected":"mode-button"}
                      onClick={() => setSelectedMode("time-attack")}>
                <img src="assets/interface/chronometer.png" alt="Chronometer Icon" />
                <span>{t("time_attack_mode")}</span>
                <span className="mode-description">{t("time_attack_description")}</span>
              </button>
            </div>
            <button id="play-button" 
                    className={(selectedAtlas=="" || selectedMode == "")?"play-button disabled":"play-button enabled"}
                    onClick={()=>handleLaunchSinglePlayerGame()}>
              {t("play_button")}
            </button>
          </section>
        </div>}

        {selectedPlayer == "multiplayer" && <>
          {!createMultiplayerMode && <div className="multiplayer-box">
            {isLoggedIn && <>
              <div className="multiplayer-box-join">
                <h2>{t("join-multiplayer-lobby")}</h2>
                <div><input
                  type="text"
                  value={multiplayerInputCode}
                  onChange={e => setMultiplayerInputCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder={t("multi-8-digits")}
                  style={{ fontSize: 24, letterSpacing: 4, textAlign: 'center', width: 230 }}
                /></div>
                <div><button className="play-button enabled" onClick={handleJoinMultiplayer}>{t("join-button")}</button></div>
              </div>
              <div className="multiplayer-box-join">
                <h2>{t("create-multiplayer-game")}</h2>
                <div><button className="play-button enabled" onClick={handleCreateMultiplayer}>{t("create-button")}</button></div>
              </div>
            </>}
            {!isLoggedIn && <>{t("multi-unavailable-login")}</>}
          </div>}
          {createMultiplayerMode && <MultiplayerConfigScreen t={t} callback={callback} authToken={authToken} userUsername={userUsername} />}
        </>}
      </div>
    </>
  )
}

export const GameSelectorAtlas = ({t, selectedAtlas, setSelectedAtlas, selectedCategory, setSelectedCategory} :
  { t: TFunction<"translation", undefined>; selectedAtlas: string; setSelectedAtlas: React.Dispatch<React.SetStateAction<string>>; 
    selectedCategory: string; setSelectedCategory: React.Dispatch<React.SetStateAction<string>> }
) => {
  return (
    <div className="atlas-layout">
      <div className="category-list">
        {atlasCategories.map((category) => (
          <button key={category}
            className={selectedCategory == category ? "category-button selected" : "category-button"}
            onClick={() => { setSelectedCategory(category) }}>
            {t(category)}
          </button>
        ))}
      </div>
      <div className="atlas-choices-display">
        {Object.entries(atlasFiles)
          .filter(([key, b]) => b.atlas_category == selectedCategory)
          .sort(([, a], [, b]) => (a.difficulty || 0) - (b.difficulty || 0))
          .map(([key, atlas]) => (
            <button key={atlas.name}
              className={selectedAtlas == key ? "panel-button selected" : "panel-button"}
              onClick={() => setSelectedAtlas(key)}>
              <span className="atlas-info" dangerouslySetInnerHTML={{ __html: t(key.toLowerCase() + "_info") }}></span>
              {atlas.difficulty > 0 && (
                <span className="difficulty-icons">
                  {[...Array(atlas.difficulty)].map((_, index) => (
                    <img key={index} src="assets/interface/star.png" alt="Star" className="star-icon" />
                  ))}
                </span>
              )}
            </button>
          ))}
      </div>
    </div>
  )
}

export default GameSelector

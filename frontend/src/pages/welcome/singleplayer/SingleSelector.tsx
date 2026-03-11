import { navigate } from "vike/client/router";
import { useApp } from "../../../context/AppContext";
import { useGameSelector } from "../../../context/GameSelectorContext";
import { GameSelectorAtlas } from "../GameSelectorAtlas";
import "./SingleSelector.css";
import { useState } from "react";

export function SingleSelector() {
    const { t } = useApp();
    const { selectedAtlas, selectedMode, setSelectedMode } = useGameSelector();
    const [blindMode, setBlindMode] = useState(false);
    return (
        <>
            <section className="atlas-selection">
                <h2><img src="/interface/numero-1.png" alt="Atlas Icon" /> <span>{t("select_atlas")}</span></h2>
                <GameSelectorAtlas />
            </section>

            <section className="mode-selection">
                <h2><img src="/interface/numero-2.png" alt="Game Mode Icon" /> <span>{t("select_game_mode")}</span></h2>
                <div className="mode-buttons">
                    <button className={selectedMode == "navigation" ? "mode-button selected" : "mode-button"}
                        data-umami-event="select single mode" data-umami-event-mode="navigation"
                        onClick={() => setSelectedMode("navigation")}>
                        <img src="/interface/boussole.png" alt="Boussole Icon" />
                        <span>{t("navigation_mode")}</span>
                        <span className="mode-description">{t("navigation_description")}</span>
                    </button>
                    <button className={selectedMode == "practice" ? "mode-button selected" : "mode-button"}
                        data-umami-event="select single mode" data-umami-event-mode="practice"
                        onClick={() => setSelectedMode("practice")}>
                        <img src="/interface/practice.png" alt="Practice Icon" />
                        <span>{t("practice_mode")}</span>
                        <span className="mode-description">{t("practice_description")}</span>
                    </button>
                    <button className={selectedMode == "streak" ? "mode-button selected" : "mode-button"}
                        data-umami-event="select single mode" data-umami-event-mode="streak"
                        onClick={() => setSelectedMode("streak")}>
                        <img src="/interface/flame.png" alt="Flame Icon" />
                        <span>{t("streak_mode")}</span>
                        <span className="mode-description">{t("streak_description")}</span>
                    </button>
                    <button className={selectedMode == "time-attack" ? "mode-button selected" : "mode-button"}
                        data-umami-event="select single mode" data-umami-event-mode="time-attack"
                        onClick={() => setSelectedMode("time-attack")}>
                        <img src="/interface/chronometer.png" alt="Chronometer Icon" />
                        <span>{t("time_attack_mode")}</span>
                        <span className="mode-description">{t("time_attack_description")}</span>
                    </button>
                </div>
                <div className="blind-mode-container">
                    <label className="blind-mode-label" htmlFor="blind-mode-checkbox">
                        <input
                            id="blind-mode-checkbox"
                            type="checkbox"
                            checked={blindMode}
                            onChange={() => setBlindMode(!blindMode)}
                            style={{ marginRight: "10px", cursor: "pointer" }}
                            data-umami-event="toggle blind mode"
                            data-umami-event-blind-mode-state={blindMode ? "on" : "off"}
                        />
                        <span>{t("blind_mode") || "Blind Mode"}</span>
                        <div className="blind-mode-description" style={{
                            fontSize: "0.9rem",
                            color: "#666",
                            marginLeft: "10px"
                        }}>
                            {t("blind_mode_description") || "No region highlighting. Challenge yourself for 1.5x points!"}
                        </div>
                    </label>
                    
                </div>
                <button id="play-button"
                    onClick={()=>{ 
                        if(selectedAtlas && selectedMode){ 
                            navigate(`/singleplayer/${selectedMode}/${selectedAtlas}${blindMode ? "?blind=true" : ""}`);
                        }
                    }}
                    data-umami-event="start singleplayer button" data-umami-event-start-single-altas={selectedAtlas}
                    data-umami-event-start-single-mode={selectedMode}
                    data-umami-event-start-single-effective={selectedAtlas && selectedMode}
                    className={(selectedAtlas == "" || selectedMode == "") ? "play-button disabled" : "play-button enabled"}>
                    {t("play_button")}
                </button>
            </section>
        </>
    )
}
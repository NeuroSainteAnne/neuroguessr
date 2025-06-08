import { useApp } from "../../../context/AppContext";
import { useGameSelector } from "../../../context/GameSelectorContext";
import { GameSelectorAtlas } from "../GameSelectorAtlas";

export function SingleSelector() {
    const { t } = useApp();
    const { selectedAtlas, selectedMode, setSelectedMode } = useGameSelector();
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
                        onClick={() => setSelectedMode("navigation")}>
                        <img src="/interface/boussole.png" alt="Boussole Icon" />
                        <span>{t("navigation_mode")}</span>
                        <span className="mode-description">{t("navigation_description")}</span>
                    </button>
                    <button className={selectedMode == "practice" ? "mode-button selected" : "mode-button"}
                        onClick={() => setSelectedMode("practice")}>
                        <img src="/interface/practice.png" alt="Practice Icon" />
                        <span>{t("practice_mode")}</span>
                        <span className="mode-description">{t("practice_description")}</span>
                    </button>
                    <button className={selectedMode == "streak" ? "mode-button selected" : "mode-button"}
                        onClick={() => setSelectedMode("streak")}>
                        <img src="/interface/flame.png" alt="Flame Icon" />
                        <span>{t("streak_mode")}</span>
                        <span className="mode-description">{t("streak_description")}</span>
                    </button>
                    <button className={selectedMode == "time-attack" ? "mode-button selected" : "mode-button"}
                        onClick={() => setSelectedMode("time-attack")}>
                        <img src="/interface/chronometer.png" alt="Chronometer Icon" />
                        <span>{t("time_attack_mode")}</span>
                        <span className="mode-description">{t("time_attack_description")}</span>
                    </button>
                </div>
                <a id="play-button"
                    href={`/singleplayer/${selectedAtlas}/${selectedMode}`}
                    onClick={(e)=>{ if(selectedAtlas == "" || selectedMode == ""){ e.preventDefault(); e.stopPropagation(); }}}
                    className={(selectedAtlas == "" || selectedMode == "") ? "play-button disabled" : "play-button enabled"}>
                    {t("play_button")}
                </a>
            </section>
        </>
    )
}
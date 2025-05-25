import { useEffect } from 'react';
import './Header.css'
import type { TFunction } from 'i18next';
import LoginDropdownMenu from './LoginDropdownMenu';
import SearchBar from './SearchBar';
import OptionsDropdown from './OptionsDropdown';

function Header({currentLanguage, currentPage, atlasRegions, t, callback, 
    isLoggedIn, userFirstName, userLastName, 
    headerText, headerStreak, headerTime, headerScore, headerErrors,
    viewerOptions}: 
    { currentLanguage: string, currentPage: string, atlasRegions: AtlasRegion[],
    t: TFunction<"translation", undefined>, callback: AppCallback, isLoggedIn: boolean, 
    userFirstName: string, userLastName: string, 
    headerText: string, headerStreak: string, headerTime: string, headerScore: string,
    headerErrors: string,
    viewerOptions: DisplayOptions }) {

    return (
        <>
        <header className="navbar">
            <div className="navbar-container">
                <div className="navbar-left logo-title-container-navbar logo-title-container" 
                    onClick={()=>{callback.gotoPage("welcome")}}>
                    <img src="assets/interface/neuroguessr.png" alt="NeuroGuessr Logo" className="logo" />
                    <h1>{currentPage=="neurotheka" ? t("neuroglossaire_title") : t("app_title")}</h1>
                </div>
                <div className="navbar-middle">
                    { headerText != "" && <div className="target-label-container">
                        <p id="target-label"><span className="target-text">{headerText}</span></p>
                    </div>}
                    { currentPage == "neurotheka" && <SearchBar t={t} callback={callback} atlasRegions={atlasRegions} />}
                    { currentPage == "singleplayer" && <div className="score-error-container">
                        {headerScore && <p id="score-label">{headerScore}</p>}
                        {headerErrors && <p id="error-label">{t('errors_label')}: {headerErrors}</p>}
                        {headerStreak && <p id="streak-label">
                            <span>{t("streak_label")}: </span>
                            <span id="streak-value">{headerStreak}</span>
                            <img src="assets/interface/flame.png" alt="Streak Flame" className="streak-flame-icon-small" />
                        </p>}
                        {headerTime && <p id="time-label">{t("time_label")}: {headerTime}</p>}
                    </div>}
                </div>
        
                <div className="navbar-right">
                    {(currentPage == "neurotheka" || currentPage == "singleplayer") && <OptionsDropdown
                        currentPage={currentPage} t={t} callback={callback} viewerOptions={viewerOptions} />}
                    {!isLoggedIn && 
                    <button id="guest-sign-in-button" className="guest-sign-in-button"
                        onClick={()=>callback.gotoPage("login")}>{t("sign_in")}</button>
                    }
                    {isLoggedIn && 
                        <LoginDropdownMenu 
                            currentLanguage={currentLanguage}
                            t={t} callback={callback}
                            userFirstName={userFirstName} userLastName={userLastName} />
                    }
                </div>
            </div>
        </header>
        </>
    )
}

export default Header

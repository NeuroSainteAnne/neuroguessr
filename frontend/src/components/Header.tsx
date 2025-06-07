import { useApp } from '../context/AppContext';
import "./Header.css";
import LoginDropdownMenu from './LoginDropdownMenu';
import OptionsDropdown from './OptionsDropdown';
import SearchBar from './SearchBar';

function Header() {
    const {currentLanguage, atlasRegions, t, handleChangeLanguage, 
    isLoggedIn, userFirstName, userLastName, 
    headerText, headerTextMode, headerStreak, headerTime, headerScore, headerErrors,
    viewerOptions, pageContext } = useApp();

    // Get the current path from pageContext
    const currentPath = pageContext?.urlPathname || '';
    const parts = currentPath.split('/');
    const isNeurotheka = parts[1] === 'neurotheka';
    const isSingleplayer = parts[1] === 'singleplayer'
    const isMultiplayer = parts[1] === '/multiplayer';

    return (
        <>
            <div className="navbar-container">
                <a className="navbar-left logo-title-container-navbar logo-title-container" 
                    href="/welcome">
                    <img src="/interface/neuroguessr-64.png" alt="NeuroGuessr Logo" className="logo" />
                    <h1>{isNeurotheka ? t("neuroglossaire_title") : t("app_title")}</h1>
                </a>
                <div className="navbar-middle">
                    { headerText != "" && <div className="target-label-container">
                        <p id="target-label">
                            <span className="target-text" style={
                                ((mode)=>{
                                    switch(mode) {
                                        case "success":
                                            return { color: '#4ade80', fontWeight: 'bold', transition: 'all 0.1s ease-in-out' };
                                        case "failure":
                                            return { color: '#f87171', fontWeight: 'bold', transition: 'all 0.1s ease-in-out' };
                                    }
                                    return {};
                                })(headerTextMode)
                            }>{headerText}</span>
                        </p>
                    </div>}
                    {isNeurotheka && <SearchBar />}
                    {isSingleplayer && <div className="score-error-container">
                            {headerScore && <p id="score-label">{headerScore}</p>}
                            {headerErrors && <p id="error-label">{t('errors_label')}: {headerErrors}</p>}
                            {headerStreak && <p id="streak-label">
                                <span>{t("streak_label")}: </span>
                                <span id="streak-value">{headerStreak}</span>
                                <img src="/interface/flame.png" alt="Streak Flame" className="streak-flame-icon-small" />
                            </p>}
                            {headerTime && <p id="time-label">{t("time_label")}: {headerTime}</p>}
                        </div>}
                    {isMultiplayer && <div className="score-error-container">
                            {headerScore && <p id="score-label">{headerScore}</p>}
                            {headerErrors && <p id="error-label">{t('errors_label')}: {headerErrors}</p>}
                            {headerTime && <p id="time-label">{headerTime}</p>}
                        </div>}
                </div>
        
                <div className="navbar-right">
                    {!isLoggedIn && <>
                        <a id="guest-sign-in-button" className="guest-sign-in-button"
                            href="/login">{t("sign_in")}</a>
                        <span className={currentLanguage=="fr"?
                                    "lang-icon-btn lang-icon-btn-active":
                                    "lang-icon-btn"}
                                data-lang="fr" aria-label="Français" 
                                onClick={()=>{handleChangeLanguage('fr')}}>
                            <img src="/interface/fr-64.png" alt="FR" />
                        </span>
                        <span className={currentLanguage=="en"?
                                    "lang-icon-btn lang-icon-btn-active":
                                    "lang-icon-btn"}
                                data-lang="en" aria-label="English"
                                onClick={()=>{handleChangeLanguage('en')}}>
                            <img src="/interface/en-64.png" alt="EN" />
                        </span>
                    </>}
                    {isLoggedIn && 
                        <LoginDropdownMenu />
                    }
                    {(isNeurotheka || isSingleplayer || isMultiplayer) && <OptionsDropdown />} 
                </div>
            </div>
        </>
    )
}

export default Header;
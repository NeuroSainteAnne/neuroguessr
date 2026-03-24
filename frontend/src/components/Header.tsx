import { useApp } from '../context/AppContext';
import "./Header.css";
import LoginDropdownMenu from './LoginDropdownMenu';
import OptionsDropdown from './OptionsDropdown';
import { useState, useEffect } from 'react';

function Header() {
    const {currentLanguage, t, handleChangeLanguage,
    isLoggedIn, isMobileView,
    headerMessages, headerStreak, headerTime, headerErrors, headerScore,
    pageContext, showTooltip, hideTooltip } = useApp();

    // Use local state to track if we're hydrated to prevent hydration mismatch
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        setIsHydrated(true);
    }, []);

    const handleInfoHover = (e: React.MouseEvent<HTMLSpanElement>, infoText: string | undefined) => {
        if(infoText){
            const rect = e.currentTarget.getBoundingClientRect();
            showTooltip(infoText, rect.left + rect.width / 2, rect.top - 8);
        }
    };

    const handleInfoLeave = () => {
        hideTooltip();
    };

    // Get the current path from pageContext
    const currentPath = pageContext?.urlPathname || '';
    const parts = currentPath.split('/');
    const isSingleplayer = parts[1] === 'singleplayer'
    const isMultiplayer = parts[1] === 'multiplayer';
    const isAuthPage = parts[1] ? ['login', 'register', 'validate', 'resetpwd'].includes(parts[1]) : false;

    // During SSR and initial client render, show a consistent basic header
    // Only show authentication-dependent content after hydration
    const showAuthContent = isHydrated;

    return (
        <>
            <div className="navbar-container">
                <a className="navbar-left logo-title-container-navbar logo-title-container"
                    data-umami-event="header logo click"
                    href="/welcome">
                    <img src="/interface/neuroguessr-64.png" alt="NeuroGuessr Logo" className="logo" />
                    <div className="title-container">
                        <h1>{t ? t("app_title") : "NeuroGuessr"}</h1>
                        <span className="beta-label">{t ? t("beta-version") : "BETA"}</span>
                    </div>
                </a>
                <div className="navbar-middle">
                    {headerMessages.length > 0 && <div className="target-label-container">
                        {headerMessages.map(msg => {
                            const colorMap: Record<string, string> = {
                                'success': '#4ade80',
                                'failure': '#f87171'
                            };
                            const resolvedColor = msg.color 
                                ? (colorMap[msg.color] || msg.color)
                                : 'inherit';
                            
                            return (
                                <p key={msg.id} className="header-message">
                                    <span className="target-text" style={{
                                        color: resolvedColor,
                                        fontSize: msg.fontSize || 'inherit',
                                        fontWeight: msg.fontWeight || 'bold',
                                        transition: 'color 0.2s ease-in-out, font-size 0.2s ease-in-out'
                                    }}>
                                        {msg.text}
                                    </span>
                                    {msg.infoContent && (
                                        <span className="header-info-icon"
                                            onMouseEnter={(e) => handleInfoHover(e, msg.infoContent)}
                                            onMouseLeave={handleInfoLeave}>
                                            ℹ️
                                        </span>
                                    )}
                                    {msg.infoSource && (
                                        <span className="header-info-icon"
                                            onMouseEnter={(e) => handleInfoHover(e, msg.infoSource)}
                                            onMouseLeave={handleInfoLeave}>
                                            📖
                                        </span>
                                    )}
                                </p>
                            );
                        })}
                    </div>}
                    {isSingleplayer && <div className="score-error-container">
                            {headerScore && <p id="score-label">
                                <span>{t ? t("score_label") : 'Score'}: </span>
                                <span id="score-value">{headerScore}</span>
                            </p>}
                            {headerErrors && <p id="error-label">{t ? t('errors_label') : 'Errors'}: {headerErrors}</p>}
                            {headerStreak && <p id="streak-label">
                                <span>{t ? t("streak_label") : 'Streak'}: </span>
                                <span id="streak-value">{headerStreak}</span>
                                <img src="/interface/flame.png" alt="Streak Flame" className="streak-flame-icon-small" />
                            </p>}
                            {headerTime && <p id="time-label">{headerTime}</p>}
                        </div>}
                    {isMultiplayer && <div className="score-error-container">
                            {headerErrors && <p id="error-label">{t ? t('errors_label') : 'Errors'}: {headerErrors}</p>}
                            {headerTime && <p id="time-label">{headerTime}</p>}
                        </div>}
                </div>

                <div className="navbar-right">
                    {(!showAuthContent || !isLoggedIn) && <>
                        <a id="guest-sign-in-button" className="guest-sign-in-button"
                            data-umami-event="goto login button" data-umami-event-source="header"
                            href={isAuthPage ? '/login' : `/login?returnURL=${encodeURIComponent(currentPath)}`}>{t ? t("sign_in") : "Sign In"}</a>
                        <button className={currentLanguage=="fr"?
                                    "lang-icon-btn lang-icon-btn-active":
                                    "lang-icon-btn"}
                                data-umami-event="language switcher" data-umami-event-language="fr" data-umami-event-logged="no"
                                data-lang="fr" aria-label="Français"
                                onClick={()=>{handleChangeLanguage('fr')}}>
                            <img src="/interface/fr-64.png" alt="FR" />
                        </button>
                        <button className={currentLanguage=="en"?
                                    "lang-icon-btn lang-icon-btn-active":
                                    "lang-icon-btn"}
                                data-umami-event="language switcher" data-umami-event-language="en" data-umami-event-logged="no"
                                data-lang="en" aria-label="English"
                                onClick={()=>{handleChangeLanguage('en')}}>
                            <img src="/interface/en-64.png" alt="EN" />
                        </button>
                    </>}
                    {showAuthContent && isLoggedIn &&
                        <LoginDropdownMenu />
                    }
                    {(isSingleplayer || isMultiplayer) && !isMobileView && <OptionsDropdown />}
                </div>
            </div>
        </>
    )
}export default Header;
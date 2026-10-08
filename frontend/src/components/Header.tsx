import { useApp } from '../context/AppContext';
import "./Header.css";
import LoginDropdownMenu from './LoginDropdownMenu';
import SearchBar from './SearchBar';
import { useState, useEffect, useRef } from 'react';

function Header() {
    const {currentLanguage, t, handleChangeLanguage,
    isLoggedIn,
    headerMessages, headerStreak, headerTime, headerErrors, headerScore,
    pageContext, showTooltip, hideTooltip,
    isMobileView } = useApp();

    // Use local state to track if we're hydrated to prevent hydration mismatch
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        setIsHydrated(true);
    }, []);

    const langSwitcherRef = useRef<HTMLDivElement>(null);
    const [langSliderStyle, setLangSliderStyle] = useState<React.CSSProperties>({ opacity: 0 });

    useEffect(() => {
        if (!langSwitcherRef.current) return;
        const activeBtn = langSwitcherRef.current.querySelector('.lang-btn.active') as HTMLElement;
        if (!activeBtn) return;
        const containerRect = langSwitcherRef.current.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();
        setLangSliderStyle({
            left: btnRect.left - containerRect.left,
            width: btnRect.width,
            opacity: 1,
        });
    }, [currentLanguage, isHydrated]);

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
    const isNavigation = parts[1] === 'singleplayer' && parts[2] === 'navigation';
    const isAuthPage = parts[1] ? ['login', 'register', 'validate', 'resetpwd'].includes(parts[1]) : false;

    // During SSR and initial client render, show a consistent basic header
    // Only show authentication-dependent content after hydration
    const showAuthContent = isHydrated;

    const getNavbarMiddle = () => {
        return (
            <div className="navbar-middle">
                {isNavigation ? (
                    <div className="nav-info-box nav-info-box-header">
                        <div className="header-region-row">
                            {headerMessages[0] && (
                                <p className="header-message">
                                    <span className="target-text">{headerMessages[0].text}</span>
                                </p>
                            )}
                            {!isMobileView && <SearchBar inline />}
                        </div>
                        {headerMessages[1]?.text && (
                            <p className="nav-region-short">{headerMessages[1].text}</p>
                        )}
                    </div>
                ) : (
                    headerMessages.length > 0 && <div className="target-label-container game-info-box-header">
                    {(() => {
                        const firstMsg = headerMessages[0];
                        const infoMsgs = headerMessages.slice(1);
                        const bgColorMap: Record<string, string> = {
                            'success': '#4ade80',
                            'failure': '#f87171'
                        };
                        if (!firstMsg) return null;
                        const resolvedBg = firstMsg.color
                            ? (bgColorMap[firstMsg.color] || firstMsg.color)
                            : 'var(--text-main)';
                        // Check if this is a review header (contains widget structure)
                        const isReviewHeader = firstMsg.text && firstMsg.text.includes('review-widget');

                        return (<>
                            <div className="header-region-row">
                                {isReviewHeader ? (
                                    <div className="review-header-widget" dangerouslySetInnerHTML={{ __html: firstMsg.text }} />
                                ) : (
                                    <p className="header-message">
                                        <span className="target-text" style={{
                                            backgroundColor: resolvedBg,
                                            color: 'var(--bg-page)',
                                            fontSize: firstMsg.fontSize || 'inherit',
                                            fontWeight: firstMsg.fontWeight || 'bold',
                                            transition: 'background-color 0.15s ease-in-out'
                                        }}>
                                            {firstMsg.text}
                                        </span>
                                        {firstMsg.infoContent && (
                                            <span className="header-info-icon"
                                                onMouseEnter={(e) => handleInfoHover(e, firstMsg.infoContent)}
                                                onMouseLeave={handleInfoLeave}>ℹ️</span>
                                        )}
                                        {firstMsg.infoSource && firstMsg.infoSource.length > 0 && firstMsg.infoSource.map((source, idx) => {
                                            const tooltipText = `${source.auteur} (${source.year}) — ${source.journal}`;
                                            const href = source.doi ? (source.doi.startsWith('http') ? source.doi : `https://doi.org/${source.doi}`) : undefined;
                                            return href ? (
                                                <a
                                                    key={idx}
                                                    href={href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="header-info-icon"
                                                    style={{ cursor: 'pointer', textDecoration: 'none' }}
                                                    onMouseEnter={(e) => handleInfoHover(e, tooltipText)}
                                                    onMouseLeave={handleInfoLeave}>
                                                    📖
                                                </a>
                                            ) : (
                                                <span key={idx} className="header-info-icon"
                                                    onMouseEnter={(e) => handleInfoHover(e, tooltipText)}
                                                    onMouseLeave={handleInfoLeave}>
                                                    📖
                                                </span>
                                            );
                                        })}
                                    </p>
                                )}
                            </div>
                            {infoMsgs.map(msg => (
                                <p key={msg.id} className="header-info-line">
                                    <span className="header-info-text">{msg.text}</span>
                                    {msg.infoContent && (
                                        <span className="header-info-icon"
                                            onMouseEnter={(e) => handleInfoHover(e, msg.infoContent)}
                                            onMouseLeave={handleInfoLeave}>ℹ️</span>
                                    )}
                                    {msg.infoSource && msg.infoSource.length > 0 && msg.infoSource.map((source, idx) => {
                                        const tooltipText = `${source.auteur} (${source.year}) — ${source.journal}`;
                                        const href = source.doi ? (source.doi.startsWith('http') ? source.doi : `https://doi.org/${source.doi}`) : undefined;
                                        return href ? (
                                            <a
                                                key={idx}
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="header-info-icon"
                                                style={{ cursor: 'pointer', textDecoration: 'none' }}
                                                onMouseEnter={(e) => handleInfoHover(e, tooltipText)}
                                                onMouseLeave={handleInfoLeave}>
                                                📖
                                            </a>
                                        ) : (
                                            <span key={idx} className="header-info-icon"
                                                onMouseEnter={(e) => handleInfoHover(e, tooltipText)}
                                                onMouseLeave={handleInfoLeave}>
                                                📖
                                            </span>
                                        );
                                    })}
                                </p>
                            ))}
                        </>);
                    })()}
                    </div>
                )}
                {isSingleplayer && <div className="score-error-container game-stats-box-header">
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
                {isMultiplayer && <div className="score-error-container game-stats-box-header">
                        {headerErrors && <p id="error-label">{t ? t('errors_label') : 'Errors'}: {headerErrors}</p>}
                        {headerTime && <p id="time-label">{headerTime}</p>}
                    </div>}
            </div>
        )
    }

    return (
        <>
            <div className="navbar-container">
                <a className="navbar-left logo-title-container-navbar logo-title-container"
                    data-umami-event="header logo click"
                    href="/welcome">
                    <img src="/interface/neuroguessr-360.png" alt="NeuroGuessr Logo" className="logo" />
                    <div className="title-container">
                        <h1>{t ? t("app_title") : "NeuroGuessr"}</h1>
                        <span className="beta-label">{t ? t("beta-version") : "BETA"}</span>
                    </div>
                </a>

                {!isMobileView && getNavbarMiddle()}

                <div className="navbar-right">
                    {(!showAuthContent || !isLoggedIn) && <>
                        <a id="guest-sign-in-button" className="guest-sign-in-button"
                            data-umami-event="goto login button" data-umami-event-source="header"
                            href={isAuthPage ? '/login' : `/login?returnURL=${encodeURIComponent(currentPath)}`}>{t ? t("sign_in") : "Sign In"}</a>
                    </>}
                    <div className="lang-switcher" ref={langSwitcherRef}>
                        <div className="lang-slider" style={langSliderStyle} />
                        <button className={`lang-btn ${currentLanguage==="fr"?"active":""}`}
                            data-umami-event="language switcher" data-umami-event-language="fr"
                            onClick={()=>handleChangeLanguage('fr')}>FR</button>
                        <button className={`lang-btn ${currentLanguage==="en"?"active":""}`}
                            data-umami-event="language switcher" data-umami-event-language="en"
                            onClick={()=>handleChangeLanguage('en')}>EN</button>
                    </div>
                    {showAuthContent && isLoggedIn &&
                        <LoginDropdownMenu />
                    }
                </div>
            </div>
            {isMobileView && getNavbarMiddle()}

        </>
    )
}export default Header;
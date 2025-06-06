import React from 'react'
import { useEffect, type RefObject } from 'react';
import type { TFunction } from 'i18next';
import LoginDropdownMenu from './LoginDropdownMenu';
import SearchBar from './SearchBar';
import OptionsDropdown from './OptionsDropdown';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';

function Header({ref, currentLanguage, atlasRegions, t, callback, 
    isLoggedIn, userFirstName, userLastName, 
    headerText, headerTextMode, headerStreak, headerTime, headerScore, headerErrors,
    viewerOptions}: 
    { ref:RefObject<HTMLDivElement | null>, currentLanguage: string, atlasRegions: AtlasRegion[],
    t: TFunction<"translation", undefined>, callback: AppCallback, isLoggedIn: boolean, 
    userFirstName: string, userLastName: string, 
    headerText: string, headerTextMode: string, 
    headerStreak: string, headerTime: string, headerScore: string,
    headerErrors: string,
    viewerOptions: DisplayOptions }) {
    const location = useLocation();
    const navigate = useNavigate();

    return (
        <>
            <link rel="stylesheet" href="/assets/styles/Header.css" />
            <div className="navbar-container" ref={ref}>
                <a className="navbar-left logo-title-container-navbar logo-title-container" 
                    href="/welcome"
                    onClick={(e)=>{e.preventDefault(); navigate("/welcome")}}>
                    <img src="/assets/interface/neuroguessr.png" alt="NeuroGuessr Logo" className="logo" />
                    <h1>{location.pathname.includes("neurotheka") ? t("neuroglossaire_title") : t("app_title")}</h1>
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
                    <Routes>
                        <Route path="/neurotheka/*" element={<SearchBar t={t} callback={callback} atlasRegions={atlasRegions} />} />
                        <Route path="/singleplayer/*" element={<div className="score-error-container">
                            {headerScore && <p id="score-label">{headerScore}</p>}
                            {headerErrors && <p id="error-label">{t('errors_label')}: {headerErrors}</p>}
                            {headerStreak && <p id="streak-label">
                                <span>{t("streak_label")}: </span>
                                <span id="streak-value">{headerStreak}</span>
                                <img src="/assets/interface/flame.png" alt="Streak Flame" className="streak-flame-icon-small" />
                            </p>}
                            {headerTime && <p id="time-label">{t("time_label")}: {headerTime}</p>}
                        </div>} />
                        <Route path="/multiplayer-game/*" element={<div className="score-error-container">
                            {headerScore && <p id="score-label">{headerScore}</p>}
                            {headerErrors && <p id="error-label">{t('errors_label')}: {headerErrors}</p>}
                            {headerTime && <p id="time-label">{headerTime}</p>}
                        </div>} />
                        <Route path="*" element={<></>} />
                    </Routes>
                </div>
        
                <div className="navbar-right">
                    {!isLoggedIn && <>
                        <a id="guest-sign-in-button" className="guest-sign-in-button"
                            href="/login"
                            onClick={(e)=>{e.preventDefault(); navigate("/login")}}>{t("sign_in")}</a>
                        <span className={currentLanguage=="fr"?
                                    "lang-icon-btn lang-icon-btn-active":
                                    "lang-icon-btn"}
                                data-lang="fr" aria-label="Français" 
                                onClick={()=>{callback.handleChangeLanguage('fr')}}>
                            <img src="/assets/interface/fr.png" alt="FR" />
                        </span>
                        <span className={currentLanguage=="en"?
                                    "lang-icon-btn lang-icon-btn-active":
                                    "lang-icon-btn"}
                                data-lang="en" aria-label="English"
                                onClick={()=>{callback.handleChangeLanguage('en')}}>
                            <img src="/assets/interface/en.png" alt="EN" />
                        </span>
                    </>}
                    {isLoggedIn && 
                        <LoginDropdownMenu 
                            currentLanguage={currentLanguage}
                            t={t} callback={callback}
                            userFirstName={userFirstName} userLastName={userLastName} />
                    }
                    <Routes>
                        <Route path="/neurotheka/*" element={<OptionsDropdown t={t} callback={callback} viewerOptions={viewerOptions} />} />
                        <Route path="/singleplayer/*" element={<OptionsDropdown t={t} callback={callback} viewerOptions={viewerOptions} />} />
                        <Route path="/multiplayer-game/*" element={<OptionsDropdown t={t} callback={callback} viewerOptions={viewerOptions} />} />
                        <Route path="*" element={<></>} />
                    </Routes>
                </div>
            </div>
        </>
    )
}

export default Header;
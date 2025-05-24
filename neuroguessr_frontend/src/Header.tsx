import { useEffect } from 'react';
import './Header.css'
import type { TFunction } from 'i18next';
import LoginDropdownMenu from './LoginDropdownMenu';
import SearchBar from './SearchBar';
import OptionsDropdown from './OptionsDropdown';

function Header({currentLanguage, currentPage, atlasRegions, t, callback, 
    isLoggedIn, userFirstName, userLastName, headerText, viewerOptions}: 
    { currentLanguage: string, currentPage: string, atlasRegions: AtlasRegion[],
    t: TFunction<"translation", undefined>, callback: AppCallback, isLoggedIn: boolean, 
    userFirstName: string, userLastName: string, headerText: string, viewerOptions: DisplayOptions }) {

    return (
        <>
        <header className="navbar">
            <div className="navbar-container">
                <div className="navbar-left logo-title-container-navbar logo-title-container" 
                    onClick={()=>{callback.setCurrentPage("welcome")}}>
                    <img src="assets/interface/neuroguessr.png" alt="NeuroGuessr Logo" className="logo" />
                    <h1>{currentPage=="neurotheka" ? t("neuroglossaire_title") : t("app_title")}</h1>
                </div>
                <div className="navbar-middle">
                    { headerText != "" && <div className="target-label-container">
                        <p id="target-label"><span className="target-text">{headerText}</span></p>
                    </div>}
                    { currentPage == "neurotheka" && <SearchBar t={t} callback={callback} atlasRegions={atlasRegions} />}
                </div>
        
                <div className="navbar-right">
                    {currentPage == "neurotheka" && <OptionsDropdown
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

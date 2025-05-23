import { useEffect } from 'react';
import './Header.css'

function Header({handleChangeLanguage, currentLanguage, setCurrentPage}: 
    { handleChangeLanguage: (lang: string) => void, 
    currentLanguage: string,
    setCurrentPage: (page: string) => void }) {
        
    const isAuthenticated = false;

    return (
        <>
        <header className="navbar">
            <div className="navbar-container">
                <div className="navbar-left logo-title-container-navbar logo-title-container" 
                    onClick={()=>{setCurrentPage("welcome")}}>
                    <img src="assets/interface/neuroguessr.png" alt="NeuroGuessr Logo" className="logo" />
                    <h1 data-i18n="app_title">NeuroGuessr</h1>
                </div>
                <div className="navbar-right">
                    {!isAuthenticated && 
                    <button id="guest-sign-in-button" className="guest-sign-in-button" data-i18n="sign_in">Sign In</button>
                    }
                    {isAuthenticated && 
                    <div id="user-dropdown-container" className="user-dropdown-container">
                        <button id="user-menu-button" className="user-menu-button">
                            <img src="/neuroguessr_web/data/user_brain.png" alt="User Icon" className="user-icon" />
                            <span id="welcome-username"></span>
                            <i className="fas fa-caret-down dropdown-arrow"></i>
                        </button>
                        <div id="user-dropdown-menu" className="user-dropdown-menu">
                            <div className="dropdown-header">
                                <span id="dropdown-username-header"></span>
                            </div>
                            <button id="config-button-dropdown" className="dropdown-item">
                                <img src="/neuroguessr_web/data/config.png" alt="Config icon" />
                                <span data-i18n="config_mode">Configuration</span>
                            </button>
                            <button id="stats-button-dropdown" className="dropdown-item">
                                <img src="/neuroguessr_web/data/statistics.png" alt="Stats icon" /> <span data-i18n="my_stats">My Stats</span>
                            </button>
                            <div className="language-switcher-dropdown">
                                <button className={currentLanguage=="fr"?
                                            "lang-icon-btn-dropdown lang-icon-btn-dropdown-active":
                                            "lang-icon-btn-dropdown"}
                                        data-lang="fr" aria-label="Français" 
                                        onClick={()=>{handleChangeLanguage('fr')}}>
                                    <img src="assets/interface/fr.png" alt="FR" />
                                </button>
                                <button className={currentLanguage=="en"?
                                            "lang-icon-btn-dropdown lang-icon-btn-dropdown-active":
                                            "lang-icon-btn-dropdown"}
                                        data-lang="en" aria-label="English"
                                        onClick={()=>{handleChangeLanguage('en')}}>
                                    <img src="assets/interface/en.png" alt="EN" />
                                </button>
                            </div>
                            <button id="logout-button-dropdown" className="dropdown-item logout-item">
                                <span data-i18n="logout_mode">Unlog</span>
                            </button>
                        </div>
                    </div>
                    }
                </div>
            </div>
        </header>
        </>
    )
}

export default Header

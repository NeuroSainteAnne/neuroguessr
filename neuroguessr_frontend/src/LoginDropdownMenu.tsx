
import { useEffect } from 'react';
import './LoginDropdownMenu.css'
import type { TFunction } from 'i18next';

function LoginDropdownMenu({currentLanguage, t, callback}: 
    { currentLanguage: string,
    t: TFunction<"translation", undefined>, callback: AppCallback }) {

    return (
        <div id="user-dropdown-container" className="user-dropdown-container">
            <button id="user-menu-button" className="user-menu-button">
                <img src="/neuroguessr_web/data/user_brain.png" alt="User Icon" className="user-icon" />
                <span id="welcome-username">USERNAME</span>
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
                            onClick={()=>{callback.handleChangeLanguage('fr')}}>
                        <img src="assets/interface/fr.png" alt="FR" />
                    </button>
                    <button className={currentLanguage=="en"?
                                "lang-icon-btn-dropdown lang-icon-btn-dropdown-active":
                                "lang-icon-btn-dropdown"}
                            data-lang="en" aria-label="English"
                            onClick={()=>{callback.handleChangeLanguage('en')}}>
                        <img src="assets/interface/en.png" alt="EN" />
                    </button>
                </div>
                <button id="logout-button-dropdown" className="dropdown-item logout-item">
                    <span data-i18n="logout_mode">Unlog</span>
                </button>
            </div>
        </div>
    )
}
export default LoginDropdownMenu
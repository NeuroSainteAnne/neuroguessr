import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import "./LoginDropdownMenu.css";

function LoginDropdownMenu() {
    const {currentLanguage, t, userFirstName, userLastName, handleChangeLanguage, logout} = useApp();
    const [isVisibleDropdown, setIsVisibleDropdown] = useState<boolean>(false)
    const dropdownMenuRef = useRef<HTMLInputElement>(null);

    const toggleDropdown = () => {
        setIsVisibleDropdown(!isVisibleDropdown)
    }

    useEffect(()=>{
        const handleClick = (event: MouseEvent) => {
            if (
                isVisibleDropdown &&
                dropdownMenuRef.current &&
                !dropdownMenuRef.current.contains(event.target as Node)
            ) {
                setIsVisibleDropdown(false);
            }
        };
        document.addEventListener('click', handleClick);
        return () => {
            document.removeEventListener('click', handleClick);
        };
    }, [isVisibleDropdown])

    return (<>
        <div id="user-dropdown-container" className="user-dropdown-container" ref={dropdownMenuRef}>
            <button id="user-menu-button" className="user-menu-button" onClick={()=>toggleDropdown()}>
                <img src="/interface/user_brain.png" alt="User Icon" className="user-icon" />
                <span id="welcome-username">{t('welcome_message', { "firstname": userFirstName })}</span>
                <i className="fas fa-caret-down dropdown-arrow"></i>
            </button>
            {isVisibleDropdown && <div id="user-dropdown-menu" className="user-dropdown-menu">
                <div className="dropdown-header">
                    <span id="dropdown-username-header">{userFirstName} {userLastName}</span>
                </div>
                <a id="config-button-dropdown" className="dropdown-item" 
                    href="/configuration"
                    onClick={()=>{ setIsVisibleDropdown(false) }}>
                    <img src="/interface/config.png" alt="Config icon" />
                    <span>{t("config_mode")}</span>
                </a>
                <a id="stats-button-dropdown" className="dropdown-item"
                    href="/stats"
                    onClick={()=>{ setIsVisibleDropdown(false) }}>
                    <img src="/interface/statistics.png" alt="Stats icon" /> <span>{t("my_stats")}</span>
                </a>
                <div className="language-switcher-dropdown">
                    <button className={currentLanguage=="fr"?
                                "lang-icon-btn-dropdown lang-icon-btn-dropdown-active":
                                "lang-icon-btn-dropdown"}
                            data-lang="fr" aria-label="Français" 
                            onClick={()=>{handleChangeLanguage('fr')}}>
                        <img src="/interface/fr-64.png" alt="FR" />
                    </button>
                    <button className={currentLanguage=="en"?
                                "lang-icon-btn-dropdown lang-icon-btn-dropdown-active":
                                "lang-icon-btn-dropdown"}
                            data-lang="en" aria-label="English"
                            onClick={()=>{handleChangeLanguage('en')}}>
                        <img src="/interface/en-64.png" alt="EN" />
                    </button>
                </div>
                <button id="logout-button-dropdown" className="dropdown-item logout-item" onClick={()=>logout()}>
                    <span>{t("logout_mode")}</span>
                </button>
            </div> }
        </div>
    </>)
}
export default LoginDropdownMenu
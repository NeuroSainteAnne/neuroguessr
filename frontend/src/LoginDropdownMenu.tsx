
import { useEffect, useRef, useState } from 'react';
import './LoginDropdownMenu.css'
import type { TFunction } from 'i18next';
import { useNavigate } from 'react-router-dom';

function LoginDropdownMenu({currentLanguage, t, callback, userFirstName, userLastName}: 
    { currentLanguage: string,
    t: TFunction<"translation", undefined>, callback: AppCallback, userFirstName: string, userLastName: string }) {
    
    const navigate = useNavigate();
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

    return (
        <div id="user-dropdown-container" className="user-dropdown-container" ref={dropdownMenuRef}>
            <button id="user-menu-button" className="user-menu-button" onClick={()=>toggleDropdown()}>
                <img src="/assets/interface/user_brain.png" alt="User Icon" className="user-icon" />
                <span id="welcome-username">{t('welcome_message', { "firstname": userFirstName })}</span>
                <i className="fas fa-caret-down dropdown-arrow"></i>
            </button>
            {isVisibleDropdown && <div id="user-dropdown-menu" className="user-dropdown-menu">
                <div className="dropdown-header">
                    <span id="dropdown-username-header">{userFirstName} {userLastName}</span>
                </div>
                <button id="config-button-dropdown" className="dropdown-item" 
                    onClick={()=>{ navigate("/configuration"); setIsVisibleDropdown(false) }}>
                    <img src="/assets/interface/config.png" alt="Config icon" />
                    <span>{t("config_mode")}</span>
                </button>
                <button id="stats-button-dropdown" className="dropdown-item"
                    onClick={()=>{ navigate("stats"); setIsVisibleDropdown(false) }}>
                    <img src="/assets/interface/statistics.png" alt="Stats icon" /> <span>{t("my_stats")}</span>
                </button>
                <div className="language-switcher-dropdown">
                    <button className={currentLanguage=="fr"?
                                "lang-icon-btn-dropdown lang-icon-btn-dropdown-active":
                                "lang-icon-btn-dropdown"}
                            data-lang="fr" aria-label="Français" 
                            onClick={()=>{callback.handleChangeLanguage('fr')}}>
                        <img src="/assets/interface/fr.png" alt="FR" />
                    </button>
                    <button className={currentLanguage=="en"?
                                "lang-icon-btn-dropdown lang-icon-btn-dropdown-active":
                                "lang-icon-btn-dropdown"}
                            data-lang="en" aria-label="English"
                            onClick={()=>{callback.handleChangeLanguage('en')}}>
                        <img src="/assets/interface/en.png" alt="EN" />
                    </button>
                </div>
                <button id="logout-button-dropdown" className="dropdown-item logout-item" onClick={()=>callback.logout()}>
                    <span>{t("logout_mode")}</span>
                </button>
            </div> }
        </div>
    )
}
export default LoginDropdownMenu
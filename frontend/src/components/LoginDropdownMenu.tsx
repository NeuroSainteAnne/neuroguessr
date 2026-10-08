import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import "./LoginDropdownMenu.css";

function LoginDropdownMenu() {
    const { t, userFirstName, userLastName, userIsAdmin, logout, currentLanguage, handleChangeLanguage } = useApp();
    const [isVisibleDropdown, setIsVisibleDropdown] = useState<boolean>(false);
    const dropdownMenuRef = useRef<HTMLDivElement>(null);
    const closeMenuTimeoutRef = useRef<NodeJS.Timeout|null>(null);

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (isVisibleDropdown && dropdownMenuRef.current && !dropdownMenuRef.current.contains(event.target as Node)) {
                setIsVisibleDropdown(false);
            }
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [isVisibleDropdown]);

    const handleMouseLeave = () => {
        closeMenuTimeoutRef.current = setTimeout(() => {
            setIsVisibleDropdown(false);
        }, 1000);
    };

    const handleMouseEnter = () => {
        if (closeMenuTimeoutRef.current) {
            clearTimeout(closeMenuTimeoutRef.current);
        }
        setIsVisibleDropdown(true);
    };

    return (
        <div
            className="user-dropdown-container"
            ref={dropdownMenuRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <button className="user-menu-button" onClick={() => setIsVisibleDropdown(v => !v)}>
                <img src="/interface/user_brain.png" alt="User" className="user-avatar" />
                <span className="user-menu-name">{userFirstName}</span>
                <svg className={`user-chevron${isVisibleDropdown ? ' open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
            </button>

            {isVisibleDropdown && (
                <div className="user-dropdown-menu">
                    <div className="dropdown-header">
                        <img src="/interface/user_brain.png" alt="User" className="dropdown-header-avatar" />
                        <div className="dropdown-header-info">
                            <span className="dropdown-header-name">{userFirstName} {userLastName}</span>
                        </div>
                    </div>

                    <div className="dropdown-items">
                        <a className="dropdown-item" href="/stats" onClick={() => setIsVisibleDropdown(false)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                            <span>{t("my_stats")}</span>
                        </a>
                        <a className="dropdown-item" href="/configuration" onClick={() => setIsVisibleDropdown(false)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                            <span>{t("config_mode")}</span>
                        </a>
                        {userIsAdmin && (
                            <a className="dropdown-item" href="/admin/teams" onClick={() => setIsVisibleDropdown(false)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                <span>{t('admin_section_title') || 'Admin Section'}</span>
                            </a>
                        )}

                        <div className="dropdown-language-separator" />

                        <div className="dropdown-language-section">
                            <button
                                className={`dropdown-lang-btn ${currentLanguage === 'fr' ? 'active' : ''}`}
                                onClick={() => {
                                    handleChangeLanguage('fr');
                                    setIsVisibleDropdown(false);
                                }}
                                data-umami-event="language switcher"
                                data-umami-event-language="fr"
                            >
                                Français
                            </button>
                            <button
                                className={`dropdown-lang-btn ${currentLanguage === 'en' ? 'active' : ''}`}
                                onClick={() => {
                                    handleChangeLanguage('en');
                                    setIsVisibleDropdown(false);
                                }}
                                data-umami-event="language switcher"
                                data-umami-event-language="en"
                            >
                                English
                            </button>
                        </div>
                    </div>

                    <button className="dropdown-item dropdown-logout" data-umami-event="logout button" onClick={() => logout()}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        <span>{t("logout_mode")}</span>
                    </button>
                </div>
            )}
        </div>
    );
}

export default LoginDropdownMenu;

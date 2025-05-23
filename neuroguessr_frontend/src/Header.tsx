import { useEffect } from 'react';
import './Header.css'
import type { TFunction } from 'i18next';
import LoginDropdownMenu from './LoginDropdownMenu';

function Header({currentLanguage, t, callback, isLoggedIn}: 
    { currentLanguage: string,
    t: TFunction<"translation", undefined>, callback: AppCallback, isLoggedIn: boolean }) {

    return (
        <>
        <header className="navbar">
            <div className="navbar-container">
                <div className="navbar-left logo-title-container-navbar logo-title-container" 
                    onClick={()=>{callback.setCurrentPage("welcome")}}>
                    <img src="assets/interface/neuroguessr.png" alt="NeuroGuessr Logo" className="logo" />
                    <h1>{t("app_title")}</h1>
                </div>
                <div className="navbar-right">
                    {!isLoggedIn && 
                    <button id="guest-sign-in-button" className="guest-sign-in-button"
                        onClick={()=>callback.gotoPage("login")}>{t("sign_in")}</button>
                    }
                    {isLoggedIn && 
                        <LoginDropdownMenu 
                            currentLanguage={currentLanguage}
                            t={t}
                            callback={callback} />
                    }
                </div>
            </div>
        </header>
        </>
    )
}

export default Header

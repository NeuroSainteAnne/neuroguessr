import { useEffect } from 'react';
import './Header.css'

function Header({handleChangeLanguage, currentLanguage, setCurrentPage}: 
    { handleChangeLanguage: (lang: string) => void, 
    currentLanguage: string,
    setCurrentPage: (page: string) => void }) {
        
    return (
        <>
        <header className="navbar">
            <div className="navbar-container">
                <div className="navbar-left logo-title-container-navbar logo-title-container" 
                    onClick={()=>{setCurrentPage("welcome")}}>
                    <img src="/neuroguessr_web/data/neuroguessr.png" alt="NeuroGuessr Logo" className="logo" />
                    <h1 data-i18n="app_title">NeuroGuessr</h1>
                </div>
                <div className="navbar-right">
                    <div className="language-switcher">
                        <button className={currentLanguage=="fr"?"lang-icon-btn lang-icon-btn-active":"lang-icon-btn"}
                                data-lang="fr" aria-label="Français" 
                                onClick={()=>{handleChangeLanguage('fr')}}>
                            <img src="/neuroguessr_web/data/fr.png" alt="FR" />
                        </button>
                        <button className={currentLanguage=="en"?"lang-icon-btn lang-icon-btn-active":"lang-icon-btn"}
                                data-lang="en" aria-label="English"
                                onClick={()=>{handleChangeLanguage('en')}}>
                            <img src="/neuroguessr_web/data/en.png" alt="EN" />
                        </button>
                    </div>
                </div>
            </div>
        </header>
        </>
    )
}

export default Header

import React from 'react'
import { useNavigate } from 'react-router-dom';
import type { TFunction } from 'i18next';

function LandingPage({t, callback}: 
    {t: TFunction<"translation", undefined>, callback: AppCallback }) {
    const navigate = useNavigate();

    return (<>
        <link rel="stylesheet" href="/assets/styles/LandingPage.css" />
        <div id="unlogged-landing-page" className="landing-content">
            <div className="welcome-section">
                <h2 className="welcome-message">{t("welcome_unlogged")}</h2>
                <p data-i18n="welcome_text_unlogged">{t("welcome_text_unlogged")}</p>
            </div>
            <div className="sign-in-panel">
                <div className="sign-in-options-container">
                    <a href="/login" className="option-button sign-in-button">
                        {t("sign_in")}
                    </a>
                    <a href="/register" className="option-button sign-up-button">
                        {t("sign_up")}
                    </a>
                    <a href="/welcome/singleplayer" onClick={()=>callback.activateGuestMode()} className="option-button continue-button">
                        {t("no_sign_in")}
                    </a>
                </div>
            </div>
        </div>
    </>)
}

export default LandingPage
import { useNavigate } from 'react-router-dom';
import './LandingPage.css'
import type { TFunction } from 'i18next';

function LandingPage({t, callback}: 
    {t: TFunction<"translation", undefined>, callback: AppCallback }) {
    const navigate = useNavigate();

    return (
        <div id="unlogged-landing-page" className="landing-content">
            <div className="welcome-section">
                <h2 className="welcome-message">{t("welcome_unlogged")}</h2>
                <p data-i18n="welcome_text_unlogged">{t("welcome_text_unlogged")}</p>
            </div>
            <div className="sign-in-panel">
                <div className="sign-in-options-container">
                    <button className="option-button sign-in-button" 
                            onClick={()=>navigate("/login")}>{t("sign_in")}</button>
                    <button className="option-button sign-up-button"
                            onClick={()=>navigate("/register")}>{t("sign_up")}</button>
                    <button className="option-button continue-button"
                            onClick={()=>callback.activateGuestMode()}>{t("no_sign_in")}</button>
                </div>
            </div>
        </div>
    )
}

export default LandingPage
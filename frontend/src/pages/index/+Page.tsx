import { useApp } from '../../context/AppContext';
import './LandingPage.css';

function LandingPage() {
    const { t, activateGuestMode } = useApp();
    return (<>
        <title>NeuroGuessr</title>
        <meta name="description" content="Neuroguessr: a game for learning neuroanatomy." />
        <meta property="og:title" content="NeuroGuessr" />
        <meta property="og:image" content="https://neuroguessr.org/interface/neuroguessr-128.png" />
        <meta property="og:url" content="https://neuroguessr.org/" />
        <meta property="og:type" content="website" />
        <div id="unlogged-landing-page" className="landing-content">
            <div className="welcome-section">
                <h2 className="welcome-message">{t("welcome_unlogged")}</h2>
                <p>{t("welcome_text_unlogged")}</p>
            </div>
            <div className="sign-in-panel">
                <div className="sign-in-options-container">
                    <a href="/login" 
                        className="option-button sign-in-button">
                        {t("sign_in")}
                    </a>
                    <a href="/register" 
                        className="option-button sign-up-button">
                        {t("sign_up")}
                    </a>
                    <a href="/welcome/singleplayer" 
                        className="option-button continue-button">
                        {t("no_sign_in")}
                    </a>
                </div>
            </div>
        </div>
    </>)
}

export default LandingPage
import { useEffect, useRef } from "react";
import { useApp } from "../context/AppContext"
import './Help.css';

export function Help() {
    const { t, showHelpOverlay, setShowHelpOverlay, showLegalOverlay, setShowLegalOverlay, pageContext } = useApp()
    const helpContentRef = useRef<HTMLDivElement>(null);
    const legalContentRef = useRef<HTMLDivElement>(null);
    const helpButtonRef = useRef<HTMLDivElement>(null);
    
    // Parse URL pathname to determine page context
    const parts = pageContext.urlPathname.split('/');
    
    // Define page type variables based on URL pathname
    const isWelcome = parts[1] === 'welcome';
    const isNeurotheka = parts[1] === 'neurotheka';
    const isSinglePlayerGame = parts[1] === 'singleplayer';
    const isMultiplayerGame = parts[1] === 'multiplayer-game';
    
    // Extract game mode from URL when on a game page
    const gameMode = isSinglePlayerGame && parts.length > 2 ? parts[3] || 'practice' : '';

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (
            showHelpOverlay &&
            helpContentRef.current &&
            helpButtonRef.current &&
            !helpButtonRef.current.contains(event.target as Node) &&
            !helpContentRef.current.contains(event.target as Node)
            ) {
            setShowHelpOverlay(false);
            }
        };
        document.addEventListener('click', handleClick);
        return () => {
            document.removeEventListener('click', handleClick);
        };
    }, [showHelpOverlay])

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (
            showLegalOverlay &&
            helpContentRef.current &&
            helpButtonRef.current &&
            !helpButtonRef.current.contains(event.target as Node) &&
            !helpContentRef.current.contains(event.target as Node)
            ) {
            setShowLegalOverlay(false);
            }
        };
        document.addEventListener('click', handleClick);
        return () => {
            document.removeEventListener('click', handleClick);
        };
    }, [showLegalOverlay])
    
    return(<>
         {(isWelcome || isNeurotheka || isSinglePlayerGame) && <>
            {showHelpOverlay && <div id="help-overlay" className="help-overlay">
                <div className="help-content" ref={helpContentRef}>
                  <button id="close-help" className="close-button" onClick={() => setShowHelpOverlay(false)}>&times;</button>
                  {isWelcome && <>
                    <h2>{t("help_title")}</h2>
                    <section>
                        <h3>{t("help_presentation_title")}</h3>
                        <p>{t("help_presentation_text")}</p>
                    </section>
                    <section>
                        <h3>{t("help_modes_title")}</h3>
                        <p dangerouslySetInnerHTML={{ __html: t("help_modes_navigation") }}></p>
                        <p dangerouslySetInnerHTML={{ __html: t("help_modes_practice") }}></p>
                        <p dangerouslySetInnerHTML={{ __html: t("help_modes_streak") }}></p>
                        <p dangerouslySetInnerHTML={{ __html: t("help_modes_time_attack") }}></p>
                    </section>
                  </>}
                  {isNeurotheka && <>
                    <h2>{t("help_title")}</h2>
                    <section>
                        <h3>{t("neurotheka_principle_title")}</h3>
                        <p>{t("neurotheka_principle_text")}</p>
                    </section>
                    <section>
                        <h3>{t("neurotheka_navigation_title")}</h3>
                        <p>{t("neurotheka_navigation_text")}</p>
                    </section>
                    <section>
                        <h3>{t("viewer_controls_title")}</h3>
                        <p>{t("viewer_controls_text")}</p>
                    </section>
                  </>}
                  {isSinglePlayerGame && <>
                    <h2>{t("viewer_help_title")}</h2>
                    <div id="help-mode-description"
                        dangerouslySetInnerHTML={{
                        __html: (() => {
                            switch (gameMode) {
                            case 'navigation':
                                return t('viewer_help_navigation');
                            case 'practice':
                                return t('viewer_help_practice');
                            case 'streak':
                                return t('viewer_help_streak');
                            case 'time-attack':
                                return t('viewer_help_time_attack');
                            default:
                                return t('viewer_help_general');
                            }
                        })()
                        }}>
                    </div>
                    <section>
                        <h3>{t("viewer_controls_title")}</h3>
                        <p>{t("viewer_controls_text")}</p>
                    </section>
                  </>}
               </div>
            </div>}

            <div className="help-button-container" ref={helpButtonRef}>
               <button id="help-button" className="help-button" onClick={() => setShowHelpOverlay(true)}>
                  <i className="fas fa-question"></i>
               </button>
            </div>
         </>}

         {showLegalOverlay && <div id="legal-overlay" className="help-overlay">
            <div className="help-content" ref={legalContentRef}>
               <button id="close-help" className="close-button" onClick={() => setShowLegalOverlay(false)}>&times;</button>
               <h2>{t("legal_mentions_title")}</h2>
               <section>
                  <h3>{t("legal_mentions_license_title")}</h3>
                  <p dangerouslySetInnerHTML={{ __html: t("legal_mention_license") }}></p>
                  <p>{t("legal_mention_atlas")}</p>
                  <p dangerouslySetInnerHTML={{
                     __html: t("help_atlases_text").replace(
                        /\[doi:([^\]]+)\]/g,
                        (_match: string, doi: string) => `<a href="https://doi.org/${doi}" target='_blank'>${doi}</a>`
                     )
                  }}></p>
               </section>
               <section>
                  <h3>{t("legal_mentions_pedagogy_title")}</h3>
                  <p>{t("legal_mentions_pedagogy")}</p>
               </section>
            </div>
         </div>}
    </>)
}
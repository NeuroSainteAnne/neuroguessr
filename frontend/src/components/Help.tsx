import { useEffect, useRef, useState } from "react";
import { useApp } from "../context/AppContext"
import './Help.css';

export function Help() {
    const { t, currentLanguage, showHelpOverlay, setShowHelpOverlay, showLegalOverlay, setShowLegalOverlay, showContributorsOverlay, setShowContributorsOverlay, showInfoOverlay, setShowInfoOverlay, pageContext } = useApp()
    const [currentPage, setCurrentPage] = useState<string>('');
    const helpButtonRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setCurrentPage(pageContext.urlPathname.split("/")[1] || '');
    }, []);
    
    // Parse URL pathname to determine page context
    const parts = pageContext.urlPathname.split('/');
    
    // Define page type variables based on URL pathname
    const isWelcome = parts[1] === 'welcome';
    const isSinglePlayerGame = parts[1] === 'singleplayer';
    
    // Extract game mode from URL when on a game page
    const gameMode = isSinglePlayerGame && parts.length > 2 ? parts[3] || 'practice' : '';

    
    return(<>
         {(isWelcome || isSinglePlayerGame) && <>
            {showHelpOverlay && <div id="help-overlay" className="help-overlay" onClick={() => setShowHelpOverlay(false)}>
                <div className="help-content" onClick={e => e.stopPropagation()}>
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

            {/*<div className="help-button-container" ref={helpButtonRef}>
               <button id="help-button" className="help-button"
                    data-umami-event="open help" data-umami-event-page={currentPage} onClick={() => setShowHelpOverlay(true)}>
                  <img src="/interface/question.png" alt="Help" style={{width: '20px', height: '20px'}} />
               </button>
            </div>*/}
         </>}

         {showLegalOverlay && <div id="legal-overlay" className="help-overlay" onClick={() => setShowLegalOverlay(false)}>
            <div className="help-content legal-content" onClick={e => e.stopPropagation()}>
               <button id="close-help" className="close-button" onClick={() => setShowLegalOverlay(false)}>&times;</button>
               <h2>{t("legal_mentions_title")}</h2>

               {currentLanguage === 'fr' ? <>
                  <section>
                     <h3>1. Licence Logicielle</h3>
                     <p>Neuroguessr est développé par <strong>François Ramon</strong> et <strong>Joseph Ben Zakoun</strong>. Le code source est distribué sous la licence <strong>GNU General Public License v3.0 (GPL-3)</strong>. Vous êtes libre de l'utiliser, le modifier et le distribuer selon les termes de cette licence.</p>
                  </section>
                  <section>
                     <h3>2. Atlas de Référence & Utilisation des Données</h3>
                     <p>Neuroguessr intègre plusieurs atlas de référence tiers, inclus principalement pour un usage <strong>académique, éducatif et non commercial</strong>.</p>
                     <h4>Atlas Corticaux</h4>
                     <table className="legal-table">
                        <colgroup><col className="col-atlas"/><col className="col-doi"/><col className="col-lic"/></colgroup><thead><tr><th>Atlas</th><th>DOI</th><th>Licence</th></tr></thead>
                        <tbody>
                           <tr><td>Tissues</td><td><a href="https://doi.org/10.1006/nimg.1995.1012" target="_blank" rel="noopener">10.1006/nimg.1995.1012</a></td><td>Usage Académique (avec attribution)</td></tr>
                           <tr><td>Harvard-Oxford</td><td><a href="https://doi.org/10.1016/j.neuroimage.2008.10.055" target="_blank" rel="noopener">10.1016/j.neuroimage.2008.10.055</a></td><td>Usage Non-Commercial uniquement</td></tr>
                           <tr><td>Desikan-Killiany</td><td><a href="https://doi.org/10.1016/j.neuroimage.2006.01.021" target="_blank" rel="noopener">10.1016/j.neuroimage.2006.01.021</a></td><td>Licence FreeSurfer (Académique, Non-Commercial)</td></tr>
                           <tr><td>BrainVisa Sulci</td><td><a href="https://doi.org/10.1016/j.media.2011.02.008" target="_blank" rel="noopener">10.1016/j.media.2011.02.008</a></td><td>Licence Attribution</td></tr>
                           <tr><td>Destrieux</td><td><a href="https://doi.org/10.1016/j.neuroimage.2010.06.010" target="_blank" rel="noopener">10.1016/j.neuroimage.2010.06.010</a></td><td>Licence FreeSurfer (Académique, Non-Commercial)</td></tr>
                           <tr><td>BigBrain</td><td><a href="https://doi.org/10.1126/science.1235381" target="_blank" rel="noopener">10.1126/science.1235381</a></td><td>CC BY-NC-SA 4.0</td></tr>
                        </tbody>
                     </table>
                     <h4>Atlas Sous-corticaux et Sous-régionaux</h4>
                     <table className="legal-table">
                        <colgroup><col className="col-atlas"/><col className="col-doi"/><col className="col-lic"/></colgroup><thead><tr><th>Atlas</th><th>DOI</th><th>Licence</th></tr></thead>
                        <tbody>
                           <tr><td>BigBrain Subcortical</td><td><a href="https://doi.org/10.1038/s41597-019-0217-0" target="_blank" rel="noopener">10.1038/s41597-019-0217-0</a></td><td>CC BY-NC-SA 4.0</td></tr>
                           <tr><td>Cerebellum SUIT</td><td><a href="https://doi.org/10.1016/j.neuroimage.2009.01.045" target="_blank" rel="noopener">10.1016/j.neuroimage.2009.01.045</a></td><td>Académique/Non-Commercial</td></tr>
                           <tr><td>Thalamus</td><td>—</td><td>Académique/Non-Commercial</td></tr>
                           <tr><td>Amygdala &amp; Hippocampus</td><td>—</td><td>—</td></tr>
                        </tbody>
                     </table>
                     <h4>Atlas Fonctionnels et Vasculaires</h4>
                     <table className="legal-table">
                        <colgroup><col className="col-atlas"/><col className="col-doi"/><col className="col-lic"/></colgroup><thead><tr><th>Atlas</th><th>DOI</th><th>Licence</th></tr></thead>
                        <tbody>
                           <tr><td>Resting-state Networks</td><td><a href="https://doi.org/10.1152/jn.00338.2011" target="_blank" rel="noopener">10.1152/jn.00338.2011</a></td><td>Attribution requise</td></tr>
                           <tr><td>Arterial Atlas</td><td><a href="https://doi.org/10.1038/s41597-022-01923-0" target="_blank" rel="noopener">10.1038/s41597-022-01923-0</a></td><td>CC BY</td></tr>
                        </tbody>
                     </table>
                     <h4>Atlas de la Matière Blanche</h4>
                     <table className="legal-table">
                        <colgroup><col className="col-atlas"/><col className="col-doi"/><col className="col-lic"/></colgroup><thead><tr><th>Atlas</th><th>DOI</th><th>Licence</th></tr></thead>
                        <tbody>
                           <tr><td>TractSeg</td><td><a href="https://doi.org/10.1016/j.neuroimage.2018.07.070" target="_blank" rel="noopener">10.1016/j.neuroimage.2018.07.070</a></td><td>Apache 2.0</td></tr>
                        </tbody>
                     </table>
                  </section>
                  <section>
                     <h3>3. Modifications & Travaux Dérivés</h3>
                     <p>Des scripts internes ont été utilisés pour effectuer des modifications mineures (résolution spatiale, réordonnancement des étiquettes) afin de faciliter le rendu web. Ces modifications n'altèrent pas la définition anatomique. Les atlas dérivés de sources <strong>ShareAlike (SA)</strong> (ex : BigBrain) sont libérés sous la licence <strong>CC BY-NC-SA 4.0</strong>.</p>
                  </section>
                  <section>
                     <h3>4. Note sur les Atlas FSL</h3>
                     <p>Les atlas Cerebellum et Harvard-Oxford sont distribués sous les termes de la licence FSL. L'utilisation commerciale est <strong>strictement interdite</strong>.</p>
                  </section>
                  <section>
                     <h3>5. Recueil de données personnelles à des fins de recherche</h3>
                     <p>Lors de la création de votre compte Neuroguessr, votre consentement est sollicité pour le recueil de données à des fins de recherche scientifique. Les données collectées (profession, scores, progression) sont traitées de manière sécurisée et utilisées <strong>uniquement</strong> pour faire progresser la recherche en neurosciences et en éducation. Vous pouvez désactiver cette collecte à tout moment dans les paramètres de votre compte.</p>
                  </section>
                  <section>
                     <h3>6. Clause de Non-responsabilité Médicale</h3>
                     <p>Neuroguessr est strictement une ressource éducative. Les informations fournies ne doivent <strong>en aucun cas</strong> être utilisées pour un diagnostic médical ou une décision clinique.</p>
                  </section>
                  <section>
                     <h3>7. Garantie</h3>
                     <p>Ce programme est distribué sans <strong>aucune garantie</strong>, y compris les garanties implicites de commercialisation ou d'adéquation à un usage particulier.</p>
                  </section>
               </> : <>
                  <section>
                     <h3>1. Software License</h3>
                     <p>Neuroguessr is developed by <strong>François Ramon</strong> and <strong>Joseph Ben Zakoun</strong>. The source code is distributed under the <strong>GNU General Public License v3.0 (GPL-3)</strong>. You are free to use, modify, and distribute this software under the terms of this license.</p>
                  </section>
                  <section>
                     <h3>2. Reference Atlases & Data Usage</h3>
                     <p>Neuroguessr incorporates several third-party reference atlases included primarily for <strong>Academic, Educational, and Non-Commercial Use only</strong>.</p>
                     <h4>Cortical Atlases</h4>
                     <table className="legal-table">
                        <colgroup><col className="col-atlas"/><col className="col-doi"/><col className="col-lic"/></colgroup><thead><tr><th>Atlas</th><th>DOI</th><th>License</th></tr></thead>
                        <tbody>
                           <tr><td>Tissues</td><td><a href="https://doi.org/10.1006/nimg.1995.1012" target="_blank" rel="noopener">10.1006/nimg.1995.1012</a></td><td>Academic/Research Use (with Attribution)</td></tr>
                           <tr><td>Harvard-Oxford</td><td><a href="https://doi.org/10.1016/j.neuroimage.2008.10.055" target="_blank" rel="noopener">10.1016/j.neuroimage.2008.10.055</a></td><td>Non-Commercial Use Only</td></tr>
                           <tr><td>Desikan-Killiany</td><td><a href="https://doi.org/10.1016/j.neuroimage.2006.01.021" target="_blank" rel="noopener">10.1016/j.neuroimage.2006.01.021</a></td><td>FreeSurfer License (Academic, Non-Commercial)</td></tr>
                           <tr><td>BrainVisa Sulci</td><td><a href="https://doi.org/10.1016/j.media.2011.02.008" target="_blank" rel="noopener">10.1016/j.media.2011.02.008</a></td><td>Attribution License</td></tr>
                           <tr><td>Destrieux</td><td><a href="https://doi.org/10.1016/j.neuroimage.2010.06.010" target="_blank" rel="noopener">10.1016/j.neuroimage.2010.06.010</a></td><td>FreeSurfer License (Academic, Non-Commercial)</td></tr>
                           <tr><td>BigBrain</td><td><a href="https://doi.org/10.1126/science.1235381" target="_blank" rel="noopener">10.1126/science.1235381</a></td><td>CC BY-NC-SA 4.0</td></tr>
                        </tbody>
                     </table>
                     <h4>Subcortical and Subregional Atlases</h4>
                     <table className="legal-table">
                        <colgroup><col className="col-atlas"/><col className="col-doi"/><col className="col-lic"/></colgroup><thead><tr><th>Atlas</th><th>DOI</th><th>License</th></tr></thead>
                        <tbody>
                           <tr><td>BigBrain Subcortical</td><td><a href="https://doi.org/10.1038/s41597-019-0217-0" target="_blank" rel="noopener">10.1038/s41597-019-0217-0</a></td><td>CC BY-NC-SA 4.0</td></tr>
                           <tr><td>Cerebellum SUIT</td><td><a href="https://doi.org/10.1016/j.neuroimage.2009.01.045" target="_blank" rel="noopener">10.1016/j.neuroimage.2009.01.045</a></td><td>Academic/Non-Commercial</td></tr>
                           <tr><td>Thalamus</td><td>—</td><td>Academic/Non-Commercial</td></tr>
                           <tr><td>Amygdala &amp; Hippocampus</td><td>—</td><td>—</td></tr>
                        </tbody>
                     </table>
                     <h4>Functional and Vascular Atlases</h4>
                     <table className="legal-table">
                        <colgroup><col className="col-atlas"/><col className="col-doi"/><col className="col-lic"/></colgroup><thead><tr><th>Atlas</th><th>DOI</th><th>License</th></tr></thead>
                        <tbody>
                           <tr><td>Resting-state Networks</td><td><a href="https://doi.org/10.1152/jn.00338.2011" target="_blank" rel="noopener">10.1152/jn.00338.2011</a></td><td>Attribution Required</td></tr>
                           <tr><td>Arterial Atlas</td><td><a href="https://doi.org/10.1038/s41597-022-01923-0" target="_blank" rel="noopener">10.1038/s41597-022-01923-0</a></td><td>CC BY</td></tr>
                        </tbody>
                     </table>
                     <h4>White Matter Atlases</h4>
                     <table className="legal-table">
                        <colgroup><col className="col-atlas"/><col className="col-doi"/><col className="col-lic"/></colgroup><thead><tr><th>Atlas</th><th>DOI</th><th>License</th></tr></thead>
                        <tbody>
                           <tr><td>TractSeg</td><td><a href="https://doi.org/10.1016/j.neuroimage.2018.07.070" target="_blank" rel="noopener">10.1016/j.neuroimage.2018.07.070</a></td><td>Apache License 2.0</td></tr>
                        </tbody>
                     </table>
                  </section>
                  <section>
                     <h3>3. Modifications & Derivative Works</h3>
                     <p>Minor modifications (spatial resolution, label reordering) were performed using in-house scripts to facilitate web rendering. These modifications did not alter the anatomical definitions. Atlases derived from <strong>ShareAlike (SA)</strong> sources (e.g., BigBrain) are released under <strong>CC BY-NC-SA 4.0</strong>.</p>
                  </section>
                  <section>
                     <h3>4. FSL Standard Space Atlases Notice</h3>
                     <p>The Cerebellum and Harvard-Oxford atlases are released under FSL license terms. Commercial use is <strong>strictly prohibited</strong>.</p>
                  </section>
                  <section>
                     <h3>5. Personal Data Collection for Research Purposes</h3>
                     <p>During account creation, your consent is requested for the collection of data for scientific research purposes. Data collected (profession, game scores, progress) are processed securely and used <strong>exclusively</strong> to advance research in neuroscience and education. You can disable this data collection at any time in your account settings.</p>
                  </section>
                  <section>
                     <h3>6. Medical Disclaimer</h3>
                     <p>Neuroguessr is strictly an educational resource. Information provided <strong>must not</strong> be used for medical diagnosis or clinical decision-making.</p>
                  </section>
                  <section>
                     <h3>7. Warranty</h3>
                     <p>This program is distributed <strong>without any warranty</strong>, including implied warranties of merchantability or fitness for a particular purpose.</p>
                  </section>
               </>}
            </div>
         </div>}

         {showContributorsOverlay && <div id="contributors-overlay" className="help-overlay" onClick={() => setShowContributorsOverlay(false)}>
            <div className="help-content" onClick={e => e.stopPropagation()}>
               <button className="close-button" onClick={() => setShowContributorsOverlay(false)}>&times;</button>
               <h2 style={{borderBottom: 'none', paddingBottom: 0, marginBottom: '20px'}}>{t("contributors_title")}</h2>
               <p style={{fontSize:'0.88rem', fontWeight:300, fontFamily:"'Open Sans', sans-serif", color:'var(--text-secondary)', marginBottom:'20px', paddingBottom:'20px', borderBottom:'1px solid rgba(255, 255, 255, 0.15)'}}>
                  {t("contributors_thanks") || "Merci à toutes les personnes qui ont contribué à ce projet !"}
               </p>
               <ul className="contributors-list">
                  <li>François Ramon</li>
                  <li>Joseph Ben Zakoun</li>
                  <li>Clara Cohen</li>
                  <li>Adèle Henensal</li>
                  <li>Clément Debacker</li>
                  <li>Catherine Oppenheim</li>
                  <li>Ahmed Ben Salem</li>
                  <li>Ghazi Hmeydia</li>
                  <li>Corentin Provost</li>
                  <li>Marie-Edith Richard</li>
                  <li>Justine Meriadec</li>
                  <li>Laurence Legrand</li>
               </ul>
            </div>
         </div>}

         {showInfoOverlay && <div className="help-overlay" onClick={() => setShowInfoOverlay(false)}>
            <div className="help-content" onClick={e => e.stopPropagation()}>
               <button className="close-button" onClick={() => setShowInfoOverlay(false)}>&times;</button>
               <h2>{t("help_page_heading") || "Aide & Informations"}</h2>
               <section>
                  <h3>{t("help_about_title") || "À Propos de NeuroGuessr"}</h3>
                  <p>{t("help_about_body") || ""}</p>
               </section>
               <section>
                  <h3>{t("help_modes_title") || "Modes de Jeu"}</h3>
                  <p dangerouslySetInnerHTML={{ __html: t("help_modes_navigation") }} />
                  <p dangerouslySetInnerHTML={{ __html: t("help_modes_practice") }} />
                  <p dangerouslySetInnerHTML={{ __html: t("help_modes_streak") }} />
                  <p dangerouslySetInnerHTML={{ __html: t("help_modes_time_attack") }} />
               </section>
            </div>
         </div>}
    </>)
}
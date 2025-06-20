import { PageContext } from "vike/types";
import { useApp } from "../context/AppContext";
import "./Footer.css";


const Footer = () => {
    const { t, setShowLegalOverlay } = useApp();
    return(
         <div className='lower-bar'>
            <a
               href="https://github.com/FRramon/neuroguessr_web/"
               target="_blank"
               rel="noopener noreferrer"
               data-umami-event="outbound link click" data-umami-event-target-website="github"
            >
               <svg height="32" width="32" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className='lower-logo-github'>
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
               </svg>
            </a>
            <a
               href="https://www.ghu-paris.fr/"
               target="_blank"
               rel="noopener noreferrer"
               data-umami-event="outbound link click" data-umami-event-target-website="GHU Paris"
            >
               <img src="/interface/logo-ghu-64.png" alt="GHU Paris" className='lower-logo-ghu'/>
            </a>
            <a
               href="https://ipnp.paris5.inserm.fr/"
               target="_blank"
               rel="noopener noreferrer"
               data-umami-event="outbound link click" data-umami-event-target-website="IPNP"
            >
               <img src="/interface/logo-ipnp-64.png" alt="IPNP" className='lower-logo-ipnp'/>
            </a>
            <a
               href="https://u-paris.fr/"
               target="_blank"
               rel="noopener noreferrer"
               data-umami-event="outbound link click" data-umami-event-target-website="Université Paris Cité"
            >
               <img src="/interface/logo-upc-64.png" alt="Université Paris Cité"  className='lower-logo-upc'/>
            </a>
            <button className='lower-legal-link' data-umami-event="open legal" onClick={(e) => { setShowLegalOverlay(true); }} >
               <span role="img" aria-label="legal" className='lower-legal-logo'>⚖️</span>
               <span className='lower-legal-text'>{t("legal_mentions_title")}</span>
            </button>
         </div>
    );
}

export default Footer;
export { onRenderHtml }

import React from 'react'
import { renderToString } from 'react-dom/server'
import i18n from '../context/i18n'
import { PageLayout } from './PageLayout'
import { escapeInject, dangerouslySkipEscape } from 'vike/server'
import type { OnRenderHtmlAsync } from 'vike/types'
import neuroGuessrImage from "../../public/interface/neuroguessr-360.png"
import neuroGuessrLogo from "../../public/interface/neuroguessr-128.png"
import i18nInstance from '../context/i18n'
import { PageContextProvider } from 'vike-react/usePageContext'
import logoSvg from "../../public/interface/neuroguessr.svg?raw";
import config from "../../config.json"  
import backendConfig from "../../../backend/config.json"

const onRenderHtml: OnRenderHtmlAsync = async (pageContext) => {
  // Initialize i18n with language given from the server if available
  let language = (pageContext as any).i18n?.language || 'en';
  console.log(language)
  if ((pageContext as any).i18n) {
    i18n.changeLanguage(language)
  }

  const { Page } = pageContext
  if (!Page) throw new Error('My onRenderHtml() hook expects pageContext.Page to be defined')
  const PageComponent = Page as React.ComponentType<any>
  // Important: Use StaticRouter for server-side rendering
  const pageHtml = renderToString(
    <PageContextProvider pageContext={pageContext}>
      <PageLayout pageContext={pageContext}>
          <PageComponent />
      </PageLayout>
    </PageContextProvider>
  )

 const { t, language:languageNew } = i18nInstance
 
 // Check if this is a multiplayer game URL and fetch session startTime
 let dynamicDescription = t((pageContext.config as any).description || 'neuroguessr_short_description', { lng: language });
 const urlPathname = pageContext.urlPathname || '';
 const multiplayerMatch = urlPathname.match(/^\/multiplayer\/([0-9]{8})(?:\/.*)?$/);

 if (multiplayerMatch) {
   const sessionCode = multiplayerMatch[1];
   try {
     // Make internal API call to get session data
     const baseUrl = backendConfig.server.external_address
     const response = await fetch(`${baseUrl}/api/advanced-game/getstartdate/${sessionCode}`, {
       method: 'GET',
       headers: {
         'Content-Type': 'application/json',
       },
     });
     if (response.ok) {
       const sessionData = await response.json();
       if (sessionData.startTime) {
          const startTime = new Date(sessionData.startTime);
          const now = new Date();
          
          if (startTime > now) {
            // Format the start time nicely
            const dateFormatter = new Intl.DateTimeFormat(languageNew, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZoneName: 'short'
            });
            
            const formattedTime = dateFormatter.format(startTime);
            dynamicDescription = t('multiplayer_scheduled_description', {
              time: formattedTime,
            });
          }
       }
     }
   } catch (error) {
     console.error('Failed to fetch multiplayer session data:', error);
     // Fall back to default description
   }
 }

 const title = t((pageContext.config as any).title || 'NeuroGuessr', { lng: language })
 const description = dynamicDescription
 const image = (pageContext.config as any).image || neuroGuessrImage

const customHeader = config.customHeaderScript ? dangerouslySkipEscape(config.customHeaderScript) : escapeInject``;

 // Create the complete HTML document
  return escapeInject`<!DOCTYPE html>
<html lang="${languageNew}">
<head>
  <meta charset="UTF-8" />
  ${customHeader}
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="https://neuroguessr.org${image}" />
  <meta property="og:url" content="https://neuroguessr.org${pageContext.urlPathname || ""}" />
  <meta property="og:type" content="website" />
  <meta property="og:logo" content="https://neuroguessr.org${neuroGuessrLogo}" />
  <style>
    #loading-screen {
      width: 100%;
      z-index: 1000;
    }
    #loading-screen .loader-container {
      background-color: #363636;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      position: relative;
    }
    .loading-logo-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
      animation: pulse 1.5s infinite ease-in-out;
    }
    .loading-logo-container svg {
      width: 80px;
      height: 80px;
    }
    @keyframes pulse {
      0% { transform: scale(1); opacity: 0.8; }
      50% { transform: scale(1.1); opacity: 1; }
      100% { transform: scale(1); opacity: 0.8; }
    }
    .loader {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1;
    }
    .sk-chase {
      width: 120px;
      height: 120px;
      position: relative;
      animation: sk-chase 2.5s infinite linear both;
    }

    .sk-chase-dot {
      width: 100%;
      height: 100%;
      position: absolute;
      left: 0;
      top: 0;
      animation: sk-chase-dot 2s infinite ease-in-out both;
    }

    .sk-chase-dot:before {
      content: "";
      display: block;
      width: 15%;
      height: 15%;
      background-color: #fff;
      border-radius: 100%;
      animation: sk-chase-dot-before 2s infinite ease-in-out both;
    }

    .sk-chase-dot:nth-child(1) {
      animation-delay: -1.1s;
    }

    .sk-chase-dot:nth-child(2) {
      animation-delay: -1s;
    }

    .sk-chase-dot:nth-child(3) {
      animation-delay: -0.9s;
    }

    .sk-chase-dot:nth-child(4) {
      animation-delay: -0.8s;
    }

    .sk-chase-dot:nth-child(5) {
      animation-delay: -0.7s;
    }

    .sk-chase-dot:nth-child(6) {
      animation-delay: -0.6s;
    }

    .sk-chase-dot:nth-child(1):before {
      animation-delay: -1.1s;
    }

    .sk-chase-dot:nth-child(2):before {
      animation-delay: -1s;
    }

    .sk-chase-dot:nth-child(3):before {
      animation-delay: -0.9s;
    }

    .sk-chase-dot:nth-child(4):before {
      animation-delay: -0.8s;
    }

    .sk-chase-dot:nth-child(5):before {
      animation-delay: -0.7s;
    }

    .sk-chase-dot:nth-child(6):before {
      animation-delay: -0.6s;
    }

    @keyframes sk-chase {
      100% {
        transform: rotate(360deg);
      }
    }

    @keyframes sk-chase-dot {

      80%,
      100% {
        transform: rotate(360deg);
      }
    }

    @keyframes sk-chase-dot-before {
      50% {
        transform: scale(0.4);
      }

      100%,
      0% {
        transform: scale(1);
      }
    }
    .i18n-content-hidden {
      opacity: 0;
      transition: opacity 0.2s ease-in-out;
    }
    .i18n-content-visible {
      opacity: 1;
    }
  </style>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css">
  <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png">
  <link rel="manifest" href="/favicon/site.webmanifest">
    <script>
    (function() {
      // Check for stored language preference
      var storedLang = localStorage.getItem('language');
      
      // Set initial language state
      window.__INITIAL_LANGUAGE__ = storedLang || "fr";
      
      // Update html lang attribute
      document.documentElement.lang = window.__INITIAL_LANGUAGE__;
      
      // Mark that we need to check language after hydration
      window.__NEEDS_LANGUAGE_SWITCH__ = storedLang && storedLang !== "fr";
    })();
  </script>
  <script async defer src="https://cdn.jsdelivr.net/gh/altcha-org/altcha@main/dist/altcha.min.js" type="module"></script>
  <script async defer src="https://cdn.jsdelivr.net/gh/altcha-org/altcha/dist_i18n/fr-fr.min.js" type="module"></script>
</head>

<body>
  <div id="loading-screen">
    <div class="loader-container">
      <div class="loading-logo-container">
        ${dangerouslySkipEscape(logoSvg)}
      </div>
      <div class="loader">
        <div class="sk-chase">
          <div class="sk-chase-dot"></div>
          <div class="sk-chase-dot"></div>
          <div class="sk-chase-dot"></div>
          <div class="sk-chase-dot"></div>
          <div class="sk-chase-dot"></div>
          <div class="sk-chase-dot"></div>
        </div>
      </div>
    </div>
  </div>
  <div id="blur-root"></div>
  <div id="root" class="i18n-content-hidden">${dangerouslySkipEscape(pageHtml)}</div>
</body>

</html>`
}

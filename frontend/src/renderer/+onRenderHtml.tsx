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
// import { PageContextProvider } from 'vike-react/usePageContext'
import { PageContextProvider } from './PageContext'
import logoSvg from "../../public/interface/neuroguessr.svg?raw";
import config from "../../config.json"  
import backendConfig from "../../../backend/config.json"

const onRenderHtml: OnRenderHtmlAsync = async (pageContext) => {
  // Initialize i18n with language given from the server if available
  let language = (pageContext as any).i18n?.language || 'en';
  if ((pageContext as any).i18n) {
    i18n.changeLanguage(language)
  }

  const { Page } = pageContext
  if (!Page) throw new Error('My onRenderHtml() hook expects pageContext.Page to be defined')
  const PageComponent = Page as React.ComponentType<any>
  // Important: Use StaticRouter for server-side rendering
  const pageHtml = renderToString(
    <PageContextProvider pageContext={pageContext as any}>
      <PageLayout pageContext={pageContext}>
          <PageComponent />
      </PageLayout>
    </PageContextProvider>
  )

 const { t, language:languageNew } = i18nInstance
 
 // Check if this is a multiplayer game URL and fetch session startTime
 // NB INCOMPATIBLE WITH SSG
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
          const name = sessionData.name;
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
            dynamicDescription = t(name?'multiplayer_scheduled_description_withname':'multiplayer_scheduled_description', {
              time: formattedTime,
              name
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
      background-color: #1a1a1a;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      width: 100%;
    }
    .loading-logo-spinner {
      position: relative;
      width: 100px;
      height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .loading-logo-container {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
    }
    .loading-logo-container svg {
      width: 64px;
      height: 64px;
      border-radius: 14px;
    }
    .ls-ring {
      position: absolute;
      inset: 0;
      z-index: 1;
      border-radius: 50%;
      animation: ls-rotate 1.4s linear infinite;
      background: conic-gradient(
        from 0deg,
        rgba(255,255,255,0) 0%,
        rgba(255,255,255,0.55) 75%,
        rgba(255,255,255,0) 100%
      );
      -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #fff calc(100% - 3px));
      mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #fff calc(100% - 3px));
    }
    @keyframes ls-rotate {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .i18n-content-hidden {
      opacity: 0;
      transition: opacity 0.2s ease-in-out;
    }
    .i18n-content-visible {
      opacity: 1;
    }
  </style>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.2/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer">

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
</head>

<body>
  <div id="loading-screen">
    <div class="loader-container">
      <div class="loading-logo-spinner">
        <div class="loading-logo-container">
          ${dangerouslySkipEscape(logoSvg)}
        </div>
        <div class="ls-ring"></div>
      </div>
    </div>
  </div>
  <div id="blur-root"></div>
  <div id="root" class="i18n-content-hidden">${dangerouslySkipEscape(pageHtml)}</div>
</body>

</html>`
}

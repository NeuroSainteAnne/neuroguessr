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
    <PageContextProvider pageContext={pageContext}>
      <PageLayout pageContext={pageContext}>
          <PageComponent />
      </PageLayout>
    </PageContextProvider>
  )

 const { t } = i18nInstance
 const title = t((pageContext.config as any).title || 'NeuroGuessr', { lng: language })
 const description = t((pageContext.config as any).description || 'neuroguessr_short_description', { lng: language })
 const image = (pageContext.config as any).image || neuroGuessrImage

 const gtm = config.googleTagManager ? dangerouslySkipEscape(`<!-- Google Tag Manager -->
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','${config.googleTagManager}');</script>
  <!-- End Google Tag Manager -->`) : escapeInject``;
 const gtm2 = config.googleTagManager ? dangerouslySkipEscape(`<!-- Google Tag Manager (noscript) -->
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${config.googleTagManager}"
  height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
  <!-- End Google Tag Manager (noscript) -->`) : escapeInject``;

 // Create the complete HTML document
  return escapeInject`<!DOCTYPE html>
<html lang="${language}">

<head>
  <meta charset="UTF-8" />
  ${gtm}
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
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
</head>

<body>
  ${gtm2}
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
  <div id="root" class="i18n-content-hidden">${dangerouslySkipEscape(pageHtml)}</div>
</body>

</html>`
}

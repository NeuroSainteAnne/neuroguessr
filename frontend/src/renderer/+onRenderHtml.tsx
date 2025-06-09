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
    <PageLayout pageContext={pageContext}>
        <PageComponent />
    </PageLayout>
  )

 const { t } = i18nInstance
 const title = t((pageContext.config as any).title || 'NeuroGuessr', { lng: language })
 const description = t((pageContext.config as any).description || 'neuroguessr_short_description', { lng: language })
 const image = (pageContext.config as any).image || neuroGuessrImage

 const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" viewBox="0 0 1024 1024"><path fill="#2e6ea4" d="M480 0h64q240 20 384 213 85 120 96 267v64q-21 240-213 384-121 85-267 96h-64q-241-21-385-213Q10 690 0 544v-64Q20 239 213 95 333 10 480 0"/><path fill="#f8f8f6" d="M808 743q-3 4-2 10-10 90-99 106l-37 3q12 26-2 51-19 21-46 12-12-5-20-14a3548 3548 0 0 1-84-135q-32 12-65 18a258 258 0 0 1-41-2q-46-11-74-49-7-12-11-24-26-3-53-3-101-13-114-113a247 247 0 0 1 2-37q24-114 119-179 56-34 122-36-25-36-34-78-11-105 83-153 86-33 158 25 73 75 30 173a304 304 0 0 1-17 32q88 6 145 73 15 19 23 42 53 22 72 77 17 47 12 98-3 40-27 74-17 19-40 29"/><path fill="#2e6ea4" d="M766 721a4165 4165 0 0 0-158-1l-9 1a5 5 0 0 0 3 1 415 415 0 0 0-40 7 1077 1077 0 0 0-78 27 219 219 0 0 1-27 7 3862 3862 0 0 0-33 0q-49-8-69-52-13-48 24-80 30-24 68-34 69-19 141-18 85-8 100-92a101 101 0 0 0 1-19q-7-15-21-10a20 20 0 0 0-8 8q0 33-20 60-26 25-62 24l-12-1q-16-1-21 2-58 4-113 20l-2-1a233 233 0 0 0-35 14l-4-4q-20-30-17-65a425 425 0 0 1 8-26q-2-17-18-15-7 3-11 10a328 328 0 0 0-7 24q-2-1-2 3v26q-7-2-12-7v1q-17-18-29 3-1 12 9 19 17 15 41 18a431 431 0 0 0 15 30q-19 16-33 38-13 22-12 48a529 529 0 0 1-50-2q-79-10-84-89 9-97 80-162 65-56 152-52a5876 5876 0 0 1 72 104q18 19 37 0l72-103q83-6 140 55 16 21 24 47l5 4q45 14 62 58 17 46 12 96-7 72-79 78"/><path fill="#2d6da4" d="M499 140q59-5 99 39 42 52 18 116a429 429 0 0 1-12 25 2301 2301 0 0 1-87 132q-3 5-9 3a2545 2545 0 0 1-82-123 265 265 0 0 1-23-48q-20-84 52-130 20-11 44-14"/><path fill="#f9f9f7" d="M501 188q45-4 69 34 17 38-6 74-32 34-77 20-48-23-41-75 11-44 55-53"/><path fill="#2d6da4" d="M505 219q42-1 41 42-4 20-24 27-33 7-45-24-5-35 28-45"/><path fill="#134f92" d="M346 508a131 131 0 0 0 0 30q-9 0-14-7v-1q5 5 12 7v-26q0-4 2-3"/><path fill="#0a4e90" d="M578 550a546 546 0 0 0-33 1q5-3 21-2l12 1"/><path fill="#1f5896" d="M432 571a232 232 0 0 0-38 15 13 13 0 0 1-3-6l4 4a233 233 0 0 1 35-14l2 1"/><path fill="#06488e" d="M162 566a247 247 0 0 0-2 37q-2-8-1-24 0-8 3-13"/><path fill="#f8f8f6" d="M746 571q19-2 18 18-14 46-59 62a195 195 0 0 1-40 9q-102 4-200 30-13 3-18-8-4-11 5-18a235 235 0 0 1 25-8 958 958 0 0 1 178-25q31-1 59-18 17-13 22-33 4-6 10-9"/><path fill="#064b8f" d="M274 716q27 0 53 3l-1 1q-22-3-44-3l-8-1"/><path fill="#03458e" d="M766 721q-83-1-164 1a5 5 0 0 1-3-1l9-1a4165 4165 0 0 1 158 1"/><path fill="#02468c" d="M808 743h1q-3 6-3 14a8 8 0 0 1 0-4q-1-6 2-10"/><path fill="#28649d" d="M775 758q-2-3-1-6a3708 3708 0 0 1-169 0 7763 7763 0 0 1 170-1z"/><path fill="#2e6da4" d="M605 752a3708 3708 0 0 0 169 0q-1 3 1 6-9 60-69 71a242 242 0 0 1-57 0q-16 2-15 18a1294 1294 0 0 1 13 41q-3 11-14 9-4-1-7-4a6203 6203 0 0 1-79-127q27-13 58-14"/><path fill="#105192" d="M424 763a3862 3862 0 0 1 33 0 143 143 0 0 1-33 0"/><path fill="#185a99" d="M412 792a258 258 0 0 0 41 2 8 8 0 0 1 4 0 113 113 0 0 1-36 0q-6 0-9-2"/></svg>`;
  
 // Create the complete HTML document
  return escapeInject`<!DOCTYPE html>
<html lang="${language}">

<head>
  <meta charset="UTF-8" />
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
  </style>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
  <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png">
  <link rel="manifest" href="/favicon/site.webmanifest">
  <style>
    .i18n-content-hidden {
      opacity: 0;
      transition: opacity 0.2s ease-in-out;
    }
    .i18n-content-visible {
      opacity: 1;
    }
  </style>
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

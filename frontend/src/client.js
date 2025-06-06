// client.js
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Initialize i18n with the language and translations from the server
const myi18n = await i18n
  .init({
    lng: window.i18n.language,
    resources: window.i18n.translations,
    fallbackLng: 'fr',
    interpolation: {
      escapeValue: false,
    },
  });

// Hydrate the React application
import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';

const rootElement = document.getElementById('root');
if (rootElement) {
  hydrateRoot(
    rootElement,
    <BrowserRouter>
      <App myi18n={{t:myi18n, i18n:i18n}} />
    </BrowserRouter>
  );
}
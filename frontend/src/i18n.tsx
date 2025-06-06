import i18n from "i18next";
import { useTranslation, initReactI18next } from "react-i18next";
import enJSON from './assets/i18n/en.json'
import frJSON from './assets/i18n/fr.json'

declare global {
  interface Window {
    i18n: {
      defaultLanguage?: string;
      // Add other properties if necessary
    };
  }
}

// Determine the initial language
const initialLanguage = typeof window !== 'undefined' && window.i18n && window.i18n.defaultLanguage
  ? window.i18n.defaultLanguage
  : 'fr'; // Default language if window.i18n.defaultLanguage is not available

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enJSON },
    fr: { translation: frJSON },
  },
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false }
});
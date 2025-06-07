import i18n from "i18next";
import { useTranslation, initReactI18next } from "react-i18next";
import enJSON from '../i18n/en.json'
import frJSON from '../i18n/fr.json'

declare global {
  interface Window {
    i18n: {
      defaultLanguage?: string;
      // Add other properties if necessary
    };
  }
}

// Determine if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// Determine the initial language
const initialLanguage = isBrowser && window.i18n && window.i18n.defaultLanguage
  ? window.i18n.defaultLanguage
  : 'fr'; // Default language if window.i18n.defaultLanguage is not available

// Check if i18n has already been initialized to avoid duplicate initialization
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: enJSON },
      fr: { translation: frJSON },
    },
    lng: initialLanguage,
    fallbackLng: "en",
    interpolation: { escapeValue: false }
  });
}

export default i18n;
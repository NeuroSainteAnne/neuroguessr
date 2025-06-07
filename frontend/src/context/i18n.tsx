import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enJSON from '../i18n/en.json';
import frJSON from '../i18n/fr.json';

declare global {
  interface Window {
    i18n: {
      defaultLanguage?: string;
      resources?: Record<string, any>;
    };
  }
}

const initI18n = () => {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined';
  
  // Determine the initial language and resources
  // Use what the server provided if available, otherwise use defaults
  const initialLanguage = isBrowser && window.i18n?.defaultLanguage 
    ? window.i18n.defaultLanguage 
    : 'fr';
    
  const resources = isBrowser && window.i18n?.resources
    ? window.i18n.resources
    : {
        en: { translation: enJSON },
        fr: { translation: frJSON }
      };
  
  // Only initialize if not already initialized
  if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
      resources,
      lng: initialLanguage,
      fallbackLng: "en",
      interpolation: { escapeValue: false },
      react: {
        useSuspense: false
      },
      // IMPORTANT: For SSR, this must be false
      initImmediate: false
    });
  }
  
  return i18n;
};

// Export the initialized instance
const i18nInstance = initI18n();
export default i18nInstance;

import i18n from "i18next";
import { useTranslation, initReactI18next } from "react-i18next";
import enJSON from './assets/i18n/en.json'
import frJSON from './assets/i18n/fr.json'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enJSON },
    fr: { translation: frJSON },
  },
  lng: "fr",
  fallbackLng: "en",
  interpolation: { escapeValue: false }
});
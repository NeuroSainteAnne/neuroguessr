import path from "path";
import i18next from 'i18next';
import FsBackend from 'i18next-fs-backend'
import { __dirname } from "./utils.ts";

i18next.use(FsBackend).init({
  fallbackLng: 'fr',
  preload: ["en","fr"],
  backend: {
    loadPath: path.join(__dirname, '../assets/i18n/{{lng}}.json'),
  }
});

export default i18next;
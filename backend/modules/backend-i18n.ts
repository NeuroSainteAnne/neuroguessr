import path from "path";
import i18next from 'i18next';
import FsBackend from 'i18next-fs-backend'
import { __dirname } from "./utils.ts";

const backendI18n = i18next.createInstance();

backendI18n.use(FsBackend).init({
  fallbackLng: 'fr',
  preload: ["en","fr"],
  backend: {
    loadPath: path.join(__dirname, '../assets/i18n/{{lng}}.json'),
  }
});

export default backendI18n;
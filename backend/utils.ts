import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
export const htmlRoot = path.join(__dirname, "../");
export const reactRoot = path.join(__dirname, "../frontend/dist/");
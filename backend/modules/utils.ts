import path from "path";
import { fileURLToPath } from 'url';
import fetch from "node-fetch";
import type { Config } from "../interfaces/config.interfaces.ts";
import configJson from '../config.json' with { type: "json" };
import { HttpsProxyAgent } from "https-proxy-agent";
import { User } from "interfaces/database.interfaces.ts";
import jwt from "jsonwebtoken";
const config: Config = configJson;

const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
export const htmlRoot = path.join(__dirname, "../../");
export const reactRoot = path.join(__dirname, "../../frontend/dist/");

export async function verifyCaptcha(token: string, secret: string): Promise<boolean> {
    try {
        const fetchOptions: any = {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `secret=${secret}&response=${token}`,
        };

        if (config.captcha.proxy) {
            fetchOptions.agent = new HttpsProxyAgent(config.captcha.proxy);
        }

        const response = await fetch("https://www.google.com/recaptcha/api/siteverify", fetchOptions);
        const data = await response.json() as any;
        return data.success === true;
    } catch (error) {
        console.error("Error verifying captcha:", error);
        return false;
    }
}

export function getUserToken(user: User): string {
    const token = jwt.sign({ 
            username: user.username,
            email: user.email, 
            firstname: user.firstname, 
            lastname: user.lastname,
            language: user.language,
            publishToLeaderboard: user.publish_to_leaderboard,
            id: user.id 
        }, config.jwt_secret, { expiresIn: "1h" })
    return token;
}
import 'ignore-styles';

import express from "express";
import path from "path";
import fs from "fs"
import https from 'https';
import { __dirname, htmlRoot, reactRoot } from "./modules/utils.ts";
import { db, database_init, cleanExpiredTokens, cleanOldGameSessions } from "./modules/database_init.ts";
import { login, refreshToken, authenticateToken, getUserInfo } from "./modules/login.ts";
import { register, verifyEmail, passwordLink, resetPassword, validateResetToken } from "./modules/registration.ts";
import { configUser } from "./modules/config_user.ts";
import { getNextRegion, manualClotureGameSession, startGameSession, validateRegion } from "./modules/game.ts";
import { globalAuthentication } from "./modules/global_auth.ts";
import type { Config } from "./interfaces/config.interfaces.ts";
import configJson from './config.json' with { type: "json" };
import type { ClotureGameSessionRequest, GetNextRegionRequest, GetStatsRequest, StartGameSessionRequest } from "./interfaces/requests.interfaces.ts";
import { getLeaderboard } from "./modules/leaderboard.ts";
import { getUserStats } from "./modules/stats.ts";
import { createMultiplayerSession } from "./modules/multi.ts";
import { createProxyMiddleware } from "http-proxy-middleware";
import { LanguageDetector, handle } from 'i18next-http-middleware'
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import App from "../frontend/src/App.tsx"
const config: Config = configJson;

const app = express();
const PORT = config.server.port;

const frontendHtml = fs.readFileSync("../frontend/index.html", "utf-8")

database_init()

app.use(express.json());

if(config.server.globalAuthentication.enabled){
    app.use(globalAuthentication);
}

app.post('/api/login', login);
app.post('/api/refresh-token', refreshToken);
app.post('/api/register', register);
app.post("/api/password-recovery", passwordLink)
app.post("/api/validate-reset-token", validateResetToken)
app.post("/api/reset-password", resetPassword)
app.post("/api/verify-email", verifyEmail)
app.get('/api/user-info', authenticateToken, getUserInfo);
app.post('/api/config-user', authenticateToken, configUser);
app.post('/api/get-leaderboard', getLeaderboard);
app.post('/api/get-stats', authenticateToken, 
    (req, res) => getUserStats(req as GetStatsRequest, res));

app.post('/api/start-game-session', authenticateToken, 
    (req, res) => startGameSession(req as StartGameSessionRequest, res));
app.post('/api/get-next-region', authenticateToken, 
    (req, res) => getNextRegion(req as GetNextRegionRequest, res));
app.post('/api/validate-region', authenticateToken, validateRegion);
app.post('/api/cloture-game-session', authenticateToken,
    (req, res) => manualClotureGameSession(req as ClotureGameSessionRequest, res))

app.post('/api/create-multiplayer-session', authenticateToken, createMultiplayerSession)

app.get("/favicon.ico", (req: express.Request, res: express.Response) => {
    console.log(path.join(reactRoot, "assets", "favicon"))
    res.sendFile("favicon.ico", { root: path.join(reactRoot, "assets", "favicon") });
});


app.use(
  '/websocket',
  createProxyMiddleware({
    target: `ws://localhost:${config.server.websocket_port}`,
    changeOrigin: true,
    ws: true, // enable websocket proxying
    pathRewrite: { '^/websocket': '' }, // optional: remove /websocket prefix if needed
  })
);

import i18next from 'i18next';
import FsBackend from 'i18next-fs-backend'
if(config.server.serverSideRendering){
    //app.use("/assets", express.static(path.join(htmlRoot, "frontend", "src", "assets")));
    app.use(express.static(path.join(htmlRoot, "frontend", "dist")));

    // Middleware to detect bots
    const isBot = (req: any) => {
        const userAgent = req.get('user-agent') || '';
        const botUserAgents = [
            'googlebot', 'bingbot', 'slurp', 'duckduckbot',
            'baiduspider', 'yandexbot', 'facebot', 'ia_archiver'
        ];
        return botUserAgents.some(botUA => userAgent.toLowerCase().includes(botUA));
    };

    const i18n = await i18next.use(LanguageDetector).use(FsBackend).init({
        fallbackLng: 'fr',
        preload: ["en","fr"],
        backend: {
            loadPath: path.join(htmlRoot, "frontend", "src", "assets", "i18n", "{{lng}}.json"),
        }
    });

    app.use(
        handle(i18next, {
            ignoreRoutes: ['/assets','/api'],
            removeLngFromUrl: false 
        })
    )

    // Handle all routes with server-side rendering
    app.get(/(.*)/, async (req, res) => {
        const lng = req.language || 'fr'; // Get language from request or default to 'en'
        await i18next.changeLanguage(lng); // Change language for the current request
        // Create a context for StaticRouter
        const context = {};
        const botRequest = isBot(req);
        let html;
        if(botRequest){
            // Render the React application to a string
            const jsx = (
                <StaticRouter location={req.url} >
                    <App myi18n={{t:i18n, i18n:i18next}} />
                </StaticRouter>
            );
            // Render the React app to HTML
            const reactDom = renderToString(jsx);
            html = frontendHtml.replace(
                `<script type="module" src="/src/main.tsx"></script>`,
                ``
            ).replace(
                `<div id="root" style="opacity: 0;">`,
                `<div id="root">${reactDom}`
            ).replace(
                `<div id="loading-screen">`,
                `<div id="loading-screen" style="display:none">`
            );
        } else {
            html = frontendHtml.replace(
                `<script type="module" src="/src/main.tsx"></script>`,
                `<script>
                        window.i18n = {
                            defaultLanguage: '${i18next.language}'
                        };
                </script>
                <script type="module" src="/assets/bundle.js"></script>`
            );
        }
        // Send the modified HTML to the client
        res.send(html);
    });

} else {
    app.get("/", (req: express.Request, res: express.Response) => {
        res.sendFile("index.html", { root: reactRoot });
    });

    app.get("/index.html", (req: express.Request, res: express.Response) => {
        res.sendFile("index.html", { root: reactRoot });
    });
    
    app.use("/assets", express.static(path.join(reactRoot, "assets")));
}

setInterval(() => {
    cleanExpiredTokens();
}, 60*1000); // each minute

cleanOldGameSessions();
setInterval(() => {
    cleanOldGameSessions();
}, 10*60*1000); // each 10 minute

if(config.server.mode == "https"){
    var key = fs.readFileSync(path.join(__dirname, config.server.serverKey));
    var cert = fs.readFileSync(path.join(__dirname, config.server.serverCert));
    var httpOptions = {
      key: key,
      cert: cert
    };
    
    var server = https.createServer(httpOptions, app);
    server.listen(PORT, () => {
        console.log(`Server is running on https://localhost:${PORT}`);
    });
} else {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

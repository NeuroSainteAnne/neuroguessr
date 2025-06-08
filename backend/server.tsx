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
import { renderPage } from 'vike/server';
const config: Config = configJson;

const app = express();
const PORT = config.server.port;

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
    res.sendFile("favicon.ico", { root: path.join(reactRoot, "client", "favicon") });
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
//import "../frontend/dist/server/entry.mjs"
if(config.server.renderingMode == "ssr" || config.server.renderingMode == "ssg"){
    app.use('/assets', express.static(path.join(reactRoot, 'client', 'assets')));
    app.use('/atlas', express.static(path.join(reactRoot, 'client', 'atlas')));
    app.use('/favicon', express.static(path.join(reactRoot, 'client', 'favicon')));
    app.use('/interface', express.static(path.join(reactRoot, 'client', 'interface')));

    await i18next
            .use(FsBackend)
            .init({
                fallbackLng: 'fr',
                preload: ["en", "fr"],
                ns: ['translation'],
                defaultNS: 'translation',
                backend: {
                    loadPath: path.join(htmlRoot, "frontend", "src", "i18n", "{{lng}}.json"),
                },
                react: {
                    useSuspense: false
                },
                // Critical for SSR to work properly
                initImmediate: false
            });

    if(config.server.renderingMode == "ssr"){
        // Dynamically import the Vike rendering module only for SSR
        const { renderPage } = await import('vike/server');
        await import("../frontend/dist/server/entry.mjs" as any);

        app.get(/(.*)/, async (req, res, next) => {
            // Detect language from request (simplified)
            const acceptLanguage = req.headers['accept-language'] || '';
            const preferredLang = acceptLanguage.includes('fr') ? 'fr' : 'en';
            i18next.changeLanguage(preferredLang)

            console.log("Rendering page for URL:", req.originalUrl);

            const pageContextInit = {
                urlOriginal: req.originalUrl,
                i18n: {
                    language: preferredLang
                }
            };
            try {
                const pageContext = await renderPage(pageContextInit);
                const { httpResponse } = pageContext;
                
                if (!httpResponse) {
                    return next();
                }
                
                const { body, statusCode, headers } = httpResponse;
                //console.log(body)
                // Add i18n configuration script to the HTML
                const htmlWithI18n = body.replace(
                    '</head>',
                    `<script>
                        window.i18n = {
                            defaultLanguage: '${preferredLang}'
                        };
                    </script>
                    </head>`
                );
                if (headers) {
                    Object.entries(headers).forEach(([name, value]) => {
                        res.setHeader(name, value);
                    });
                }
                
                res.status(statusCode).send(htmlWithI18n);
            } catch (error) {
                console.error("Error rendering page:", error);
                res.status(500).send('Internal Server Error');
            }
        })
    } else if(config.server.renderingMode == "ssg"){
        app.get(/(.*)/, (req, res) => {
            // Extract the path from the URL
            const url = req.originalUrl.split('?')[0];
            const queryString = req.originalUrl.includes('?') ? req.originalUrl.split('?')[1] : '';

            // Normalize URL path for file system lookup
            let fsPath;
            let routeParams = {};
            if (url === '/') {
                // Root path - look for index.html at the root
                fsPath = path.join(reactRoot, 'client', 'index.html');
            } else {
                // For parameterized routes, we need to check the base route first
                // Extract the first segment of the path
                const segments = url.split('/').filter(Boolean);
                const baseRoute = segments[0]; // e.g., "singleplayer" from "/singleplayer/harvard-oxford/navigation"
                
                // Define a list of routes that should load their index.html
                const clientRoutedPaths = ['singleplayer', 'neurotheka', 'multiplayer', 'validate', 'resetpwd'];
                if (clientRoutedPaths.includes(baseRoute)) {
                    // This is a client-routed path, serve the base route's index.html
                    fsPath = path.join(reactRoot, 'client', baseRoute, 'index.html');
                    console.log(`Identified as client-routed path: ${baseRoute}, serving:`, fsPath);
                    if (segments.length > 1) {
                        const baseRoute = segments[0];
                        if (baseRoute === 'neurotheka') {
                            routeParams = {
                                atlas: segments[1] || "",
                                region: segments[2] || ""
                            };
                        } else if (baseRoute === 'singleplayer') {
                            routeParams = {
                                atlas: segments[1] || "",
                                mode: segments[2] || ""
                            };
                        } else if (baseRoute === 'multiplayer') {
                            routeParams = {
                                askedSessionCode: segments[1] || "",
                                askedSessionToken: segments[2] || ""
                            };
                        } else if (baseRoute === 'resetpwd') {
                            routeParams = {
                                userId: segments[1] || "",
                                token: segments[2] || ""
                            };
                        } else if (baseRoute === 'validate') {
                            routeParams = {
                                userId: segments[1] || "",
                                token: segments[2] || ""
                            };
                        }
                    }
                } else {
                    const urlNoLeadingSlash = url.replace(/^\//, '');
                    // Try multiple possible locations for the HTML file
                    const possiblePaths = [
                        path.join(reactRoot, 'client', `${urlNoLeadingSlash}.html`),
                        path.join(reactRoot, 'client', urlNoLeadingSlash, 'index.html'),
                        path.join(reactRoot, 'client', urlNoLeadingSlash, 'index.html')
                    ];
                    fsPath = possiblePaths.find(p => fs.existsSync(p))
                }
                
                // If none found, default to index.html
                if (!fsPath || !fs.existsSync(fsPath)) {
                    fsPath = path.join(reactRoot, 'client', 'index.html');
                }
            }
            console.log("Serving static file:", fsPath);
            
            // Read the HTML file
            let html = fs.readFileSync(fsPath, 'utf8');
            
            // Inject language preference
            const acceptLanguage = req.headers['accept-language'] || '';
            const preferredLang = acceptLanguage.includes('fr') ? 'fr' : 'en';
            
            html = html.replace(
                '</head>',
                `<script>
                    window.i18n = {
                        defaultLanguage: '${preferredLang}'
                    };
                
                    // Store the original URL for client-side routing
                    window.__VIKE_INITIAL_STATE__ = {
                        originalUrl: "${url}${queryString ? '?' + queryString : ''}",
                        routeParams: ${JSON.stringify(routeParams)}
                    };
                </script>
                </head>`
            );
            
            res.send(html);
        });
    }

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

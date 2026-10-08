import 'ignore-styles';

import express from "express";
import path from "path";
import fs from "fs"
import https from 'https';
import http from 'http';
import { __dirname, htmlRoot, reactRoot } from "./modules/utils.ts";
import { sql, database_init, cleanExpiredTokens, cleanOldGameSessions } from "./modules/database_init.ts";
import { login, refreshToken, authenticateToken, getUserInfo, optionalAuthenticateToken } from "./modules/login.ts";
import { register, verifyEmail, passwordLink, resetPassword, validateResetToken } from "./modules/registration.ts";
import { configUser } from "./modules/config_user.ts";
import { globalAuthentication } from "./modules/global_auth.ts";
import type { Config } from "./interfaces/config.interfaces.ts";
import { assertConfig } from "./interfaces/config.interfaces.ts";
import configJson from './config.json' with { type: "json" };
import type {  GetStatsRequest } from "./interfaces/requests.interfaces.ts";
import { getLeaderboard, getMostUsedAtlases } from "./modules/leaderboard.ts";
import { getUserStats, getPastMultiplayerGames } from "./modules/stats.ts";
import { createMultiplayerSession, destroyMultiplayerSession, getMultiplayerSessionStartDate, replayMultiSession, replayMultiSessionById, replaySingleSessionById } from "./modules/multi.ts";
import { checkIfClassicChallenge } from "modules/multi_classic_challenge.ts";
import { getClassicChallengeResults } from "modules/multi_classic_challenge.ts";
import { classicChallengeEmailOptIn } from "modules/multi_classic_challenge.ts";
import { getPastClassicChallenges } from "modules/multi_classic_challenge.ts";
import { initSocketHandlers } from "modules/socket.ts";
import { restorePersistentRealTimeChallengeSessions } from "modules/multi_challenge.ts";
import { getNextRealtimeChallenge, getAllRealtimeChallenges, deleteRealtimeChallenge } from "modules/multi_challenge.ts";
import { getActiveClassicChallenges, getClassicChallenge, canJoinClassicChallenge, checkClassicChallengeCompletion } from "modules/multi_classic_challenge.ts";
import { deleteClassicChallenge } from "modules/multi_classic_challenge.ts";
import { getNextClassicChallenge } from "modules/multi_classic_challenge.ts";
import { getPublicLobbies } from "modules/multi_public.ts";
import { transformResponseToCamelCase } from './middlewares/case-transformer.ts';
import { generateChallenge } from 'modules/altcha.ts';
import { 
    getAllTeams, 
    getTeamById, 
    getTeamMembers, 
    createTeam, 
    updateTeam, 
    deleteTeam,
    assignUserToTeam,
    unassignUserFromTeam,
    getAllUsers,
    requireAdmin
} from 'modules/teams.ts';
import { getActiveNews, getAllNews, createNews, updateNews, deleteNews } from 'modules/news.ts';
import rateLimit from 'express-rate-limit';
import { logger } from './modules/logging.ts';

assertConfig(configJson);
const config: Config = configJson;

const app = express();
const PORT = config.server.port;

logger.info('Starting NeuroGuessr server', {
  port: PORT,
  nodeEnv: process.env.NODE_ENV || 'development',
  configLoaded: !!config,
  timestamp: new Date().toISOString()
});

await database_init()

app.use(express.json());
app.use(transformResponseToCamelCase);

if(config.server.globalAuthentication.enabled){
    logger.info('Global authentication enabled');
    app.use(globalAuthentication);
}

// login.ts
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 failed requests per windowMs
  message: 'Too many failed authentication attempts',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed requests
});
app.post('/api/login', authLimiter, login);
app.post('/api/refresh-token', refreshToken);
app.get('/api/user-info', authenticateToken, getUserInfo);

// register.ts
app.post('/api/register', authLimiter, register);
app.post("/api/password-recovery", passwordLink)
app.post("/api/validate-reset-token", validateResetToken)
app.post("/api/reset-password", resetPassword)
app.post("/api/verify-email", verifyEmail)

// config_user.ts
app.post('/api/config-user', authenticateToken, configUser);

// leaderboard.ts
app.post('/api/get-leaderboard', getLeaderboard);
app.post('/api/get-most-used-atlases', getMostUsedAtlases);

// stats.ts
app.post('/api/get-stats', authenticateToken, 
    (req, res) => getUserStats(req as GetStatsRequest, res));
app.get('/api/multi/past-games', authenticateToken,
    (req, res, next) => Promise.resolve(getPastMultiplayerGames(req, res)).catch(next));

// multi.ts
app.post('/api/create-multiplayer-session', authenticateToken, createMultiplayerSession)
app.post('/api/multi/destroy-session', authenticateToken, destroyMultiplayerSession)
app.get('/api/multi/public-lobbies', getPublicLobbies)
app.get('/api/multi/check-classic/:sessionCode', (req, res, next) => {
    Promise.resolve(checkIfClassicChallenge(req, res)).catch(next);
})
app.get('/api/multi/challenge-results/:challengeId/full', optionalAuthenticateToken, (req, res, next) => {
    req.params.fullResults = 'true';
    Promise.resolve(getClassicChallengeResults(req, res)).catch(next);
})
app.get('/api/multi/challenge-results/:challengeId', (req, res, next) => {
    Promise.resolve(getClassicChallengeResults(req, res)).catch(next);
})
app.post('/api/multi/challenge-email-optin/:challengeId', authenticateToken, (req, res, next) => {
    Promise.resolve(classicChallengeEmailOptIn(req, res)).catch(next);
})
app.get('/api/multi/next-realtime-challenge', (req, res, next) => {
    Promise.resolve(getNextRealtimeChallenge(req, res)).catch(next);
})
app.get('/api/multi/next-classic-challenge', (req, res, next) => {
    Promise.resolve(getNextClassicChallenge(req, res)).catch(next);
})
app.get('/api/realtime-challenges', (req, res, next) => {
    Promise.resolve(getAllRealtimeChallenges(req, res)).catch(next);
})
app.delete('/api/realtime-challenges/:sessionCode', authenticateToken, deleteRealtimeChallenge)
app.get('/api/classic-challenges', getActiveClassicChallenges);
app.get('/api/classic-challenges/:sessionCode', authenticateToken, (req, res, next) => {
    Promise.resolve(getClassicChallenge(req, res)).catch(next);
})
app.post('/api/multi/can-join-classic-challenge', authenticateToken, (req, res, next) => {
    Promise.resolve(canJoinClassicChallenge(req, res)).catch(next);
})
app.get('/api/classic-challenges/:challengeId/completion', authenticateToken, (req, res, next) => {
    Promise.resolve(checkClassicChallengeCompletion(req, res)).catch(next);
})
app.get('/api/past-challenges', authenticateToken, (req, res, next) => {
    Promise.resolve(getPastClassicChallenges(req, res)).catch(next);
})
app.delete('/api/classic-challenges/:sessionCode', authenticateToken, (req, res, next) => {
    Promise.resolve(deleteClassicChallenge(req, res)).catch(next);
})
app.get('/api/multi/replay-challenge/:challengeId', authenticateToken, (req, res, next) => {
    Promise.resolve(replayMultiSession(req, res)).catch(next);
})
app.get('/api/multi/replay-session/:sessionId', authenticateToken, (req, res, next) => {
    Promise.resolve(replayMultiSessionById(req, res)).catch(next);
})
app.get('/api/single/replay-session/:sessionId', authenticateToken, (req, res, next) => {
    Promise.resolve(replaySingleSessionById(req, res)).catch(next);
})

// advanced_game.ts
app.post('/api/advanced-game/save', authenticateToken, saveAdvancedSettings);
app.post('/api/advanced-game/settings-by-id', authenticateToken, getAdvancedSettingsById);
app.post('/api/advanced-game/settings-list', authenticateToken, getAdvancedSettingsList);
app.post('/api/advanced-game/update', authenticateToken, updateAdvancedSettings);
app.post('/api/advanced-game/delete', authenticateToken, deleteAdvancedSettings);
app.get('/api/advanced-game/check-name', authenticateToken, checkAdvancedSettingsName);
app.get('/api/advanced-game/getstartdate/:sessionCode', (req, res, next) => {
    Promise.resolve(getMultiplayerSessionStartDate(req, res)).catch(next);
})

app.get("/favicon.ico", (req: express.Request, res: express.Response) => {
    res.sendFile("favicon.ico", { root: path.join(reactRoot, "client", "favicon") });
});

// altcha.ts
app.get('/api/altcha/challenge', generateChallenge as express.RequestHandler)

// teams.ts - Admin only routes
// news.ts routes
app.get('/api/news/active', getActiveNews);
app.get('/api/news', authenticateToken, requireAdmin, getAllNews);
app.post('/api/news', authenticateToken, requireAdmin, createNews);
app.put('/api/news/:id', authenticateToken, requireAdmin, updateNews);
app.delete('/api/news/:id', authenticateToken, requireAdmin, deleteNews);

app.get('/api/teams', authenticateToken, requireAdmin, getAllTeams);
app.get('/api/teams/:id', authenticateToken, requireAdmin, getTeamById);
app.get('/api/teams/:id/members', authenticateToken, requireAdmin, getTeamMembers);
app.post('/api/teams', authenticateToken, requireAdmin, createTeam);
app.put('/api/teams/:id', authenticateToken, requireAdmin, updateTeam);
app.delete('/api/teams/:id', authenticateToken, requireAdmin, deleteTeam);
app.put('/api/teams/:teamId/assign/:userId', authenticateToken, requireAdmin, assignUserToTeam);
app.delete('/api/teams/:teamId/unassign/:userId', authenticateToken, requireAdmin, unassignUserFromTeam);
app.get('/api/admin/users', authenticateToken, requireAdmin, getAllUsers);


import i18next from 'i18next';
import FsBackend from 'i18next-fs-backend'
import { initSocketIO } from 'modules/socket.io.ts';
import { checkAdvancedSettingsName, deleteAdvancedSettings, getAdvancedSettingsById, getAdvancedSettingsList, saveAdvancedSettings, updateAdvancedSettings } from 'modules/advanced_game.ts';

if(config.server.renderingMode == "ssr" || config.server.renderingMode == "ssg"){
    app.use('/assets', express.static(path.join(reactRoot, 'client', 'assets')));
    app.use('/atlas', express.static(path.join(reactRoot, 'client', 'atlas')));
    app.use('/favicon', express.static(path.join(reactRoot, 'client', 'favicon')));
    app.use('/interface', express.static(path.join(reactRoot, 'client', 'interface')));
    app.use('/sitemap.xml', express.static(path.join(reactRoot, 'client', 'sitemap.xml')));
    app.use('/robots.txt', express.static(path.join(reactRoot, 'client', 'robots.txt')));

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

            logger.info("Rendering page for URL:", req.originalUrl);

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
                logger.error("Error rendering page:", error);
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
                const baseRoute = segments[0]; // e.g., "singleplayer" from "/singleplayer/navigation/harvard-oxford"
                
                // Define a list of routes that should load their index.html
                const clientRoutedPaths = ['singleplayer', 'multiplayer', 'validate', 'resetpwd'];
                if (clientRoutedPaths.includes(baseRoute)) {
                    // This is a client-routed path, serve the base route's index.html
                    fsPath = path.join(reactRoot, 'client', baseRoute, 'index.html');
                    logger.info(`Identified as client-routed path: ${baseRoute}, serving:`, fsPath);
                    if (segments.length > 1) {
                        const baseRoute = segments[0];
                        if (baseRoute === 'singleplayer') {
                            routeParams = {
                                mode: segments[1] || "",
                                atlas: segments[2] || "",
                                region: segments[3] || ""
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

let server;

if(config.server.mode == "https"){
    var key = fs.readFileSync(path.join(__dirname, config.server.serverKey));
    var cert = fs.readFileSync(path.join(__dirname, config.server.serverCert));
    var httpOptions = {
      key: key,
      cert: cert
    };
    
    server = https.createServer(httpOptions, app);
    server.listen(PORT, () => {
        logger.info(`Server is running on https://localhost:${PORT}`);
    });
} else {
    server = http.createServer(app);
    server.listen(PORT, () => {
        logger.info(`Server is running on http://localhost:${PORT}`);
    });
}

// Initialize Socket.io
initSocketIO(server);
initSocketHandlers()

// Restore persistent challenge sessions on server startup
restorePersistentRealTimeChallengeSessions();

process.on('SIGINT', async () => {
  await sql.end();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await sql.end();
  process.exit(0);
});
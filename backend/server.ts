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
const config: Config = configJson;

const app = express();
const PORT = config.server.port;

database_init()

app.use(express.json());

if(config.server.globalAuthentication.enabled){
    app.use(globalAuthentication);
}

app.get("/", (req: express.Request, res: express.Response) => {
    res.sendFile("index.html", { root: reactRoot });
});

app.get("/index.html", (req: express.Request, res: express.Response) => {
    res.sendFile("index.html", { root: reactRoot });
});

app.get("/favicon.ico", (req: express.Request, res: express.Response) => {
    console.log(path.join(reactRoot, "assets", "favicon"))
    res.sendFile("favicon.ico", { root: path.join(reactRoot, "assets", "favicon") });
});

app.use("/assets", express.static(path.join(reactRoot, "assets")));

setInterval(() => {
    cleanExpiredTokens();
}, 60*1000); // each minute

cleanOldGameSessions();
setInterval(() => {
    cleanOldGameSessions();
}, 10*60*1000); // each 10 minute

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

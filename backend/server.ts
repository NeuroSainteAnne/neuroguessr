import express from "express";
import path from "path";
import fs from "fs"
import https from 'https';
import { __dirname, htmlRoot, reactRoot } from "./utils.ts";
import { db, database_init, cleanExpiredTokens } from "./database_init.ts";
import { login, refreshToken, authenticateToken, getUserInfo } from "./login.ts";
import { register, emailLink, passwordLink, resetPassword, validateResetToken } from "./registration.ts";
import { configUser } from "./config_user.ts";
import { getNextRegion, startGameSession, validateRegion } from "./game.ts";
import { globalAuthentication } from "./global_auth.ts";
var config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'))

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

app.post('/api/login', login);
app.post('/api/refresh-token', refreshToken);
app.post('/api/register', register);
app.post("/api/password-recovery", passwordLink)
app.post("/api/validate-reset-token", validateResetToken)
app.post("/api/reset-password", resetPassword)
app.get('/api/user-info', authenticateToken, getUserInfo);
app.post('/api/config-user', authenticateToken, configUser);

app.get("/verify/:id/:token", emailLink)

app.get("/resetPwd/:id/:token", (req, res) => {
    res.redirect("/index.html?resetpwd=true&id=" + req.params.id + "&token=" + req.params.token);
})

app.post('/api/start-game-session', authenticateToken, startGameSession);
app.post('/api/get-next-region', authenticateToken, getNextRegion);
app.post('/api/validate-region', authenticateToken, validateRegion);

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

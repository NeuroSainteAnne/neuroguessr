import express from "express";
import path from "path";
import fs from "fs"
import https from 'https';
import { __dirname, htmlRoot } from "./utils.ts";
import { db, database_init, cleanExpiredTokens } from "./database_init.ts";
import { login, refreshToken, authenticateToken, getUserInfo } from "./login.ts";
import { register, emailLink, passwordLink, resetPassword, validateResetToken } from "./registration.ts";
import { configUser } from "./config_user.ts";
var config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'))

const app = express();
const PORT = config.server.port;
var key = fs.readFileSync(path.join(__dirname, config.server.serverKey));
var cert = fs.readFileSync(path.join(__dirname, config.server.serverCert));
var httpOptions = {
  key: key,
  cert: cert
};

database_init()

app.use(express.json());

app.get("/", (req: express.Request, res: express.Response) => {
    res.sendFile("index.html", { root: htmlRoot });
});

app.get("/index.html", (req: express.Request, res: express.Response) => {
    res.sendFile("index.html", { root: htmlRoot });
});

app.get("/login.html", (req: express.Request, res: express.Response) => {
    res.sendFile("login.html", { root: htmlRoot });
});

app.get("/register.html", (req: express.Request, res: express.Response) => {
    res.sendFile("register.html", { root: htmlRoot });
});

app.get("/config_user.html", (req: express.Request, res: express.Response) => {
    res.sendFile("config_user.html", { root: htmlRoot });
});

app.get("/reset_password.html", (req: express.Request, res: express.Response) => {
    res.sendFile("reset_password.html", { root: htmlRoot });
});

app.get("/viewer.html", (req: express.Request, res: express.Response) => {
    res.sendFile("viewer.html", { root: htmlRoot });
});

app.get("/niivue.css", (req: express.Request, res: express.Response) => {
    res.sendFile("niivue.css", { root: htmlRoot });
});

app.use("/neuroguessr_web/scripts", express.static(path.join(htmlRoot, "scripts")));
app.use("/neuroguessr_web/data", express.static(path.join(htmlRoot, "data")));
app.use("/neuroguessr_web/dist", express.static(path.join(htmlRoot, "dist")));

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
    res.redirect("/reset_password.html?id=" + req.params.id + "&token=" + req.params.token);
})

var server = https.createServer(httpOptions, app);
server.listen(PORT, () => {
    console.log(`Server is running on https://localhost:${PORT}`);
});

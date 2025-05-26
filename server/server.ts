import express from "express";
import path from "path";
import fs from "fs"
import https from 'https';
import { __dirname, htmlRoot, reactRoot } from "./utils.ts";
// Import db, database_init, and cleanExpiredTokens from database_init.ts
import { db, database_init, cleanExpiredTokens } from "./database_init.ts";
// Import authentication and user-related functions from login.ts
import { login, refreshToken, authenticateToken, getUserInfo } from "./login.ts";
// Import registration and password recovery functions
import { register, emailLink, passwordLink, resetPassword, validateResetToken } from "./registration.ts";
import { configUser } from "./config_user.ts";
// Import game-related functions
import { getNextRegion, startGameSession, validateRegion } from "./game.ts";
import { globalAuthentication } from "./global_auth.ts";
// Import the new function for user stats
import { getBestScores } from "./stats_api.ts";

// Load configuration from config.json
var config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'))

const app = express();
const PORT = config.server.port;

// Initialize the database schema and connection.
// This must be called early in the application lifecycle.
database_init();

// Middleware to parse JSON request bodies
app.use(express.json());

// Apply global authentication middleware if enabled in config
if(config.server.globalAuthentication.enabled){
    app.use(globalAuthentication);
}

// --- Frontend serving routes ---
// Serve the main React application HTML file
app.get("/", (req: express.Request, res: express.Response) => {
    res.sendFile("index.html", { root: reactRoot });
});

app.get("/index.html", (req: express.Request, res: express.Response) => {
    res.sendFile("index.html", { root: reactRoot });
});

// Serve favicon
app.get("/favicon.ico", (req: express.Request, res: express.Response) => {
    console.log(path.join(reactRoot, "assets", "favicon"))
    res.sendFile("favicon.ico", { root: path.join(reactRoot, "assets", "favicon") });
});

// Serve static assets (images, CSS, JS bundles, etc.)
app.use("/assets", express.static(path.join(reactRoot, "assets")));

// --- Scheduled tasks ---
// Periodically clean up expired authentication tokens
setInterval(() => {
    cleanExpiredTokens();
}, 60 * 1000); // Run every minute

// --- API Routes ---

// Authentication/User related API routes
app.post('/api/login', login);
app.post('/api/refresh-token', refreshToken);
app.post('/api/register', register);
app.post("/api/password-recovery", passwordLink)
app.post("/api/validate-reset-token", validateResetToken)
app.post("/api/reset-password", resetPassword)
app.get('/api/user-info', authenticateToken, getUserInfo); // Requires authentication
app.post('/api/config-user', authenticateToken, configUser); // Requires authentication

// Email verification/password reset redirects
app.get("/verify/:id/:token", emailLink)

app.get("/resetPwd/:id/:token", (req, res) => {
    res.redirect("/index.html?resetpwd=true&id=" + req.params.id + "&token=" + req.params.token);
})

// Game related API routes (all require authentication)
app.post('/api/start-game-session', authenticateToken, startGameSession);
app.post('/api/get-next-region', authenticateToken, getNextRegion);
app.post('/api/validate-region', authenticateToken, validateRegion);

// NEW: API route for user's best scores (requires authentication)
app.get('/api/user/best-scores', authenticateToken, getBestScores);

// --- Server Start ---
// Start the server based on the configured mode (HTTPS or HTTP)
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

import express from "express";
import path from "path";
import Joi from "joi";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { __dirname, htmlRoot } from "./utils.ts";
import { db, database_init, cleanExpiredTokens } from "./database_init.ts";
import { login, refreshToken } from "./login.ts";
import { register, emailLink, passwordLink, resetPassword, validateResetToken } from "./registration.ts";

const app = express();
const PORT = 3000;
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

app.get("/verify/:id/:token", emailLink)

app.get("/resetPwd/:id/:token", (req, res) => {
    res.redirect("/reset_password.html?id=" + req.params.id + "&token=" + req.params.token);
})

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

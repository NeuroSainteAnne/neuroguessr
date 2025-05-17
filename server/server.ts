import express from "express";
import path from "path";
import Joi from "joi";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { __dirname, htmlRoot } from "./utils.ts";
import { db, database_init } from "./database_init.ts";
import { login } from "./login.ts";
import { register, emailLink } from "./registration.ts";

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

app.get("/viewer.html", (req: express.Request, res: express.Response) => {
    res.sendFile("viewer.html", { root: htmlRoot });
});

app.get("/niivue.css", (req: express.Request, res: express.Response) => {
    res.sendFile("niivue.css", { root: htmlRoot });
});

app.use("/neuroguessr_web/data", express.static(path.join(htmlRoot, "data")));
app.use("/neuroguessr_web/dist", express.static(path.join(htmlRoot, "dist")));

app.post('/api/login', login);
app.post('/api/register', register);
app.get("/verify/:id/:token", emailLink)

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
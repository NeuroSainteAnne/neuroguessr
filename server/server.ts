import express from "express";
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from 'url';

const app = express();
const PORT = 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const htmlRoot = path.join(__dirname, "../");

// Create a new database or open an existing one
const db = new sqlite3.Database(path.join(__dirname, "database.db"), sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err: Error | null) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log("Connected to the SQLite database.");
    }
});

db.serialize(() => {
    db.run(
        `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL
        )`
    );
});

app.get("/", (req: express.Request, res: express.Response) => {
    res.sendFile("index.html", { root: htmlRoot });
});

app.get("/index.html", (req: express.Request, res: express.Response) => {
    res.sendFile("index.html", { root: htmlRoot });
});

app.get("/login.html", (req: express.Request, res: express.Response) => {
    res.sendFile("login.html", { root: htmlRoot });
});

app.get("/viewer.html", (req: express.Request, res: express.Response) => {
    res.sendFile("viewer.html", { root: htmlRoot });
});

app.get("/niivue.css", (req: express.Request, res: express.Response) => {
    res.sendFile("niivue.css", { root: htmlRoot });
});

app.use("/neuroguessr_web/data", express.static(path.join(htmlRoot, "data")));
app.use("/neuroguessr_web/dist", express.static(path.join(htmlRoot, "dist")));

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
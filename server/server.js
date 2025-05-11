const express = require("express")
const sqlite3 = require('sqlite3').verbose();
const app = express()
const PORT = 3000;
const htmlRoot = __dirname + "/../"

// Create a new database or open an existing one
const db = new sqlite3.Database(__dirname+'/database.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the SQLite database.');
});
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL
    )`);
})

app.get("/", (req,res)=>{
    res.sendFile("index.html", { root: htmlRoot })
})
app.get("/index.html", (req,res)=>{
    res.sendFile("index.html", { root: htmlRoot })
})
app.get("/viewer.html", (req,res)=>{
    res.sendFile("viewer.html", { root: htmlRoot })
})
app.get("/niivue.css", (req,res)=>{
    res.sendFile("niivue.css", { root: htmlRoot })
})
app.use('/neuroguessr_web/data', express.static(htmlRoot+"data/"))
app.use('/neuroguessr_web/dist', express.static(htmlRoot+"dist/"))

app.listen(PORT)
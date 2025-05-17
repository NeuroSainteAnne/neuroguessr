import Joi from "joi";
import { db } from "./database_init.ts";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fs from 'fs'
import path from "path";
import { __dirname } from "./utils.ts";
var config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'))

export const login = async (req, res) => {
    try {
        const validate = (data) => {
            const schema = Joi.object({
                username: Joi.string().required().label("username"),
                password: Joi.string().required().label("password")
            });
            return schema.validate(data);
        };

        const { error } = validate(req.body);
        if (error) return res.status(400).send({ message: error.details[0].message });

        const stmt = db.prepare("SELECT * FROM users WHERE username = ?");
        const user = stmt.get(req.body.username);

        if (!user) return res.status(401).send({ message: "Invalid Username or Password" });

        const validPassword = await bcrypt.compare(req.body.password, user.password);

        if (!validPassword) return res.status(401).send({ message: "Invalid Username or Password" });

        if (!user.verified) {
            return res.status(403).send({ message: "Please verify your e-mail." });
        };
        const token = jwt.sign({ email: user.email, _id: user.id }, config.jwt_secret, { expiresIn: "1h" });
        res.status(200).send({ 
            token: token, 
            message: "user was successfully logged in" 
        });
    } catch (error) {
        res.status(500).send({ message: "Internal Server Error" })
    }
}
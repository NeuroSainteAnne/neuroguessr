
import passwordComplexity from "joi-password-complexity";
import { sendEmail } from "./email.ts";
import Joi from "joi";
import { db } from "./database_init.ts";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const register = async (req, res) => {
    try {
        const validate = (data) => {
            const schema = Joi.object({
                firstName: Joi.string().required().label("First Name"),
                lastName: Joi.string().required().label("Last Name"),
                email: Joi.string().email().required().label("Email"),
                password: passwordComplexity().required().label("password"),
            });
            return schema.validate(data);
        };

        const { error } = validate(req.body);
        if (error)
            return res.status(400).send({ message: error.details[0].message });

        // Vérifier si l'utilisateur existe déjà
        const user = await db.get("SELECT * FROM users WHERE email = ?", [
            req.body.email,
        ]);
        if (user)
            return res
                .status(409)
                .send({ message: "User with given email already exists" });

        // Hacher le mot de passe
        const salt = await bcrypt.genSalt(Number(process.env.SALT));
        const hashPassword = await bcrypt.hash(req.body.password, salt);

        // Insérer le nouvel utilisateur
        const stmt = db.prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)");
        const result = stmt.run(
            req.body.firstName + " " + req.body.lastName,
            req.body.email,
            hashPassword
        );
        const lastID = result.lastInsertRowid;

        // Créer un jeton pour l'utilisateur
        const tokenValue = jwt.sign(
            { email: req.body.email, id: lastID },
            process.env.SECRETKEY,
            { expiresIn: "1h" }
        );

        db.exec(
            "INSERT INTO tokens (userId, token) VALUES (?, ?)",
            [lastID, tokenValue]
        );

        const url = `http://localhost:3000/verify/${lastID}/${tokenValue}`;

        const subject = "Please Verify Email";
        const message = `
        <h3>Hello ${req.body.firstName} ${req.body.lastName}</h3>
        <p>Thanks for registering for our services.</p>
        <p>Click this link <a href="${url}">here</a> to verify your email</p>
      `;

        await sendEmail(req.body.email, subject, message);
        res
            .status(201)
            .send({ message: "An Email sent to your account please verify" });
    } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Internal Server Error" });
    }
};

export const emailLink = async (req, res) => {
    try {
        const getUserStmt = db.prepare("SELECT * FROM users WHERE id = ?");
        const user = getUserStmt.get(req.params.id);
        if (!user) return res.status(400).send({ message: "Invalid Link A" });

        const getTokenStmt = db.prepare("SELECT * FROM tokens WHERE userId = ? AND token = ?");
        const tokenRecord = getTokenStmt.get(user.id, req.params.token);
        if (!tokenRecord) return res.status(400).send({ message: "Invalid Link B" });

        const updateUserStmt = db.prepare("UPDATE users SET verified = 1 WHERE id = ?");
        updateUserStmt.run(user.id);

        const deleteTokenStmt = db.prepare("DELETE FROM tokens WHERE userId = ?");
        deleteTokenStmt.run(user.id);

        res.status(200).send({ message: "Email Verified successfully" })
    } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
    }
}
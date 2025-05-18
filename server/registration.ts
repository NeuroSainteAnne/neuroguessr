
import passwordComplexity from "joi-password-complexity";
import { sendEmail } from "./email.ts";
import Joi from "joi";
import { db } from "./database_init.ts";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fs from 'fs'
import path from "path";
import { __dirname } from "./utils.ts";
var config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'))

export const register = async (req, res) => {
    try {
        const validate = (data) => {
            const schema = Joi.object({
                username: Joi.string().required().label("username"),
                firstname: Joi.string().required().label("firstname"),
                lastname: Joi.string().required().label("lastname"),
                email: Joi.string().email().required().label("email"),
                password: passwordComplexity().required().label("password"),
            });
            return schema.validate(data);
        };

        const { error } = validate(req.body);
        if (error)
            return res.status(400).send({ message: error.details[0].message });

        // Check if the username already exists
        const getUserByUsernameStmt = db.prepare("SELECT * FROM users WHERE username = ?");
        const userByUsername = getUserByUsernameStmt.get(req.body.username);
        if (userByUsername)
            return res
                .status(409)
                .send({ message: "User with given username already exists" });

        // Vérifier si l'utilisateur existe déjà
        const getUserStmt = db.prepare("SELECT * FROM users WHERE email = ?");
        const user = getUserStmt.get(req.body.email);
        if (user)
            return res
                .status(409)
                .send({ message: "User with given email already exists" });

        // Hacher le mot de passe
        const salt = await bcrypt.genSalt(Number(config.salt));
        const hashPassword = await bcrypt.hash(req.body.password, salt);

        // Insérer le nouvel utilisateur
        const stmt = db.prepare("INSERT INTO users (username, firstname, lastname, email, password) VALUES (?, ?, ?, ?, ?)");
        const result = stmt.run(
            req.body.username,
            req.body.firstname,
            req.body.lastname,
            req.body.email,
            hashPassword
        );
        const lastID = result.lastInsertRowid;

        // Créer un jeton pour l'utilisateur
        const tokenValue = jwt.sign(
            { email: req.body.email, id: lastID },
            config.jwt_secret,
            { expiresIn: "1h" }
        );

        // Insert the token into the tokens table
        const tokenStmt = db.prepare("INSERT INTO tokens (userId, token) VALUES (?, ?)");
        tokenStmt.run(lastID, tokenValue);

        const url = `${config.server.external_address}/verify/${lastID}/${tokenValue}`;

        const subject = "Please Verify Email";
        const message = `
        <h3>Hello ${req.body.firstname} ${req.body.lastname}</h3>
        <p>Thanks for registering to Neuroguessr.</p>
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
        if (!user) {
            return res.send(`
                <html>
                    <head><title>Verification Failed</title></head>
                    <body>
                        <h1>Invalid Link</h1>
                        <p>The verification link is invalid or has expired.</p>
                    </body>
                </html>
            `);
        }

        const getTokenStmt = db.prepare("SELECT * FROM tokens WHERE userId = ? AND token = ?");
        const tokenRecord = getTokenStmt.get(user.id, req.params.token);
        if (!tokenRecord) {
            return res.send(`
                <html>
                    <head><title>Verification Failed</title></head>
                    <body>
                        <h1>Invalid Link</h1>
                        <p>The verification link is invalid or has expired.</p>
                    </body>
                </html>
            `);
        }

        const updateUserStmt = db.prepare("UPDATE users SET verified = 1 WHERE id = ?");
        updateUserStmt.run(user.id);

        const deleteTokenStmt = db.prepare("DELETE FROM tokens WHERE userId = ?");
        deleteTokenStmt.run(user.id);

        res.send(`
            <html>
                <head><title>Verification Successful</title></head>
                <body>
                    <h1>Email Verified Successfully</h1>
                    <p>Thank you for verifying your email. You can now <a href="/login.html">log in</a>.</p>
                </body>
            </html>
        `);
    } catch (error) {
        res.send(`
            <html>
                <head><title>Internal Server Error</title></head>
                <body>
                    <h1>Something Went Wrong</h1>
                    <p>We encountered an error while processing your request. Please try again later.</p>
                </body>
            </html>
        `);
    }    
}

export const passwordLink = async (req, res) => {
    try {

        const validate = (data) => {
            const emailSchema = Joi.object({
                email: Joi.string().email().required().label("Email"),
            });
            return emailSchema.validate(data);
        };
        const { error } = validate(req.body);
        if (error) return res.status(400).send({
            message: error.details[0].message
        })
        // Check if the username already exists
        const getUserByUsernameStmt = db.prepare("SELECT * FROM users WHERE email = ?");
        const user = getUserByUsernameStmt.get(req.body.email);
        if (!user)
            return res
                .status(409)
                .send({ message: "User with email does not exists" });

        // Check if the username already exists
        const getTokenByUsernameStmt = db.prepare("SELECT * FROM tokens WHERE userId = ?");
        let token = getTokenByUsernameStmt.get(user.id);
        let tokenValue = null;
        if (!token) {
            // Créer un jeton pour l'utilisateur
            tokenValue = jwt.sign(
                { email: req.body.email, id: user.id },
                config.jwt_secret,
                { expiresIn: "1h" }
            );
            // Insert the token into the tokens table
            const tokenStmt = db.prepare("INSERT INTO tokens (userId, token) VALUES (?, ?)");
            token = tokenStmt.run(user.id, tokenValue);
        } else {
            tokenValue = token.token;
        }
        console.log(token)
        const url = `${config.server.external_address}/resetPwd/${user.id}/${tokenValue}`
        const subject = "Password Reset";
        const message = `
        <p>Here is a link to reset your password</p>
        <p>Click this link <a href="${url}">here</a> to reset your password</p>
      `;

        await sendEmail(user.email, subject, message);

        res.status(200).send({ message: "password reset link is sent to your email account" })
    } catch (error) {
        res.status(500).send({ message: "Internal server error" })
    }
}


export const resetPassword = async (req, res) => {
    try {
        const validate = (data) => {
            const passwordSchema = Joi.object({
                password: passwordComplexity().required().label("password"),
                id: Joi.string().required().label("id"),
                token: Joi.string().required().label("token")
            });
            return passwordSchema.validate(data);
        };
        const { error } = validate(req.body);
        if (error) return res.status(400).send({
            message: error.details[0].message
        })
        const getUserByIdStmt = db.prepare("SELECT * FROM users WHERE id = ?");
        const user = getUserByIdStmt.get(req.body.id);
        if (!user) return res.status(400).send({ message: "Invalid link" });

        const getTokenByUsernameStmt = db.prepare("SELECT * FROM tokens WHERE userId = ? AND token = ?");
        const token = getTokenByUsernameStmt.get(user.id, req.body.token);
        if (!token) return res.status(400).send({ message: "Invalid Link" })


        const salt = await bcrypt.genSalt(Number(config.salt));
        const hashPassword = await bcrypt.hash(req.body.password, salt);

        // Update the user's password
        const updatePasswordStmt = db.prepare("UPDATE users SET password = ? WHERE id = ?");
        updatePasswordStmt.run(hashPassword, user.id);

        // Update the user's verified status
        const updateUserStmt = db.prepare("UPDATE users SET verified = 1 WHERE id = ?");
        updateUserStmt.run(user.id);

        // Delete the token after successful password reset
        const deleteTokenStmt = db.prepare("DELETE FROM tokens WHERE userId = ? AND token = ?");
        deleteTokenStmt.run(user.id, req.body.token);

        const new_token = jwt.sign({ 
            email: user.email, 
            firstname: user.firstname, 
            lastname: user.lastname,
            _id: user.id 
        }, config.jwt_secret, { expiresIn: "1h" });
        res.status(200).send({ 
            token: new_token, 
            message: "password successfully reset" 
        });
    } catch (error) {
        res.status(500).send({ message: "Internal server error" })
    }
}


export const validateResetToken = async (req, res) => {
    try {
        const validate = (data) => {
            const passwordSchema = Joi.object({
                id: Joi.string().required().label("id"),
                token: Joi.string().required().label("token")
            });
            return passwordSchema.validate(data);
        };
        const { error } = validate(req.body);
        if (error) return res.status(400).send({
            message: error.details[0].message
        })
        const getUserByIdStmt = db.prepare("SELECT * FROM users WHERE id = ?");
        const user = getUserByIdStmt.get(req.body.id);
        if (!user) return res.status(400).send({ message: "Invalid link" });

        const getTokenByUsernameStmt = db.prepare("SELECT * FROM tokens WHERE userId = ? AND token = ?");
        const token = getTokenByUsernameStmt.get(user.id, req.body.token);
        if (!token) return res.status(400).send({ message: "Invalid Link" })

        res.status(200).send({ message: "token valid" })
    } catch (error) {
        res.status(500).send({ message: "Internal server error" })
    }
}
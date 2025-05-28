
import passwordComplexity from "joi-password-complexity";
import { sendEmail } from "./email.ts";
import Joi from "joi";
import { db } from "./database_init.ts";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { __dirname } from "./utils.ts";
import type { Response } from "express";
import type { Token, User } from "../interfaces/database.interfaces.ts";
import type { EmailLinkRequest, PasswordLinkBody, PasswordLinkRequest, RegisterBody, 
    RegisterRequest, ResetPasswordBody, ResetPasswordRequest, 
    ValidateResetTokenBody, ValidateResetTokenRequest } from "../interfaces/requests.interfaces.ts";
import type { Config } from "../interfaces/config.interfaces.ts";
import configJson from '../config.json' with { type: "json" };
const config: Config = configJson;

export const register = async (req: RegisterRequest, res: Response): Promise<void> => {
    try {
        const validate = (data: RegisterBody) => {
            const schema = Joi.object({
                username: Joi.string().required().label("username"),
                firstname: Joi.string().required().label("firstname"),
                lastname: Joi.string().required().label("lastname"),
                email: Joi.string().email().required().label("email"),
                password: passwordComplexity.default().required().label("password"),
            });
            return schema.validate(data);
        };

        const { error } = validate(req.body);
        if (error){
            res.status(400).send({ message: error.details[0].message });
            return;
        }

        // Check if the username already exists
        const getUserByUsernameStmt = db.prepare("SELECT * FROM users WHERE username = ?");
        const userByUsername = getUserByUsernameStmt.get(req.body.username);
        if (userByUsername){
            res
                .status(409)
                .send({ message: "User with given username already exists" });
            return;
        }

        // Vérifier si l'utilisateur existe déjà
        const getUserStmt = db.prepare("SELECT * FROM users WHERE email = ?");
        const user = getUserStmt.get(req.body.email);
        if (user){
            res
                .status(409)
                .send({ message: "User with given email already exists" });
            return;
        }

        // Hacher le mot de passe
        const salt = await bcrypt.genSalt(Number(config.salt));
        const hashPassword = await bcrypt.hash(req.body.password, salt);

        let preVerify = 0;
        if(config.email.type == "none"){
            preVerify = 1;
        }

        // Insérer le nouvel utilisateur
        const stmt = db.prepare("INSERT INTO users (username, firstname, lastname, email, password, verified) VALUES (?, ?, ?, ?, ?, ?)");
        const result = stmt.run(
            req.body.username,
            req.body.firstname,
            req.body.lastname,
            req.body.email,
            hashPassword,
            preVerify
        );
        const lastID = result.lastInsertRowid;

        // Mode debug : pas d'envoi d'email
        if(config.email.type == "none"){
            res
                .status(201)
                .send({ preverified: true, message: "Vous avez été enregistré avec succès" });
            return;
        }

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
            .send({ preverified: false, message: "An Email sent to your account please verify" });
    } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Internal Server Error" });
    }
};

export const emailLink = async (req: EmailLinkRequest, res: Response): Promise<void> => {
    try {
        const getUserStmt = db.prepare("SELECT * FROM users WHERE id = ?");
        const user = getUserStmt.get(req.params.id) as User;
        if (!user) {
            res.send(`
                <html>
                    <head><title>Verification Failed</title></head>
                    <body>
                        <h1>Invalid Link</h1>
                        <p>The verification link is invalid or has expired.</p>
                    </body>
                </html>
            `);
            return;
        }

        const getTokenStmt = db.prepare("SELECT * FROM tokens WHERE userId = ? AND token = ?");
        const tokenRecord = getTokenStmt.get(user.id, req.params.token) as Token;
        if (!tokenRecord) {
            res.send(`
                <html>
                    <head><title>Verification Failed</title></head>
                    <body>
                        <h1>Invalid Link</h1>
                        <p>The verification link is invalid or has expired.</p>
                    </body>
                </html>
            `);
            return;
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

export const passwordLink = async (
    req: PasswordLinkRequest,
    res: Response
): Promise<void> => {
    try {
        const validate = (data: PasswordLinkBody) => {
            const emailSchema = Joi.object({
                email: Joi.string().email().required().label("Email"),
            });
            return emailSchema.validate(data);
        };
        const { error } = validate(req.body);
        if (error){
            res.status(400).send({
                message: error.details[0].message,
            });
            return;
        }

        // Check if the email already exists
        const getUserByUsernameStmt = db.prepare("SELECT * FROM users WHERE email = ?");
        const user = getUserByUsernameStmt.get(req.body.email) as User;
        if (!user){
             res
                .status(409)
                .send({ message: "User with email does not exists" });
        }
        
        // Check if a token already exists
        const getTokenByUsernameStmt = db.prepare("SELECT * FROM tokens WHERE userId = ?");
        let token = getTokenByUsernameStmt.get(user.id) as Token;
        let tokenValue: string | null = null;
        if (!token) {
            // Create a token for the user
            tokenValue = jwt.sign(
                { email: req.body.email, id: user.id },
                config.jwt_secret,
                { expiresIn: "1h" }
            );
            // Insert the token into the tokens table
            const tokenStmt = db.prepare("INSERT INTO tokens (userId, token) VALUES (?, ?)");
            tokenStmt.run(user.id, tokenValue);
        } else {
            tokenValue = token.token;
        }
        
        const url = `${config.server.external_address}/resetPwd/${user.id}/${tokenValue}`;

        // debug mode: no email sending
        if(config.email.type == "none"){
            res
                .status(200)
                .send({ preverified: true, redirect_url: url });
            return;
        }

        const subject = "Password Reset";
        const message = `
        <p>Here is a link to reset your password</p>
        <p>Click this link <a href="${url}">here</a> to reset your password</p>
      `;

        await sendEmail(user.email, subject, message);

        res.status(200).send({ preverified: false, message: "password reset link is sent to your email account" });
    } catch (error) {
        res.status(500).send({ message: "Internal server error" });
    }
};


export const resetPassword = async (req: ResetPasswordRequest, res: Response): Promise<void> => {
    try {
        const validate = (data: ResetPasswordBody): Joi.ValidationResult<ResetPasswordBody> => {
            const passwordSchema = Joi.object({
                password: passwordComplexity.default().required().label("password"),
                id: Joi.string().required().label("id"),
                token: Joi.string().required().label("token")
            });
            return passwordSchema.validate(data);
        };
        const { error } = validate(req.body);
        if (error){
            res.status(400).send({
                message: error.details[0].message
            });
            return;
        }

        const getUserByIdStmt = db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1");
        const user = getUserByIdStmt.get(req.body.id) as User;
        if (!user){
            res.status(400).send({ message: "Invalid link" });
            return;
        }

        const getTokenByUsernameStmt = db.prepare("SELECT * FROM tokens WHERE userId = ? AND token = ? LIMIT 1");
        const token = getTokenByUsernameStmt.get(user.id, req.body.token) as Token;
        if (!token){
            res.status(400).send({ message: "Invalid Link" });
            return;
        }

        const salt: string = await bcrypt.genSalt(Number(config.salt));
        const hashPassword: string = await bcrypt.hash(req.body.password, salt);

        // Update the user's password
        const updatePasswordStmt = db.prepare("UPDATE users SET password = ? WHERE id = ?");
        updatePasswordStmt.run(hashPassword, user.id);

        // Update the user's verified status
        const updateUserStmt = db.prepare("UPDATE users SET verified = 1 WHERE id = ?");
        updateUserStmt.run(user.id);

        // Delete the token after successful password reset
        const deleteTokenStmt = db.prepare("DELETE FROM tokens WHERE userId = ? AND token = ?");
        deleteTokenStmt.run(user.id, req.body.token);

        const new_token: string = jwt.sign(
            {
                username: user.username,
                email: user.email,
                firstname: user.firstname,
                lastname: user.lastname,
                publishToLeaderboard: user.publishToLeaderboard,
                id: user.id
            },
            config.jwt_secret,
            { expiresIn: "1h" }
        );
        res.status(200).send({
            token: new_token,
            message: "password successfully reset"
        });
    } catch (error) {
        res.status(500).send({ message: "Internal server error" });
    }
};


export const validateResetToken = async (req: ValidateResetTokenRequest, res: Response): Promise<void> => {
    try {
        const validate = (data: ValidateResetTokenBody) => {
            const passwordSchema = Joi.object({
                id: Joi.string().required().label("id"),
                token: Joi.string().required().label("token")
            });
            return passwordSchema.validate(data);
        };
        const { error } = validate(req.body);
        if (error){
            res.status(400).send({
                message: error.details[0].message
            });
            return;
        }
        const getUserByIdStmt = db.prepare("SELECT * FROM users WHERE id = ?");
        const user = getUserByIdStmt.get(req.body.id) as User;
        if (!user){
            res.status(400).send({ message: "Invalid link" });
            return;
        } 

        const getTokenByUsernameStmt = db.prepare("SELECT * FROM tokens WHERE userId = ? AND token = ?");
        const token = getTokenByUsernameStmt.get(user.id, req.body.token) as Token;
        if (!token){
            res.status(400).send({ message: "Invalid Link" });
            return;
        }

        res.status(200).send({ message: "token valid" });
    } catch (error) {
        res.status(500).send({ message: "Internal server error" });
    }
}
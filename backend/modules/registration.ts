
import passwordComplexity from "joi-password-complexity";
import { sendEmail, logoString } from "./email.ts";
import Joi from "joi";
import { sql } from "./database_init.ts";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { __dirname, getUserToken, verifyCaptcha } from "./utils.ts";
import type { Response } from "express";
import type { Token, User } from "../interfaces/database.interfaces.ts";
import type { VerifyEmailRequest, PasswordLinkBody, PasswordLinkRequest, RegisterBody, 
    RegisterRequest, ResetPasswordBody, ResetPasswordRequest, 
    ValidateResetTokenBody, ValidateResetTokenRequest, 
    VerifyEmailBody} from "../interfaces/requests.interfaces.ts";
import type { Config } from "../interfaces/config.interfaces.ts";
import configJson from '../config.json' with { type: "json" };
import backendI18n from "./backend-i18n.ts";
const config: Config = configJson;

export const register = async (req: RegisterRequest, res: Response): Promise<void> => {
    try {
        const validate = (data: RegisterBody) => {
            const schema = Joi.object({
                username: Joi.string().required().label("username"),
                firstname: Joi.string().required().label("firstname"),
                lastname: Joi.string().required().label("lastname"),
                email: Joi.string().email().required().label("email"),
                language: Joi.string().label("language").valid("fr", "en"),
                // @ts-ignore
                password: passwordComplexity().required().label("password"),
                captcha_token: Joi.string().label("captcha_token")
            });
            return schema.validate(data);
        };

        const { error } = validate(req.body);
        if (error){
            res.status(400).send({ message: error.details[0].message });
            return;
        }

        // Check if the username already exists
        const usersByUsername = await sql`
            SELECT * FROM users WHERE username = ${req.body.username} LIMIT 1
        `;
        if (usersByUsername.length > 0){
            res
                .status(409)
                .send({ message: "User with given username already exists" });
            return;
        }

        // Vérifier si l'utilisateur existe déjà
        const email = req.body.email.toLowerCase();
        const language = req.body.language ? req.body.language : 'fr';
        const users = await sql`
            SELECT * FROM users WHERE email = ${email} LIMIT 1
        `;
        if (users.length > 0){
            res
                .status(409)
                .send({ message: "User with given email already exists" });
            return;
        }

        // CAPTCHA CHECK (if enabled)
        if (config.captcha && config.captcha.activate) {
            const captchaToken = req.body.captcha_token;
            if (!captchaToken) {
                res.status(400).send({ message: "Captcha token missing" });
                return;
            }
            const captchaOk = await verifyCaptcha(captchaToken, config.captcha.secretKey);
            if (!captchaOk) {
                res.status(400).send({ message: "Captcha verification failed" });
                return;
            }
        }

        // Hacher le mot de passe
        const salt = await bcrypt.genSalt(Number(config.salt));
        const hashPassword = await bcrypt.hash(req.body.password, salt);

        let preVerify = 0;
        if(config.email.type == "none"){
            preVerify = 1;
        }

        // Insérer le nouvel utilisateur
        const result = await sql`
            INSERT INTO users (username, firstname, lastname, email, password, language, verified)
            VALUES (${req.body.username}, ${req.body.firstname}, ${req.body.lastname}, ${email}, ${hashPassword}, ${language}, ${preVerify})
            RETURNING id
        `;
        const lastID = result[0].id as number;

        // Mode debug : pas d'envoi d'email
        if(config.email.type == "none"){
            res
                .status(201)
                .send({ preverified: true, message: "Vous avez été enregistré avec succès" });
            return;
        }

        // Créer un jeton pour l'utilisateur
        const tokenValue = jwt.sign(
            { email: email, id: lastID },
            config.jwt_secret,
            { expiresIn: "1h" }
        );

        // Insert the token into the tokens table
        await sql`
            INSERT INTO tokens (user_id, token)
            VALUES (${lastID}, ${tokenValue})
        `;

        const url = `${config.server.external_address}/validate/${lastID}/${tokenValue}`;
        const subject = backendI18n.t('register_email_subject', { lng: language });
        const message = `
        <head>
            <style>
                a:visited { color: #8888cc !important; }
            </style>
        </head>
        <body style="background-color:#363636;width:100%;font-family: Open Sans,system-ui,Arial,Helvetica,sans-serif;color: #d9dddc;text-align:center;">
        <table cellpadding="0" cellspacing="0" border="0" style="text-align:left;margin-top:20px;">
            <tr>
                <td width=70>
                    <img src="${logoString}" width=64 height=64></img>
                </td>
                <td style="vertical-align:middle;">
                    <h1 style="font-size:56px; margin:0;">NeuroGuessr</h1>
                </td>
            </tr>
            <tr>
                <td colspan=2>
                    <h3 style="margin-top:15px">${backendI18n.t('register_email_greeting', { lng: language })} ${req.body.firstname} ${req.body.lastname}</h3>
                    <p>${backendI18n.t('register_email_thanks', { lng: language })}</p>
                    <p>${backendI18n.t('register_email_validate', { lng: language, url })}</p>
                </td>
            </tr>
        </table>
        </body>
      `;

        await sendEmail(email, subject, message);
        res
            .status(201)
            .send({ preverified: false, message: "An Email sent to your account please verify" });
    } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Internal Server Error" });
    }
};

export const verifyEmail = async (req: VerifyEmailRequest, res: Response): Promise<void> => {
    try {
        const validate = (data: VerifyEmailBody) => {
            const schema = Joi.object({
                id: Joi.string().required().label("id"),
                token: Joi.string().required().label("token")
            });
            return schema.validate(data);
        };

        const { error } = validate(req.body);
        if (error){
            res.status(400).send({ message: "error_invalid_token" });
            return;
        }

        const users = await sql`
            SELECT * FROM users WHERE id = ${req.body.id} LIMIT 1
        `;
        if (!users.length) {
            res.status(400).send({ message: "error_invalid_token" });
            return;
        }
        const user = users[0] as User;

        const tokens = await sql`
            SELECT * FROM tokens 
            WHERE user_id = ${user.id} AND token = ${req.body.token}
            LIMIT 1
        `;
        if (!tokens.length) {
            res.status(400).send({ message: "error_invalid_token" });
            return;
        }
        const tokenRecord = tokens[0] as Token;

        await sql`
            UPDATE users SET verified = TRUE WHERE id = ${user.id}
        `;

        await sql`
            DELETE FROM tokens WHERE user_id = ${user.id}
        `;

        const token = getUserToken(user);
        res.status(200).send({ 
            token: token, 
            message: "success_email_verified" 
        });
    } catch (error) {
        res.status(500).send({ message: "server_error" });
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
                language: Joi.string().label("language"),
                captcha_token: Joi.string().label("captcha_token")
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
        const email = req.body.email.toLowerCase();
        const users = await sql`
            SELECT * FROM users WHERE email = ${email} LIMIT 1
        `;
        if (!users.length){
             res
                .status(409)
                .send({ message: "User with email does not exists" });
        }
        const user = users[0] as User;

        // CAPTCHA CHECK (if enabled)
        if (config.captcha && config.captcha.activate) {
            const captchaToken = req.body.captcha_token;
            if (!captchaToken) {
                res.status(400).send({ message: "Captcha token missing" });
                return;
            }
            const captchaOk = await verifyCaptcha(captchaToken, config.captcha.secretKey);
            if (!captchaOk) {
                res.status(400).send({ message: "Captcha verification failed" });
                return;
            }
        }
        
        // Check if a token already exists
        const tokens = await sql`
            SELECT * FROM tokens WHERE user_id = ${user.id}
        `;
        let token = tokens.length ? tokens[0] as Token : undefined;
        let tokenValue: string | null = null;
        if (!token) {
            // Create a token for the user
            tokenValue = jwt.sign(
                { email: email, id: user.id },
                config.jwt_secret,
                { expiresIn: "1h" }
            );
            // Insert the token into the tokens table
            await sql`
                INSERT INTO tokens (user_id, token) 
                VALUES (${user.id}, ${tokenValue})
            `;
        } else {
            tokenValue = token.token;
        }
        
        const url = `${config.server.external_address}/resetpwd/${user.id}/${tokenValue}`;

        // debug mode: no email sending
        if(config.email.type == "none"){
            res
                .status(200)
                .send({ preverified: true, redirect_url: url });
            return;
        }

        const lang = req.body.language ? req.body.language : 'fr';
        const subject = backendI18n.t('reset_password_subject', { lng: lang });
        const message = `
        <head>
            <style>
                a:visited { color: #8888cc !important; }
            </style>
        </head>
        <body style="background-color:#363636;width:100%;font-family: Open Sans,system-ui,Arial,Helvetica,sans-serif;color: #d9dddc;text-align:center;">
        <table cellpadding="0" cellspacing="0" border="0" style="text-align:left;margin-top:20px;">
            <tr>
                <td width=70>
                    <img src="${logoString}" width=64 height=64></img>
                </td>
                <td style="vertical-align:middle;">
                    <h1 style="font-size:56px; margin:0;">NeuroGuessr</h1>
                </td>
            </tr>
            <tr>
                <td colspan=2>
                    <h3 style="margin-top:15px">${backendI18n.t('register_email_greeting', { lng: lang })} ${user.firstname} ${user.lastname}</h3>
                    <p>${backendI18n.t('reset_password_link', { lng: lang, url })}</p>
                </td>
            </tr>
        </table>
        </body>
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
                // @ts-ignore
                password: passwordComplexity().required().label("password"),
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

        const users = await sql`
            SELECT * FROM users WHERE id = ${req.body.id} LIMIT 1
        `;
        if (!users.length){
            res.status(400).send({ message: "Invalid link" });
            return;
        }
        const user = users[0] as User;

        const tokens = await sql`
            SELECT * FROM tokens 
            WHERE user_id = ${user.id} AND token = ${req.body.token}
            LIMIT 1
        `;
        if (!tokens.length){
            res.status(400).send({ message: "Invalid Link" });
            return;
        }
        const token = tokens[0] as Token;

        const salt: string = await bcrypt.genSalt(Number(config.salt));
        const hashPassword: string = await bcrypt.hash(req.body.password, salt);

        // Update the user's password
        await sql`
            UPDATE users 
            SET password = ${hashPassword}, verified = TRUE 
            WHERE id = ${user.id}
        `;

        // Delete the token after successful password reset
        await sql`
            DELETE FROM tokens 
            WHERE user_id = ${user.id} AND token = ${req.body.token}
        `;

        const newToken = getUserToken(user);
        res.status(200).send({
            token: newToken,
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

        const users = await sql`
            SELECT * FROM users WHERE id = ${req.body.id} LIMIT 1
        `;
        if (!users.length){
            res.status(400).send({ message: "Invalid link" });
            return;
        } 
        const user = users[0] as User;

        const tokens = await sql`
            SELECT * FROM tokens 
            WHERE user_id = ${user.id} AND token = ${req.body.token}
            LIMIT 1
        `;
        if (!tokens.length){
            res.status(400).send({ message: "Invalid Link" });
            return;
        }
        const token = tokens[0] as Token;

        res.status(200).send({ message: "token valid" });
    } catch (error) {
        res.status(500).send({ message: "Internal server error" });
    }
}
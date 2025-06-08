import Joi from "joi";
import { db } from "./database_init.ts";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import passwordComplexity from "joi-password-complexity";
import { __dirname, getUserToken } from "./utils.ts";
import type { Config } from "../interfaces/config.interfaces.ts";
import configJson from '../config.json' with { type: "json" };
import type { Request, Response } from "express";
import type { AuthenticatedRequest, ConfigUserBody } from "../interfaces/requests.interfaces.ts";
import type { User } from "../interfaces/database.interfaces.ts";
const config: Config = configJson;


export const configUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const validate = (data: ConfigUserBody): Joi.ValidationResult<ConfigUserBody> => {
            const schema = Joi.object({
                firstname: Joi.string().optional().label("firstname"),
                lastname: Joi.string().optional().label("lastname"),
                // @ts-ignore
                password: passwordComplexity().optional().label("password"),
                publishToLeaderboard: Joi.boolean().optional(),
                language: Joi.string().optional().label("language").valid("fr", "en")
            });
            return schema.validate(data);
        };
        const userId = (req as AuthenticatedRequest).user.id;
        const { error } = validate(req.body);
        if (error){
            res.status(400).send({ message: error.details[0].message });
            return;
        }

        const { firstname, lastname, password, publishToLeaderboard, language } = req.body as ConfigUserBody;

        // Dynamically construct the SQL query
        const updates: string[] = [];
        const params: string[] = [];

        if (firstname) {
            updates.push("firstname = ?");
            params.push(firstname);
        }
        if (lastname) {
            updates.push("lastname = ?");
            params.push(lastname);
        }
        if (password) {
            // Hash the password before updating
            const salt: string = await bcrypt.genSalt(Number(config.salt));
            const hashedPassword: string = await bcrypt.hash(password, salt);
            updates.push("password = ?");
            params.push(hashedPassword);
        }
        if (publishToLeaderboard !== undefined) {
            updates.push("publishToLeaderboard = ?");
            params.push(publishToLeaderboard === null ? "NULL" : (publishToLeaderboard ? "1" : "0"));
        }
        if (language !== undefined) {
            updates.push("language = ?");
            params.push(language);
        }
        if (updates.length === 0) {
            res.status(400).send({ message: "No fields to update" });
        }
        // Add the user ID to the parameters
        params.push(String(userId));

        // Construct and execute the SQL query
        const updateUserStmt = db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`);
        updateUserStmt.run(...params);

        // update token content
        const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
        const user = stmt.get(userId) as User;
        const token = getUserToken(user);
        res.status(200).send({ message: "User updated successfully", token: token });
    } catch (error: unknown) {
        console.log(error);
        res.status(500).send({ message: "Internal Server Error" });
    }
};
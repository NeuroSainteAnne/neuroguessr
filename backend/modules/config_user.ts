import Joi from "joi";
import { sql } from "./database_init.ts";
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

        // Check if there's anything to update
        if (firstname === undefined && lastname === undefined && password === undefined && 
            publishToLeaderboard === undefined && language === undefined) {
            res.status(400).send({ message: "No fields to update" });
            return;
        }

        // Get user to verify they exist
        const existingUsers = await sql`
            SELECT * FROM users WHERE id = ${userId} LIMIT 1
        `;
        
        if (!existingUsers.length) {
            res.status(404).send({ message: "User not found" });
            return;
        }

        // Dynamically construct the SQL query
        let updates: Partial<{
            firstname: string;
            lastname: string;
            password: string;
            publish_to_leaderboard: boolean;
            language: string;
        }> = {};
                
        if (firstname) {
            updates.firstname = firstname;
        }
                
        if (lastname) {
            updates.lastname = lastname;
        }
                
        if (password) {
            const salt = await bcrypt.genSalt(Number(config.salt));
            updates.password = await bcrypt.hash(password, salt);
        }
                
        if (publishToLeaderboard) {
            updates.publish_to_leaderboard = publishToLeaderboard;
        }
                
        if (language !== undefined) {
            updates.language = language;
        }

        // Use the object with the sql tag for safe parameterization
        const updatedUsers = await sql`
            UPDATE users 
            SET ${sql(updates)}
            WHERE id = ${userId}
            RETURNING *
        `;
        const updatedUser = updatedUsers[0] as User;
        const updatedToken = getUserToken(updatedUser);

        res.status(200).send({ message: "User updated successfully", token: updatedToken });
    } catch (error: unknown) {
        console.log(error);
        res.status(500).send({ message: "Internal Server Error" });
    }
};
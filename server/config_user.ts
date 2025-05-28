import Joi from "joi";
import { db } from "./database_init.ts";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import passwordComplexity from "joi-password-complexity";
import fs from 'fs'
import path from "path";
import { __dirname } from "./utils.ts";
var config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'))


export const configUser = async (req, res) => {
    try {
        const validate = (data) => {
            const schema = Joi.object({
                firstname: Joi.string().optional().label("firstname"),
                lastname: Joi.string().optional().label("lastname"),
                password: passwordComplexity().optional().label("password"),
                publishToLeaderboard: Joi.boolean().optional(),
            });
            return schema.validate(data);
        };
        const userId = req.user._id;
        const { error } = validate(req.body);
        if (error)
            return res.status(400).send({ message: error.details[0].message });

        const { firstname, lastname, password, publishToLeaderboard } = req.body;

        // Dynamically construct the SQL query
        const updates : string[] = [];
        const params : string[] = [];

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
            const salt = await bcrypt.genSalt(Number(config.salt));
            const hashedPassword = await bcrypt.hash(password, salt);
            updates.push("password = ?");
            params.push(hashedPassword);
        }
        if (publishToLeaderboard !== undefined) {
            updates.push("publishToLeaderboard = ?");
            params.push(publishToLeaderboard === null ? "NULL" : (publishToLeaderboard? "1" : "0"));
        }
        if (updates.length === 0) {
            return res.status(400).send({ message: "No fields to update" });
        }
        // Add the user ID to the parameters
        params.push(userId);

        // Construct and execute the SQL query
        const updateUserStmt = db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`);
        updateUserStmt.run(...params);
        res.status(200).send({ message: "User updated successfully" });
    }  catch (error) {
        console.log(error);
        res.status(500).send({ message: "Internal Server Error" });
    }
};
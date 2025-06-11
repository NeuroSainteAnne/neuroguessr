import Joi from "joi";
import { sql } from "./database_init.ts";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { __dirname, getUserToken } from "./utils.ts";
import type { User } from "../interfaces/database.interfaces.ts";
import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest, LoginRequestBody } from "../interfaces/requests.interfaces.ts";
import type { Config } from "../interfaces/config.interfaces.ts";
import configJson from '../config.json' with { type: "json" };
const config: Config = configJson;

export const login = async (req: Request<{}, {}, LoginRequestBody>, res: Response): Promise<void> => {
    try {
        const validate = (data: LoginRequestBody): Joi.ValidationResult<LoginRequestBody> => {
            const schema = Joi.object({
                username: Joi.string().required().label("username"),
                password: Joi.string().required().label("password")
            });
            return schema.validate(data);
        };

        const { error } = validate(req.body);
        if (error){
            res.status(400).send({ message: error.details[0].message });
            return;
        } 

        const users = await sql`
            SELECT * FROM users WHERE username = ${req.body.username} LIMIT 1
        `;
        if (!users.length){
            res.status(401).send({ message: "Invalid Username or Password" });
            return;
        }
        const user = users[0] as User;

        const validPassword: boolean = await bcrypt.compare(req.body.password, user.password);

        if (!validPassword){
            res.status(401).send({ message: "Invalid Username or Password" });
            return;
        }

        if (!user.verified) {
            res.status(403).send({ message: "Please verify your e-mail." });
            return;
        }
        const token = getUserToken(user);
        res.status(200).send({ 
            token: token, 
            message: "user was successfully logged in" 
        });
    } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
    }
}

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const authHeader: string | undefined = req.headers['authorization'] as string | undefined;
        const token: string | undefined = authHeader && authHeader.split(' ')[1];

        if (!token) {
            res.status(401).send({ message: "No token provided" });
            return;
        }

        // Verify the existing token
        jwt.verify(token, config.jwt_secret, (err: any, decoded: any) => {
            if (err) {
                return res.status(403).send({ message: "Invalid or expired token" });
            }

            // Cast the decoded token to User
            const user = decoded as User;

            // Generate a new token with a refreshed expiration time
            const newToken = getUserToken(user);

            res.status(200).send({ 
                token: newToken, 
                message: "Token refreshed successfully" 
            });
        });
    } catch (error: unknown) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error" });
    }
};

export const authenticateToken = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const authHeader: string | undefined = req.headers['authorization'] as string | undefined;
    const token: string | undefined = authHeader && authHeader.split(' ')[1];
    try {
        if (!token) {
            res.status(401).send({ message: "No token provided" });
            return;
        }

        jwt.verify(token, config.jwt_secret, (err: any, decoded: unknown) => {
            if (err) {
                return res.status(403).send({ message: "Invalid or expired token" });
            }

            // Attach the user information to the request object
            (req as AuthenticatedRequest).user = decoded as User;
            next(); // Proceed to the next middleware or route handler
        });
    } catch (error) {
        console.error("Error authenticating token:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
};


export const getUserInfo = async (req: Request, res: Response): Promise<void> => {
    try {
        // The user information is available in req.user (set by the middleware)
        const userId: number = (req as AuthenticatedRequest).user.id;

        // Fetch user information from the database
        const users = await sql`
            SELECT id, username, firstname, lastname, email, publish_to_leaderboard
            FROM users 
            WHERE id = ${userId} 
            LIMIT 1
        `;
        if (!users.length) {
            res.status(404).send({ message: "User not found" });
            return;
        }
        const user = users[0] as Partial<User>;

        if (!user) {
            res.status(404).send({ message: "User not found" });
            return;
        }

        res.status(200).send({ user });
    } catch (error: unknown) {
        console.error("Error fetching user info:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
}
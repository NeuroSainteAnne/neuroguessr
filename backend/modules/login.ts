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
import { logger } from "./logging.ts";
const config: Config = configJson;

export const login = async (req: Request<{}, {}, LoginRequestBody>, res: Response): Promise<void> => {
    const startTime = Date.now();
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    logger.info('Login attempt started', {
        username: req.body?.username,
        clientIP,
        userAgent,
        timestamp: new Date().toISOString()
    });

    try {
        const validate = (data: LoginRequestBody): Joi.ValidationResult<LoginRequestBody> => {
            const schema = Joi.object({
                username: Joi.string().required().label("username or email"),
                password: Joi.string().required().label("password")
            });
            return schema.validate(data);
        };

        const { error } = validate(req.body);
        if (error){
            const duration = Date.now() - startTime;
            logger.warn('Login validation failed', {
                username: req.body?.username,
                clientIP,
                error: error.details[0].message,
                duration: `${duration}ms`
            });
            res.status(400).send({ message: error.details[0].message });
            return;
        } 

        const users = await sql`
            SELECT * FROM users WHERE username = ${req.body.username} OR email = ${req.body.username}
            ORDER BY CASE WHEN username = ${req.body.username} THEN 0 ELSE 1 END
            LIMIT 1
        `;
        if (!users.length){
            const duration = Date.now() - startTime;
            logger.warn('Login failed - user not found', {
                username: req.body.username,
                clientIP,
                duration: `${duration}ms`,
                reason: 'user_not_found'
            });
            res.status(401).send({ message: "Invalid Username or Password" });
            return;
        }
        const user = users[0] as User;

        const validPassword: boolean = await bcrypt.compare(req.body.password, user.password);

        if (!validPassword){
            const duration = Date.now() - startTime;
            logger.warn('Login failed - invalid password', {
                username: req.body.username,
                userId: user.id,
                clientIP,
                duration: `${duration}ms`,
                reason: 'invalid_password'
            });
            res.status(401).send({ message: "Invalid Username or Password" });
            return;
        }

        if (!user.verified) {
            const duration = Date.now() - startTime;
            logger.warn('Login failed - email not verified', {
                username: req.body.username,
                userId: user.id,
                clientIP,
                duration: `${duration}ms`,
                reason: 'email_not_verified'
            });
            res.status(403).send({ message: "Please verify your e-mail." });
            return;
        }
        
        const token = getUserToken(user);
        const duration = Date.now() - startTime;
        
        logger.info('Login successful', {
            username: user.username,
            userId: user.id,
            clientIP,
            userAgent,
            duration: `${duration}ms`,
            tokenGenerated: true
        });
        
        res.status(200).send({ 
            token: token, 
            message: "user was successfully logged in" 
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('Login error - internal server error', {
            username: req.body?.username,
            clientIP,
            duration: `${duration}ms`,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).send({ message: "Internal Server Error" });
    }
}

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    logger.info('Token refresh attempt', {
        clientIP,
        userAgent: req.headers['user-agent'] || 'unknown',
        timestamp: new Date().toISOString()
    });

    try {
        const authHeader: string | undefined = req.headers['authorization'] as string | undefined;
        const token: string | undefined = authHeader && authHeader.split(' ')[1];

        if (!token) {
            const duration = Date.now() - startTime;
            logger.warn('Token refresh failed - no token provided', {
                clientIP,
                duration: `${duration}ms`,
                reason: 'no_token'
            });
            res.status(401).send({ message: "No token provided" });
            return;
        }

        // Verify the existing token
        jwt.verify(token, config.jwt_secret, async (err: any, decoded: any) => {
            const duration = Date.now() - startTime;
            
            if (err) {
                logger.warn('Token refresh failed - invalid token', {
                    clientIP,
                    duration: `${duration}ms`,
                    reason: 'invalid_token',
                    errorType: err.name || 'unknown'
                });
                return res.status(403).send({ message: "Invalid or expired token" });
            }

            try {
                // Fetch the complete user information from the database
                const users = await sql`
                    SELECT * FROM users WHERE id = ${decoded.id} LIMIT 1
                `;
                if (!users.length) {
                    logger.warn('Token refresh failed - user not found', {
                        userId: decoded.id,
                        clientIP,
                        duration: `${duration}ms`,
                        reason: 'user_not_found'
                    });
                    return res.status(403).send({ message: "User not found" });
                }
                const user = users[0] as User;

                // Generate a new token with refreshed expiration time
                const newToken = getUserToken(user);

                logger.info('Token refresh successful', {
                    userId: user.id,
                    username: user.username,
                    clientIP,
                    duration: `${duration}ms`,
                    tokenRefreshed: true
                });

                res.status(200).send({ 
                    token: newToken, 
                    message: "Token refreshed successfully" 
                });
            } catch (dbError) {
                logger.error('Token refresh failed - database error', {
                    userId: decoded.id,
                    clientIP,
                    duration: `${duration}ms`,
                    error: dbError instanceof Error ? dbError.message : 'Unknown database error'
                });
                res.status(500).send({ message: "Internal Server Error" });
            }
        });
    } catch (error: unknown) {
        const duration = Date.now() - startTime;
        logger.error("Error during token refresh", {
            clientIP,
            duration: `${duration}ms`,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
        res.status(500).send({ message: "Internal Server Error" });
    }
};

export const optionalAuthenticateToken = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    return authenticateToken(req, res, next, true);
}

export const authenticateToken = (
    req: Request,
    res: Response,
    next: NextFunction,
    optional: boolean = false
): void => {
    const authHeader: string | undefined = req.headers['authorization'] as string | undefined;
    const token: string | undefined = authHeader && authHeader.split(' ')[1];
    try {
        if (!token) {
            if (optional) {
                next();
                return;
            }
            res.status(401).send({ message: "No token provided" });
            return;
        }

        jwt.verify(token, config.jwt_secret, (err: any, decoded: unknown) => {
            if (err) {
                if (optional) {
                    next();
                    return;
                }
                return res.status(403).send({ message: "Invalid or expired token" });
            }

            // Attach the user information to the request object
            (req as AuthenticatedRequest).user = decoded as User;
            (req as AuthenticatedRequest).userToken = token;
            next(); // Proceed to the next middleware or route handler
        });
    } catch (error) {
        logger.error("Error authenticating token:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
};


export const getUserInfo = async (req: Request, res: Response): Promise<void> => {
    try {
        // The user information is available in req.user (set by the middleware)
        const userId: number = (req as AuthenticatedRequest).user.id;

        // Fetch user information from the database
        const users = await sql`
            SELECT id, username, firstname, lastname, email, publish_to_leaderboard,
            language, clinical_trial_gender, clinical_trial_age,
            clinical_trial_country, clinical_trial_occupation, clinical_trial_consent
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
        logger.error("Error fetching user info:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
}
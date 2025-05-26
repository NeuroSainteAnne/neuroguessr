import Joi from "joi";
import { db } from "./database_init.ts"; // Assuming db is exported from here
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fs from 'fs'
import path from "path";
import { __dirname } from "./utils.ts";
import pkg from 'express'; // Import the default export of express
const { Request, Response, NextFunction } = pkg; // Destructure Request, Response, NextFunction types

var config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'))

// IMPORTANT: Extend the Express Request interface to include userId and user
// This makes req.userId and req.user available and type-safe in your middleware and routes.
declare global {
    namespace Express {
        interface Request {
            userId?: number; // The user's ID from the JWT payload (_id)
            user?: any; // The entire decoded JWT payload, for convenience
        }
    }
}

/**
 * Handles user login.
 * Validates credentials and returns a JWT token upon successful authentication.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const login = async (req: Request, res: Response) => {
    try {
        // Joi schema for request body validation
        const validate = (data: any) => {
            const schema = Joi.object({
                username: Joi.string().required().label("username"),
                password: Joi.string().required().label("password")
            });
            return schema.validate(data);
        };

        const { error } = validate(req.body);
        if (error) {
            return res.status(400).send({ message: error.details[0].message });
        }

        // Prepare and execute a synchronous query to find the user
        const stmt = db.prepare("SELECT * FROM users WHERE username = ?");
        const user: any = stmt.get(req.body.username); // .get() for single row with better-sqlite3

        if (!user) {
            return res.status(401).send({ message: "Invalid Username or Password" });
        }

        // Compare provided password with hashed password
        const validPassword = await bcrypt.compare(req.body.password, user.password);

        if (!validPassword) {
            return res.status(401).send({ message: "Invalid Username or Password" });
        }

        // Check if user's email is verified
        if (!user.verified) {
            return res.status(403).send({ message: "Please verify your e-mail." });
        }

        // Generate a JSON Web Token (JWT)
        const token = jwt.sign({
            username: user.username,
            email: user.email,
            firstname: user.firstname,
            lastname: user.lastname,
            _id: user.id // Store user's database ID in the token payload
        }, config.jwt_secret, { expiresIn: "1h" }); // Token expires in 1 hour

        res.status(200).send({
            token: token,
            message: "user was successfully logged in"
        });
    } catch (error) {
        console.error("Login error:", error); // Log the actual error for debugging
        res.status(500).send({ message: "Internal Server Error" })
    }
}

/**
 * Refreshes an existing JWT token.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const refreshToken = async (req: Request, res: Response) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer <token>"

        if (!token) {
            return res.status(401).send({ message: "No token provided" });
        }

        // Verify the existing token using the secret
        jwt.verify(token, config.jwt_secret, (err, user) => {
            if (err) {
                // If token is invalid or expired, send 403 Forbidden
                return res.status(403).send({ message: "Invalid or expired token" });
            }

            // Generate a new token with a refreshed expiration time
            // Re-use existing payload data from the decoded token
            const newToken = jwt.sign(
                {
                    username: (user as any).username,
                    email: (user as any).email,
                    firstname: (user as any).firstname,
                    lastname: (user as any).lastname,
                    _id: (user as any)._id // Ensure _id is carried over
                },
                config.jwt_secret,
                { expiresIn: "1h" } // New token also expires in 1 hour
            );

            res.status(200).send({
                token: newToken,
                message: "Token refreshed successfully"
            });
        });
    } catch (error) {
        console.error("Refresh token error:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
};

/**
 * Middleware to authenticate JWT token from the Authorization header.
 * Attaches userId and the decoded user payload to the request object.
 * @param req The Express request object.
 * @param res The Express response object.
 * @param next The Express next middleware function.
 */
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract token

    if (!token) {
        return res.status(401).send({ message: "No token provided" }); // No token present
    }

    // Verify the token
    jwt.verify(token, config.jwt_secret, (err, user) => {
        if (err) {
            return res.status(403).send({ message: "Invalid or expired token" }); // Token invalid/expired
        }

        // IMPORTANT: Assign _id from JWT payload to req.userId for consistency
        req.userId = (user as any)._id; // Cast user to any to access _id property
        req.user = user; // Attach the entire decoded user payload for other handlers

        next(); // Proceed to the next middleware or route handler
    });
};

/**
 * Retrieves authenticated user's information.
 * Requires authentication via authenticateToken middleware.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getUserInfo = async (req: Request, res: Response) => {
    try {
        // The user ID is now available in req.userId (set by the authenticateToken middleware)
        const userId = req.userId;

        if (!userId) { // Safety check, though authenticateToken should ensure this
            return res.status(400).send({ message: "User ID not found in token." });
        }

        // Fetch user information from the database using the userId
        const stmt = db.prepare("SELECT id, username, firstname, lastname, email FROM users WHERE id = ?");
        const user: any = stmt.get(userId); // .get() for single row with better-sqlite3

        if (!user) {
            return res.status(404).send({ message: "User not found" });
        }

        res.status(200).send({ user });
    } catch (error) {
        console.error("Error fetching user info:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
}

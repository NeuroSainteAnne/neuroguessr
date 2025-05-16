import Joi from "joi";
import { db } from "./database_init.ts";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const login = async (req, res) => {
    try {
        const validate = (data) => {
            const schema = Joi.object({
                email: Joi.string().email().required().label("Email"),
                password: Joi.string().required().label("password")
            });
            return schema.validate(data);
        };

        const { error } = validate(req.body);
        if (error) return res.status(400).send({ message: error.details[0].message });

        const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
        const user = stmt.get(req.body.email);

        if (!user) return res.status(401).send({ message: "Invalid Email or Password" });

        const validPassword = await bcrypt.compare(req.body.password, user.password);

        if (!validPassword) return res.status(401).send({ message: "Invalid Email or Password" });

        if (!user.verified) {
            return res.status(403).send({ message: "Verify your Account." });
        };
        const token = jwt.sign({ email: user.email, _id: user.id }, process.env.SECRETKEY, { expiresIn: "1h" });
        res.status(200).send({ data: token, message: "user was successfully logged in" });
    } catch (error) {
        res.status(500).send({ message: "Internally Server Error" })
    }
}
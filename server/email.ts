import nodemailer from "nodemailer";
import fs from 'fs'
import path from "path";
import { __dirname } from "./utils.ts";
var config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'))

export const sendEmail = async (email, subject, message) => {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: config.email.gmail_adress,
                pass: config.email.gmail_password,
            },
        });

        transporter.sendMail({
            from: process.env.HOST,
            to: email,
            subject: subject,
            html: message
        });
        console.log("Email sent Successfully")
    } catch (error) {
        console.log("Email not sent")
        console.log(error)
        return error;
    }
};
import nodemailer from "nodemailer";
import type { SentMessageInfo } from "nodemailer";
import { __dirname } from "./utils.ts";
import {google} from 'googleapis';
import http from 'http';
import url from 'url';
import open from 'open';
import destroyer from 'server-destroy';
import {OAuth2Client} from 'google-auth-library';
import type { Config } from "../interfaces/config.interfaces.ts";
import configJson from '../config.json' with { type: "json" };
import path from "path";
import fs from "fs";
import { logger } from "./logging.ts";
import stub from 'nodemailer-stub-transport';
const config: Config = configJson;

// Read and encode the image as base64
const logoPath = path.join(__dirname, "../assets/neuroguessr_logo.png");
const logoData = fs.readFileSync(logoPath);
const logoBase64 = logoData.toString("base64");
const logoMime = "image/png";
export const logoString = `data:${logoMime};base64,${logoBase64}`

/**
* Create a new OAuth2Client, and go through the OAuth2 content
* workflow.  Return the full client to the callback.
*/
export const sendEmail = async (
  email: string,
  subject: string,
  message: string
): Promise<void | Error> => {
  try {
    if (config.email.type == "gmail_api") {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          type: "OAuth2",
          user: config.email.mail_address,
          clientId: config.email.clientId,
          clientSecret: config.email.clientSecret,
          refreshToken: config.email.refreshToken,
        },
      });
      const emailMessage = {
        from: config.email.mail_address,
        to: email,
        subject: subject,
        html: message,
        encoding: "utf-8",
        attachments: [
          {
            filename: 'neuroguessr_logo.png',
            content: logoData,
            cid: 'logo@neuroguessr'
          }
        ]
      }
      var transporter2 = nodemailer.createTransport(stub());

      transporter2.sendMail(emailMessage, function(error, info) {
          console.log(info.response.toString());
      });
      await transporter.sendMail(
        emailMessage
      );
      logger.info("Email sent successfully via Gmail API");
    } else {
      const transporter = nodemailer.createTransport({
        // @ts-ignore
        host: config.email.server,
        port: config.email.port,
        auth: {
          user: config.email.mail_address,
          pass: config.email.mail_password,
        },
        proxy: config.email.proxy,
      });

      transporter
        .sendMail({
          from: config.email.mail_address,
          to: email,
          subject: subject,
          html: message,
          attachments: [
            {
              filename: 'neuroguessr_logo.png',
              content: logoData,
              cid: 'logo@neuroguessr'
            }
          ]
        })
        .then(() => {
          logger.info("Email sent Successfully");
        })
        .catch((e: Error) => {
          logger.error(e);
        });
    }
  } catch (error) {
    logger.error("Email not sent", error);
    return error as Error;
  }
};
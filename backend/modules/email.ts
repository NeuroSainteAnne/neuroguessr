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
const config: Config = configJson;

/**
* Create a new OAuth2Client, and go through the OAuth2 content
* workflow.  Return the full client to the callback.
*/
function getAuthenticatedClient() {
    return new Promise<OAuth2Client>((resolve, reject) => {
      // create an oAuth client to authorize the API call.  Secrets are kept in a `keys.json` file,
      // which should be downloaded from the Google Developers Console.
      const oAuth2Client = new OAuth2Client({
        clientId: config.email.clientId,
        clientSecret: config.email.clientSecret,
        redirectUri: config.email.redirectPath
      });
  
      // Generate the url that will be used for the consent dialog.
      const authorizeUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: config.email.scope,
        prompt: "consent"
      });
  
      // Open an http server to accept the oauth callback. In this simple example, the
      // only request to our webserver is to /oauth2callback?code=<code>
      const server = http
        .createServer(async (req, res) => {
          try {
            if (req.url && req.url.indexOf('/oauth2callback') > -1) {
              // acquire the code from the querystring, and close the web server.
              const qs = new url.URL(req.url, config.email.redirectPath)
                .searchParams;
              const code = qs.get('code');
              res.end('Authentication successful! Please return to the console.');
              // Now that we have the code, use that to acquire tokens.
              const r = await oAuth2Client.getToken(String(code));
              // Make sure to set the credentials on the OAuth2 client.
              oAuth2Client.setCredentials(r.tokens);
              console.info('Tokens acquired.');
              resolve(oAuth2Client);
            }
          } catch (e) {
            reject(e);
          }
        })
        .listen(4000, () => {
          // open the browser to the authorize url to start the workflow
          open(authorizeUrl, {wait: false}).then(cp => cp.unref());
        });
      destroyer(server);
    });
  }

const gmail = google.gmail('v1');
if(config.email.type == "gmail_api"){
    const oAuth2Client = await getAuthenticatedClient();
    const res = await oAuth2Client.request({url:config.email.scope});
    google.options({auth:oAuth2Client});
} 

export const sendEmail = async (
  email: string,
  subject: string,
  message: string
): Promise<void | Error> => {
  try {
    if (config.email.type == "gmail_api") {
      const transporter = nodemailer.createTransport({
        streamTransport: true,
        buffer: true, // return Buffer instead of Stream
        newline: "unix", // LF (\n)
      });
      transporter.sendMail(
        {
          from: config.email.mail_address,
          to: email,
          subject: subject,
          html: message,
        },
        async (err: Error | null, info: SentMessageInfo): Promise<void> => {
          if (err) throw err;
          const encodedMessage = (info.message as Buffer)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
          const res = await gmail.users.messages.send({
            userId: "me",
            requestBody: {
              raw: encodedMessage,
            },
          });
        }
      );
    } else {
      const transporter = nodemailer.createTransport({
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
        })
        .then(() => {
          console.log("Email sent Successfully");
        })
        .catch((e: Error) => {
          console.log(e);
        });
    }
  } catch (error) {
    console.log("Email not sent");
    console.log(error);
    return error as Error;
  }
};
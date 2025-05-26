import fs from 'fs'
import path from "path";
import { __dirname } from "./utils.ts";
import { authenticateToken } from "./login.ts";
var config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'))

export const globalAuthentication = (req, res, next) => {
    if(!config.server.globalAuthentication.enabled) {
        next();
        return;
    }
    const authheader = req.headers.authorization;
    if (!authheader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="mon site à moi", charset="UTF-8"');
        res.status(401).end();
    }
    else {
      /*extraire la partie credentials de la propriété "authorization", en en supprimant la partie Basic située au début, décoder le Base64 */
      if(authheader && authheader.split(' ')[0] == "Bearer") {
        authenticateToken(req, res, next);
        return;
      }
      const credentials  = Buffer.from(authheader.split(' ')[1],'base64').toString();
      const [user,password] = credentials.split(':');
      if (user === config.server.globalAuthentication.username && password === config.server.globalAuthentication.password) {
          // let's continue
          next();
      } else {
        // mauvais user name ou password
        res.setHeader('WWW-Authenticate', 'Basic realm="mon site à moi", charset="UTF-8"');
        res.status(401).end();
      }
    }
}
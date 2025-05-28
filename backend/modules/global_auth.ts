import { __dirname } from "./utils.ts";
import { authenticateToken } from "./login.ts";
import type { Request, Response, NextFunction } from 'express';
import type { Config } from '../interfaces/config.interfaces.ts';
import configJson from '../config.json' with { type: "json" };
const config: Config = configJson;

export const globalAuthentication = (req: Request, res: Response, next: NextFunction): void => {
  if (!config.server.globalAuthentication.enabled) {
    next();
    return;
  }
  const authheader: string | undefined = req.headers.authorization;
  if (!authheader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="mon site à moi", charset="UTF-8"');
    res.status(401).end();
  }
  else {
    /*extraire la partie credentials de la propriété "authorization", en en supprimant la partie Basic située au début, décoder le Base64 */
    if (authheader && authheader.split(' ')[0] === "Bearer") {
      authenticateToken(req, res, next);
      return;
    }
    const credentials: string = Buffer.from(authheader.split(' ')[1], 'base64').toString();
    const [user, password] = credentials.split(':');
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
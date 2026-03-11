import { createChallenge, verifySolution } from 'altcha-lib';
import configJson from '../config.json' with { type: "json" };
import { Request, Response } from 'express';
import { logger } from './logging.ts';

/**
 * Generates an ALTCHA challenge
 */
export const generateChallenge = async (req: Request, res: Response) => {
  try {
    const challenge = await createChallenge({hmacKey: configJson.altcha_secret, maxNumber: 500000});
    res.status(200).json(challenge);
  } catch (error) {
    logger.error('Error generating ALTCHA challenge:', error);
    res.status(500).json({ error: 'Failed to generate challenge' });
  }
};


export const verifyAltcha = async (payload:string) => {
  try {
    const result = await verifySolution(payload, configJson.altcha_secret, true);
    return result
  } catch (error) {
    return false;
  }
};

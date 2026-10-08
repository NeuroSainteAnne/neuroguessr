import { createChallenge, verifySolution } from 'altcha-lib';
import type { Payload } from 'altcha-lib';
import configJson from '../config.json' with { type: "json" };
import { Request, Response } from 'express';
import { logger } from './logging.ts';
import { randomInt } from 'crypto';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'

/**
 * Generates an ALTCHA challenge
 */
export const generateChallenge = async (req: Request, res: Response) => {
  try {
    const challenge = await createChallenge({
      algorithm: 'PBKDF2/SHA-256',
      cost: 5000,
      counter: randomInt(5000, 10000),
      deriveKey,
      hmacKeySignatureSecret: configJson.altcha_secret,
      hmacSignatureSecret: configJson.altcha_secret
    });
    res.status(200).json(challenge);
  } catch (error) {
    logger.error('Error generating ALTCHA challenge:', error);
    res.status(500).json({ error: 'Failed to generate challenge' });
  }
};


export const verifyAltcha = async (payload: string) => {
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as Payload;
    const result = await verifySolution({
      challenge: decoded.challenge,
      solution: decoded.solution,
      deriveKey,
      hmacKeySignatureSecret: configJson.altcha_secret,
      hmacSignatureSecret: configJson.altcha_secret
    });
    return result.verified;
  } catch (error) {
    return false;
  }
};

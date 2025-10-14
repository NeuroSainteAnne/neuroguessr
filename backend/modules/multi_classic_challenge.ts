import type { Request, Response } from "express";
import { User } from "interfaces/database.interfaces.ts";
import jwt from "jsonwebtoken";
import { Socket } from "socket.io"
import { sql } from "./database_init.ts";
import { logger } from "./logging.ts";
import { config, games, generateGameCommands } from "./multi.ts";
import type { AuthenticatedRequest } from "interfaces/requests.interfaces.ts";
import { extractPersistentState } from "./multi_challenge.ts";


export const handleCreateClassicChallenge = async (data: {
      sessionCode: string;
      sessionToken: string;
      name: string;
      start_date: Date;
      end_date: Date;
      public: boolean;
      userToken: string;
    }, socket: Socket) => {
  const { sessionCode, sessionToken, name, start_date, end_date, public: isPublic, userToken } = data;

  // Verify admin privileges
  if (!userToken) {
    throw "Authentication token required";
  }

  try {
    const jwtPayload: any = jwt.verify(userToken, config.jwt_secret);
    if (!jwtPayload || !jwtPayload.admin) {
      throw "Admin privileges required";
    }

    // Validate that this is a valid session
    const sessionResult = await sql`
      SELECT session_token FROM multi_sessions WHERE session_code = ${sessionCode}
    ` as { session_token: string; }[];

    if (sessionResult.length === 0 || sessionResult[0].session_token !== sessionToken) {
      throw "Invalid session token";
    }

    // Get the game reference
    const gameRef = games[sessionCode];
    if (!gameRef) {
      throw "Game session not found";
    }

    // Convert the existing session to a classic challenge
    gameRef.isClassicChallenge = true;
    gameRef.startDate = new Date(start_date);
    gameRef.endDate = new Date(end_date);
    gameRef.name = name;
    gameRef.parameters.commands = generateGameCommands(gameRef.parameters)
    
    // Extract the persistent game state
    const persistentState = extractPersistentState(gameRef);

    // Update the database record
    await sql`
      UPDATE multi_sessions 
      SET is_classic_challenge = TRUE,
          start_date = ${start_date},
          end_date = ${end_date},
          name = ${name},
          public = ${isPublic},
          persistent_config = ${JSON.stringify(persistentState)},
          atlas = ${gameRef.parameters.atlas || null},
          total_duration = ${gameRef.parameters.totalDuration || null}
      WHERE session_code = ${sessionCode}
    `;

    logger.info(`Session ${sessionCode} converted to classic challenge "${name}" by user ${jwtPayload.id}`);
    return { 
      challenge: {
        sessionCode,
        name,
        start_date,
        end_date
      }
    };

  } catch (error) {
    throw error;
  }
}

// Get next upcoming or active classic challenge

export const getNextClassicChallenge = async (req: Request, res: Response) => {
  try {
    const currentTime = new Date().toISOString();

    // Check if user is authenticated and admin
    const authHeader: string | undefined = req.headers['authorization'] as string | undefined;
    const token: string | undefined = authHeader && authHeader.split(' ')[1];
    let isAdmin = false;
    let userId: number | null = null;
    if (token) {
      jwt.verify(token, config.jwt_secret, (err: any, decoded: unknown) => {
        if (!err) {
          isAdmin = (decoded as User).admin || false;
          userId = (decoded as User).id || null;
        }
      });
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, config.jwt_secret) as any;
        isAdmin = decoded.admin || false;
        userId = decoded.id || null;
      } catch (jwtError) {
        // Token is invalid, continue as guest
        logger.warn("Invalid token in getNextClassicChallenge:", jwtError);
      }
    }

    // Build query based on user permissions
    let query;
    if (isAdmin) {
      // Admin can see all classic challenges (public and private)
      query = sql`
        SELECT ms.id, ms.session_code, ms.created_at, ms.name, ms.start_date, ms.end_date,
                ms.atlas, ms.public, u.username AS creator_name, ms.total_duration
        FROM multi_sessions ms
        LEFT JOIN users u ON u.id = ms.creator_id
        WHERE ms.is_classic_challenge = TRUE
        AND ms.start_date <= ${currentTime}
        AND ms.end_date > ${currentTime}
        AND ms.id NOT IN (
          SELECT classic_challenge_id FROM finished_sessions WHERE user_id = ${userId}
        )
        ORDER BY ms.start_date ASC
        LIMIT 1
      `;
    } else {
      // Non-admin users can only see public classic challenges
      if (userId) {
        query = sql`
          SELECT ms.id, ms.session_code, ms.created_at, ms.name, ms.start_date, ms.end_date,
                 ms.atlas, ms.public, u.username AS creator_name, ms.total_duration
          FROM multi_sessions ms
          LEFT JOIN users u ON u.id = ms.creator_id
          WHERE ms.is_classic_challenge = TRUE
          AND ms.public = TRUE
          AND ms.start_date <= ${currentTime}
          AND ms.end_date > ${currentTime}
          AND ms.id NOT IN (
            SELECT classic_challenge_id FROM finished_sessions WHERE user_id = ${userId}
          )
          ORDER BY ms.start_date ASC
          LIMIT 1
        `;
      } else {
        query = sql`
          SELECT ms.id, ms.session_code, ms.created_at, ms.name, ms.start_date, ms.end_date,
                 ms.atlas, ms.public, u.username AS creator_name, ms.total_duration
          FROM multi_sessions ms
          LEFT JOIN users u ON u.id = ms.creator_id
          WHERE ms.is_classic_challenge = TRUE
          AND ms.public = TRUE
          AND ms.start_date <= ${currentTime}
          AND ms.end_date > ${currentTime}
          ORDER BY ms.start_date ASC
          LIMIT 1
        `;
      }
    }

    const result = await query as unknown as Array<{
      id: number;
      session_code: string;
      created_at: Date;
      name: string | null;
      start_date: string;
      end_date: string;
      atlas: string | null;
      public: boolean;
      creator_name: string | null;
      total_duration: number | null;
    }>;

    if (result.length === 0) {
      return res.status(200).json({ challenge: null, message: 'No upcoming or active classic challenges found' });
    }

    const session = result[0];
    const sessionCode = String(session.session_code).padStart(8, '0');
    const startDate = new Date(session.start_date);
    const endDate = new Date(session.end_date);
    const now = new Date();

    let status: 'upcoming' | 'active' | 'ended';
    if (startDate > now) {
      status = 'upcoming';
    } else if (endDate > now) {
      status = 'active';
    } else {
      status = 'ended';
    }

    const classicChallenge = {
      id: session.id,
      sessionCode,
      startDate: session.start_date,
      endDate: session.end_date,
      atlas: session.atlas,
      totalDuration: session.total_duration,
      name: session.name || undefined,
      status,
      creator: session.creator_name || 'Unknown',
      createdAt: session.created_at?.toISOString?.() || undefined
    };

    res.status(200).json({ challenge: classicChallenge });

  } catch (error) {
    logger.error("getNextClassicChallenge error", error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
export const deleteClassicChallenge = async (req: Request, res: Response) => {
  try {
    const { sessionCode } = req.params;
    const userId: number = (req as AuthenticatedRequest).user.id;
    const isAdmin: boolean = (req as AuthenticatedRequest).user.admin;

    if (!isAdmin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    if (!sessionCode || !/^\d{8}$/.test(sessionCode)) {
      res.status(400).json({ error: 'Invalid session code format' });
      return;
    }

    // Delete the classic challenge session from database
    const result = await sql`
      DELETE FROM multi_sessions
      WHERE session_code = ${sessionCode}
      AND is_classic_challenge = TRUE
    `;

    if (result.count === 0) {
      res.status(404).json({ error: 'Classic challenge not found' });
      return;
    }

    // Also remove from active games if it's running
    if (games[sessionCode]) {
      delete games[sessionCode];
      logger.info(`Removed active classic challenge session ${sessionCode} from memory`);
    }

    logger.info(`Admin ${userId} deleted classic challenge session ${sessionCode}`);
    res.status(200).json({ message: 'Classic challenge deleted successfully' });

  } catch (error) {
    logger.error("deleteClassicChallenge error", error);
    res.status(500).json({ error: 'Internal server error' });
  }
}; // Save persistent configuration for realtime challenge mode
// Get active and upcoming classic challenges for subscribers

export const getActiveClassicChallenges = async (req: Request, res: Response) => {
  try {
    const currentTime = new Date().toISOString();

    // Check if user is authenticated and admin
    const authHeader: string | undefined = req.headers['authorization'] as string | undefined;
    const token: string | undefined = authHeader && authHeader.split(' ')[1];
    let isAdmin = false;
    let userId = null;
    if (token) {
      jwt.verify(token, config.jwt_secret, (err: any, decoded: unknown) => {
        if (!err) {
          isAdmin = (decoded as User).admin || false;
          userId = (decoded as User).id || null;
        }
      });
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, config.jwt_secret) as any;
        userId = decoded.id;
        isAdmin = decoded.admin || false;
      } catch (jwtError) {
        // Token is invalid, continue as guest
        logger.warn("Invalid token in getActiveClassicChallenges:", jwtError);
      }
    }

    // Build query based on user permissions
    let query;
    if (isAdmin) {
      // Admin can see all classic challenges (public and private)
      query = sql`
        SELECT ms.id, ms.session_code, ms.created_at, ms.name, ms.start_date, ms.end_date,
               ms.public, u.username AS creator_name, ms.total_duration
        FROM multi_sessions ms
        LEFT JOIN users u ON u.id = ms.creator_id
        WHERE ms.is_classic_challenge = TRUE
        AND ms.end_date > ${currentTime}
        ORDER BY ms.start_date ASC
      `;
    } else {
      // Non-admin users can only see public classic challenges
      query = sql`
        SELECT ms.id, ms.session_code, ms.created_at, ms.name, ms.start_date, ms.end_date,
               ms.public, u.username AS creator_name, ms.total_duration
        FROM multi_sessions ms
        LEFT JOIN users u ON u.id = ms.creator_id
        WHERE ms.is_classic_challenge = TRUE
        AND ms.public = TRUE
        AND ms.end_date > ${currentTime}
        ORDER BY ms.start_date ASC
      `;
    }

    const result = await query as unknown as Array<{
      id: number;
      session_code: string;
      created_at: Date;
      name: string | null;
      start_date: string;
      end_date: string;
      public: boolean;
      creator_name: string | null;
      total_duration: number | null;
    }>;

    const classicChallenges = result.map(session => {
      const startDate = new Date(session.start_date);
      const endDate = new Date(session.end_date);
      const now = new Date();

      let status: 'upcoming' | 'active' | 'ended';
      if (startDate > now) {
        status = 'upcoming';
      } else if (endDate > now) {
        status = 'active';
      } else {
        status = 'ended';
      }

      return {
        id: session.id,
        sessionCode: String(session.session_code).padStart(8, '0'),
        name: session.name || undefined,
        startDate: session.start_date,
        endDate: session.end_date,
        public: session.public,
        creator: session.creator_name || 'Unknown',
        totalDuration: session.total_duration,
        status,
        createdAt: session.created_at?.toISOString?.() || undefined
      };
    });

    res.status(200).json({
      challenges: classicChallenges,
      userPermissions: {
        isAdmin,
        canSeePrivate: isAdmin
      }
    });

  } catch (error) {
    logger.error("getActiveClassicChallenges error", error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
// Get a specific classic challenge

export const getClassicChallenge = async (req: Request, res: Response) => {
  try {
    const { sessionCode } = req.params;
    const userId = (req as AuthenticatedRequest).user.id;
    const currentTime = new Date().toISOString();

    if (!sessionCode || !/^\d{8}$/.test(sessionCode)) {
      return res.status(400).json({ error: 'Invalid session code format' });
    }

    const result = await sql`
      SELECT ms.id, ms.session_code, ms.created_at, ms.name, ms.start_date, ms.end_date,
             ms.parameters, ms.persistent_config, u.username AS creator_name
      FROM multi_sessions ms
      LEFT JOIN users u ON u.id = ms.creator_id
      WHERE ms.session_code = ${sessionCode}
      AND ms.is_classic_challenge = TRUE
      AND ms.start_date <= ${currentTime}
      AND ms.end_date > ${currentTime}
    ` as Array<{
      id: number;
      session_code: string;
      created_at: Date;
      name: string | null;
      start_date: string;
      end_date: string;
      parameters: any;
      persistent_config: string | null;
      creator_name: string | null;
    }>;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Classic challenge not found or not active' });
    }

    const session = result[0];
    const classicChallenge = {
      id: session.id,
      sessionCode: String(session.session_code).padStart(8, '0'),
      name: session.name || undefined,
      startDate: session.start_date,
      endDate: session.end_date,
      creator: session.creator_name || 'Unknown',
      atlas: session.parameters?.atlas,
      totalDuration: session.parameters?.totalDuration,
      persistentConfig: session.persistent_config ? JSON.parse(session.persistent_config) : null,
      createdAt: session.created_at?.toISOString?.() || undefined
    };

    res.status(200).json({ challenge: classicChallenge });

  } catch (error) {
    logger.error("getClassicChallenge error", error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
// Check if user can join a classic challenge (authentication, timing, replay prevention)

export const canJoinClassicChallenge = async (req: Request, res: Response) => {
  try {
    const { sessionCode } = req.body;
    const userId = (req as AuthenticatedRequest).user.id;
    const currentTime = new Date().toISOString();

    if (!sessionCode || !/^\d{8}$/.test(sessionCode)) {
      return res.status(400).json({ error: 'Invalid session code format' });
    }

    // Check if challenge exists and is active
    const challengeResult = await sql`
      SELECT ms.id, ms.start_date, ms.end_date
      FROM multi_sessions ms
      WHERE ms.session_code = ${sessionCode}
      AND ms.is_classic_challenge = TRUE
      AND ms.start_date <= ${currentTime}
      AND ms.end_date > ${currentTime}
    ` as Array<{
      id: number;
      start_date: string;
      end_date: string;
    }>;

    if (challengeResult.length === 0) {
      return res.status(404).json({ error: 'Classic challenge not found or not active' });
    }

    const challenge = challengeResult[0];

    // Check if user has already completed this challenge
    const completedResult = await sql`
      SELECT id FROM finished_sessions
      WHERE user_id = ${userId}
      AND classic_challenge_id = ${challenge.id}
    `;

    if (completedResult.length > 0) {
      return res.status(409).json({ error: 'You have already completed this classic challenge' });
    }

    res.status(200).json({ canJoin: true });

  } catch (error) {
    logger.error("canJoinClassicChallenge error", error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
// Check if user has completed a classic challenge

export const checkClassicChallengeCompletion = async (req: Request, res: Response) => {
  try {
    const { sessionCode } = req.params;
    const userId = (req as AuthenticatedRequest).user.id;

    if (!sessionCode || !/^\d{8}$/.test(sessionCode)) {
      return res.status(400).json({ error: 'Invalid session code format' });
    }

    // Get the challenge ID
    const challengeResult = await sql`
      SELECT ms.id
      FROM multi_sessions ms
      WHERE ms.session_code = ${sessionCode}
      AND ms.is_classic_challenge = TRUE
    ` as Array<{
      id: number;
    }>;

    if (challengeResult.length === 0) {
      return res.status(404).json({ error: 'Classic challenge not found' });
    }

    const challengeId = challengeResult[0].id;

    // Check if user has completed this challenge
    const completedResult = await sql`
      SELECT id FROM finished_sessions
      WHERE user_id = ${userId}
      AND classic_challenge_id = ${challengeId}
    `;

    res.status(200).json({ completed: completedResult.length > 0 });

  } catch (error) {
    logger.error("checkClassicChallengeCompletion error", error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


import type { Request, Response } from "express";
import { MultiSession, User } from "interfaces/database.interfaces.ts";
import jwt from "jsonwebtoken";
import { Socket } from "socket.io"
import { sql } from "./database_init.ts";
import { logger } from "./logging.ts";
import { config, emitToUser, games, generateGameCommands, getMultiUniqueCode, joinLobby, playerInfo, socketInfo } from "./multi.ts";
import type { AuthenticatedRequest } from "interfaces/requests.interfaces.ts";
import { extractPersistentState } from "./multi_challenge.ts";
import crypto from "crypto";
import { MultiplayerGame } from "interfaces/multi.interfaces.ts";
import { saveFinishedSessions, getClassicChallengeRankings } from "./multi_cleanup.ts";
import { sendEmail } from "./email.ts";

export const deactivateClassicChallenge = async (socket: Socket, data: {
      challengeId: number;
      userToken: string;
    }) => {
      
    const { challengeId, userToken } = data;

    // Verify admin privileges
    if (!userToken) {
      throw new Error("Authentication token required");
    }

    try {
      const jwtPayload: any = jwt.verify(userToken, config.jwt_secret);
      if (!jwtPayload || !jwtPayload.admin) {
        throw new Error("Admin privileges required");
      }

      // For classic challenges, we can "deactivate" by setting end_date to now
      const result = await sql`
        UPDATE multi_sessions
        SET end_date = NOW()
        WHERE id = ${challengeId} AND is_classic_challenge = true
      `;

      const success = result.count > 0;
      if (success) {
        logger.info(`Classic challenge ${challengeId} deactivated`);
        socket.emit('classic-challenge-deactivated', { success: true });
      } else {
        throw new Error("Challenge not found");
      }

    } catch (jwtError) {
      throw new Error("Invalid authentication token");
    }
};

export const handleCreateClassicChallenge = async (socket: Socket, data: {
      sessionCode: string;
      sessionToken: string;
      name: string;
      start_date: Date;
      end_date: Date;
      public: boolean;
      userToken: string;
    }) => {
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
          SELECT classic_challenge_id FROM finished_sessions WHERE user_id = ${userId} AND classic_challenge_id IS NOT NULL
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
            SELECT classic_challenge_id FROM finished_sessions WHERE user_id = ${userId} AND classic_challenge_id IS NOT NULL
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

export const getActiveClassicChallengesRaw = async () => {
  return await sql`
          SELECT
            ms.*,
            u.username as creator_username,
            u.firstname as creator_firstname,
            u.lastname as creator_lastname
          FROM multi_sessions ms
          JOIN users u ON ms.creator_id = u.id
          WHERE ms.is_classic_challenge = true
          AND ms.start_date <= NOW()
          AND ms.end_date >= NOW()
          ORDER BY ms.start_date ASC
        `;
  
}

export const getAllClassicChallengesRaw = async () => {
  return await sql`
            SELECT
              ms.*,
              u.username as creator_username,
              u.firstname as creator_firstname,
              u.lastname as creator_lastname
            FROM multi_sessions ms
            JOIN users u ON ms.creator_id = u.id
            WHERE ms.is_classic_challenge = true
            ORDER BY ms.created_at DESC
          `;
}

export const getClassicChallengesByIdRaw = async (challengeId: number) => {
  return await sql`
    SELECT
      ms.*,
      u.username as creator_username,
      u.firstname as creator_firstname,
      u.lastname as creator_lastname
    FROM multi_sessions ms
    JOIN users u ON ms.creator_id = u.id
    WHERE ms.id = ${challengeId} AND ms.is_classic_challenge = true
  `;
};

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

export const canJoinClassicChallengeSocket = async (data: {
      challengeId: number;
      userToken?: string;
      anonToken?: string;
    }) => {
  const { challengeId, userToken, anonToken } = data;

  // Get user ID from token if authenticated
  let userId: number | undefined = undefined;
  if (userToken) {
    try {
      const jwtPayload: any = jwt.verify(userToken, config.jwt_secret);
      userId = jwtPayload.id;
    } catch (jwtError) {
      throw new Error("Invalid authentication token");
    }
  }

  const challenge = await sql`
    SELECT * FROM multi_sessions
    WHERE id = ${challengeId} AND is_classic_challenge = true
  `;

  if (challenge.length === 0) {
    return { canJoin: false, reason: 'Challenge not found' };
  }

  const challengeData = challenge[0];
  const now = new Date();

  if (now < new Date(challengeData.start_date)) {
    return { canJoin: false, reason: 'Challenge has not started yet' };
  }

  if (now > new Date(challengeData.end_date)) {
    return { canJoin: false, reason: 'Challenge has ended' };
  }

  return { canJoin: true, sessionCode: challengeData.session_code };
}

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

export const getClassicChallengeLeaderboard = async (challengeId: number, limit: number) => {
  return await sql`
    SELECT
      fs.score,
      fs.duration,
      fs.correct,
      fs.incorrect,
      fs.attempts,
      u.username,
      u.firstname,
      u.lastname,
      fs.created_at as completion_date,
      fs.classic_challenge_name as challenge_name
    FROM finished_sessions fs
    JOIN users u ON fs.user_id = u.id
    WHERE fs.classic_challenge_session_id = ${challengeId}
    ORDER BY fs.score DESC, fs.duration ASC
    LIMIT ${limit}
  `;
};
export const joinClassicChallenge = async (socket: Socket, challenge: MultiSession, data: {
  sessionCode: string;
  userName: string;
  isAnonymous: boolean;
  token?: string;
  anonToken?: string;
}) => {
  // Implement your logic for joining a classic challenge lobby
  // Handle classic challenge logic
  const now = new Date();
  const startDate = new Date(challenge.start_date!!);
  const endDate = new Date(challenge.end_date!!);
  const { userName, token, sessionCode } = data;

  // Check timing
  if (now < startDate) {
    socket.emit('error', { message: 'Challenge has not started yet' });
    return;
  }

  if (now > endDate) {
    socket.emit('error', { message: 'Challenge has ended' });
    return;
  }

  if (challenge.classic_challenge_referral) {
    socket.emit('error', { message: 'Cannot create a self-referring challenge' });
    return;
  }

  // Get user ID for replay prevention check
  let userId: number | undefined = undefined;
  let finalUserName: string = userName;

  if (!token) {
    socket.emit('error', { message: 'Classic challenges require you to be logged in. Please log in to participate.' });
    return;
  }

  try {
    const jwtPayload: any = jwt.verify(token, config.jwt_secret);
    userId = jwtPayload.id;
    finalUserName = jwtPayload.username;
  } catch (jwtError) {
    socket.emit('error', { message: 'Invalid authentication token' });
    return;
  }

  // Check replay prevention for authenticated users
  if (userId) {
    const completedResult = await sql`
      SELECT id FROM finished_sessions
      WHERE user_id = ${userId}
      AND classic_challenge_id = ${challenge.id}
    `;

    if (completedResult.length > 0) {
      socket.emit('error', { message: 'You have already completed this classic challenge' });
      return;
    }

    // Check if user already has an active session for this challenge
    const activeSessionResult = await sql`
      SELECT id FROM multi_sessions
      WHERE classic_challenge_referral = ${sessionCode}
      AND user_id = ${userId}
    `;

    if (activeSessionResult.length > 0) {
      socket.emit('error', { message: 'You already have an active session for this classic challenge. Please complete or leave your current session first.' });
      return;
    }
  }

  // Create a unique session code for this user's challenge instance
  const userSessionCode = await getMultiUniqueCode();
  const userSessionToken = crypto.randomBytes(32).toString('hex');

  console.log("challenge", challenge);
  const newSessionConfig = JSON.parse(challenge.persistent_config || "");
  newSessionConfig.sessionCode = userSessionCode;

  // Create new temporary database entry for this user's personal challenge
  await sql`
    INSERT INTO multi_sessions (
      session_code, session_token, creator_id, 
      is_classic_challenge, start_date, end_date, name,
      persistent_config, created_at, classic_challenge_referral
    ) VALUES (
      ${userSessionCode}, ${userSessionToken}, ${userId!},
      true, ${new Date(challenge.start_date!)}, ${new Date(challenge.end_date!)}, ${challenge.name || 'Classic Challenge'},
      ${JSON.stringify(newSessionConfig)}, NOW(), ${sessionCode}
    )
  `;

  // Now join the lobby with the real session code
  const joinResult = await joinLobby(socket, userSessionCode, finalUserName, false, token, undefined);

  if (joinResult.success) {
    // Mark this as a classic challenge session
    const gameRef = games[userSessionCode];
    if (gameRef) {
      gameRef.isClassicChallenge = true;
      gameRef.name = challenge.name || undefined;
      gameRef.startDate = startDate;
      gameRef.endDate = endDate;
      gameRef.classicChallengeId = challenge.id; // Store the challenge ID


      // Keep original sessionCode for display purposes
      gameRef.originalSessionCode = sessionCode;
    }

    socket.emit('joined-classic-challenge', {
      sessionCode,
      userSessionCode,
      userSessionToken,
      challengeName: challenge.name,
      challengeId: challenge.id,
      startDate: challenge.start_date,
      endDate: challenge.end_date,
    });
  } else {
    socket.emit('error', { message: joinResult.error || 'Failed to join challenge' });
  }

  // Store socketInfo 
  socketInfo[socket.id] = { sessionCode: userSessionCode, userName };
};export const getPastClassicChallenges = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;
    const isAdmin = (req as AuthenticatedRequest).user?.admin;

    let challenges;
    if (isAdmin) {
      // For admins, get all past classic challenges from finished_sessions with their personal score and ranking
      challenges = await sql`
        SELECT DISTINCT
          fs.classic_challenge_id as id,
          fs.name,
          fs.classic_challenge_start_date as start_date,
          fs.classic_challenge_end_date as end_date,
          user_participation.score as user_score,
          user_participation.ranking as user_ranking,
          participant_counts.participant_count,
          MAX(fs.theoretical_maximum_score) as theoretical_maximum_score
        FROM finished_sessions fs
        LEFT JOIN (
          SELECT
            classic_challenge_id,
            user_id,
            score,
            ROW_NUMBER() OVER (PARTITION BY classic_challenge_id ORDER BY score DESC, avg_time_per_region ASC) as ranking
          FROM finished_sessions
          WHERE classic_challenge_id IS NOT NULL
        ) user_participation ON user_participation.classic_challenge_id = fs.classic_challenge_id AND user_participation.user_id = ${userId}
        LEFT JOIN (
          SELECT
            classic_challenge_id,
            COUNT(DISTINCT user_id) as participant_count
          FROM finished_sessions
          WHERE classic_challenge_id IS NOT NULL AND user_id IS NOT NULL
          GROUP BY classic_challenge_id
        ) participant_counts ON participant_counts.classic_challenge_id = fs.classic_challenge_id
        WHERE fs.classic_challenge_id IS NOT NULL
        GROUP BY fs.classic_challenge_id, fs.name, fs.classic_challenge_start_date, fs.classic_challenge_end_date, user_participation.score, user_participation.ranking, participant_counts.participant_count
        ORDER BY fs.classic_challenge_end_date DESC
      `;
    } else if (userId) {
      // For regular users, get challenges they participated in with their score and ranking
      challenges = await sql`
        SELECT DISTINCT
          fs.classic_challenge_id as id,
          fs.name,
          fs.classic_challenge_start_date as start_date,
          fs.classic_challenge_end_date as end_date,
          user_participation.score as user_score,
          user_participation.ranking as user_ranking,
          participant_counts.participant_count,
          MAX(fs.theoretical_maximum_score) as theoretical_maximum_score
        FROM finished_sessions fs
        JOIN (
          SELECT
            classic_challenge_id,
            user_id,
            score,
            ROW_NUMBER() OVER (PARTITION BY classic_challenge_id ORDER BY score DESC, avg_time_per_region ASC) as ranking
          FROM finished_sessions
          WHERE classic_challenge_id IS NOT NULL
        ) user_participation ON user_participation.classic_challenge_id = fs.classic_challenge_id AND user_participation.user_id = ${userId}
        LEFT JOIN (
          SELECT
            classic_challenge_id,
            COUNT(DISTINCT user_id) as participant_count
          FROM finished_sessions
          WHERE classic_challenge_id IS NOT NULL AND user_id IS NOT NULL
          GROUP BY classic_challenge_id
        ) participant_counts ON participant_counts.classic_challenge_id = fs.classic_challenge_id
        WHERE fs.user_id = ${userId} AND fs.classic_challenge_id IS NOT NULL
        GROUP BY fs.classic_challenge_id, fs.name, fs.classic_challenge_start_date, fs.classic_challenge_end_date, user_participation.score, user_participation.ranking, participant_counts.participant_count
        ORDER BY fs.classic_challenge_end_date DESC
      `;
    } else {
      // Not logged in, no past challenges
      return res.status(200).send({ challenges: [] });
    }

    res.status(200).send({ challenges });
  } catch (error) {
    logger.error("Error getting past challenges:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};
export async function handleClassicChallengeEnd(gameRef: MultiplayerGame) {
  try {
    if (!gameRef.classicChallengeId) return;

    // Persist final scores before computing rankings so the current user's row is present
    await saveFinishedSessions(gameRef);

    // Get rankings for all users who published to leaderboard
    const rankings = await getClassicChallengeRankings(gameRef.classicChallengeId);

    // For each user in the current game session
    for (const userName of Object.keys(gameRef.individualScores)) {
      // Skip anonymous users
      if (gameRef.anonymousUsernames && gameRef.anonymousUsernames.includes(userName)) {
        // Send basic end data for anonymous users
        emitToUser(gameRef.sessionCode, userName, "game-end", {
          scores: { [userName]: gameRef.individualScores[userName] },
          youWon: false, // Anonymous users don't get rankings
          isAnonymous: true
        });
        continue;
      }

      // Get user info
      const playerKey = `${gameRef.sessionCode}:${userName}`;
      const player = playerInfo[playerKey];
      if (!player || !player.userId) continue;

      const userScore = gameRef.individualScores[userName] || 0;

      // Send all rankings and user's score - frontend will handle publish_to_leaderboard logic
      emitToUser(gameRef.sessionCode, userName, "game-end", {
        scores: { [userName]: userScore },
        rankings: rankings,
        totalParticipants: rankings.length,
        isClassicChallenge: true
      });
    }
  } catch (error) {
    logger.error("Error handling classic challenge end:", error);
    // Fallback to basic game end
    const allScores = Object.values(gameRef.individualScores);
    const maxScore = Math.max(...allScores);
    Object.keys(gameRef.individualScores).forEach(userName => {
      emitToUser(gameRef.sessionCode, userName, "game-end", {
        scores: gameRef.individualScores,
        youWon: gameRef.individualScores[userName] === maxScore && maxScore > 0
      });
    });
  }
}
// Email opt-in for challenge participants

export const classicChallengeEmailOptIn = async (req: Request, res: Response) => {
  try {
    const { challengeId } = req.params;
    const userId = (req as AuthenticatedRequest).user.id;

    // Check if the user has a finished session for this challenge
    const finishedSessionResult = await sql`
      SELECT id FROM finished_sessions
      WHERE user_id = ${userId} AND classic_challenge_id = ${challengeId}
    `;

    if (finishedSessionResult.length === 0) {
      return res.status(404).send({ message: "You have not participated in this challenge" });
    }

    // Update the email opt-in flag
    await sql`
      UPDATE finished_sessions
      SET send_classic_challenge_email = TRUE
      WHERE user_id = ${userId} AND classic_challenge_id = ${challengeId}
    `;

    res.status(200).send({ message: "Email opt-in successful" });

  } catch (error) {
    logger.error("Error opting in for challenge email:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

export const sendClassicChallengeResultsEmails = async (challengeId: number) => {
  try {
    // Get challenge details
    const challengeResult = await sql`
      SELECT
        ms.id,
        ms.session_code,
        ms.name,
        ms.start_date,
        ms.end_date,
        u.username as creator_username
      FROM multi_sessions ms
      JOIN users u ON ms.creator_id = u.id
      WHERE ms.id = ${challengeId} AND ms.is_classic_challenge = true
    `;

    if (!challengeResult.length) {
      logger.warn(`Challenge ${challengeId} not found for email sending`);
      return;
    }

    const challenge = challengeResult[0];

    // Get participants who opted in for emails
    const participantsResult = await sql`
      SELECT
        fs.score,
        fs.duration,
        fs.correct,
        fs.incorrect,
        fs.attempts,
        fs.avg_time_per_region,
        fs.created_at as completion_date,
        u.username,
        u.email,
        u.firstname,
        u.lastname,
        u.language,
        ROW_NUMBER() OVER (ORDER BY fs.score DESC, fs.avg_time_per_region ASC) as ranking
      FROM finished_sessions fs
      JOIN users u ON fs.user_id = u.id
      WHERE fs.classic_challenge_id = ${challengeId}
        AND fs.send_classic_challenge_email = TRUE
      ORDER BY fs.score DESC, fs.duration ASC
    `;

    if (participantsResult.length === 0) {
      logger.info(`No opt-in participants for challenge ${challengeId}`);
      return;
    }

    // Import email function
    const backendI18n = (await import("./backend-i18n.ts")).default;

    // Send email to each participant
    for (const participant of participantsResult) {
      const lang = participant.language || 'fr';

      const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US');
      };

      const subject = backendI18n.t('email_subject', {
        lng: lang,
        challengeName: challenge.name || backendI18n.t('classic_challenge', { lng: lang })
      });

      const message = `
        <head>
            <style>
                body { background-color:#363636; width:100%; font-family: Open Sans,system-ui,Arial,Helvetica,sans-serif; color: #d9dddc; text-align:left; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .logo { width: 64px; height: 64px; }
                .title { font-size: 32px; margin: 15px 0; color: #ffffff; }
                .challenge-info { background-color: #2a2a2a; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
                .user-results { background-color: #1a1a1a; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
                .result-item { margin-bottom: 10px; }
                .ranking { font-size: 24px; font-weight: bold; color: #4CAF50; }
                .footer { text-align: center; font-size: 14px; color: #888; margin-top: 30px; }
                .label { font-weight: bold; color: #ffffff; }
                .value { color: #d9dddc; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <a href="https://www.neuroguessr.org"><img src="cid:logo@neuroguessr" class="logo" alt="NeuroGuessr Logo"></a>
                    <h1 class="title"><a href="https://www.neuroguessr.org" style="color: #ffffff; text-decoration: none;">NeuroGuessr</a></h1>
                </div>

                <div class="challenge-info">
                    <h2>${backendI18n.t('email_challenge_results', { lng: lang })}</h2>
                    <p><span class="label">${backendI18n.t('email_challenge_name', { lng: lang })}:</span> <span class="value">${challenge.name || backendI18n.t('classic_challenge', { lng: lang })}</span></p>
                    <p><span class="label">${backendI18n.t('created_by', { lng: lang })}:</span> <span class="value">${challenge.creator_username}</span></p>
                    <p><span class="label">${backendI18n.t('email_start_date', { lng: lang })}:</span> <span class="value">${formatDate(challenge.start_date)}</span></p>
                    <p><span class="label">${backendI18n.t('email_end_date', { lng: lang })}:</span> <span class="value">${formatDate(challenge.end_date)}</span></p>
                </div>

                <div class="user-results">
                    <h3>${backendI18n.t('email_your_participation', { lng: lang })}</h3>
                    <div class="result-item">
                        <span class="label">${backendI18n.t('email_your_ranking', { lng: lang })}:</span>
                        <span class="ranking">
                            ${participant.ranking === 1 ? '🏆 ' : participant.ranking === 2 ? '🥈 ' : participant.ranking === 3 ? '🥉 ' : ''}
                            #${participant.ranking}
                        </span>
                    </div>
                    <div class="result-item">
                        <span class="label">${backendI18n.t('email_your_score', { lng: lang })}:</span> <span class="value">${participant.score}</span>
                    </div>
                    <div class="result-item">
                        <span class="label">${backendI18n.t('email_time_per_region', { lng: lang })}:</span> <span class="value">${Math.round(participant.avg_time_per_region / 100) / 10}s</span>
                    </div>
                    <div class="result-item">
                        <span class="label">${backendI18n.t('email_completed_at', { lng: lang })}:</span> <span class="value">${formatDate(participant.completion_date)}</span>
                    </div>
                </div>

                <div class="footer">
                    <p>${backendI18n.t('email_footer', { lng: lang })}</p>
                </div>
            </div>
        </body>
      `;

      try {
        await sendEmail(participant.email, subject, message);
        logger.info(`Challenge results email sent to ${participant.email} for challenge ${challengeId}`);
      } catch (emailError) {
        logger.error(`Failed to send challenge results email to ${participant.email}:`, emailError);
      }
    }

  } catch (error) {
    logger.error(`Error sending challenge results emails for challenge ${challengeId}:`, error);
  }
};
export const getClassicChallengeResults = async (req: Request, res: Response) => {
  try {
    const { challengeId } = req.params;

    // Try to get challenge details from multi_sessions first (for ongoing challenges)
    let challengeResult = await sql`
      SELECT 
        ms.id,
        ms.session_code,
        ms.name,
        ms.start_date,
        ms.end_date,
        u.username as creator_username
      FROM multi_sessions ms
      JOIN users u ON ms.creator_id = u.id
      WHERE ms.id = ${challengeId} AND ms.is_classic_challenge = true
    `;

    let sessionCode = null;

    // If not found in multi_sessions, try finished_sessions (for completed challenges where multi_sessions was deleted)
    if (!challengeResult.length) {
      challengeResult = await sql`
        SELECT 
          fs.classic_challenge_id as id,
          NULL as session_code,
          fs.name,
          fs.classic_challenge_start_date as start_date,
          fs.classic_challenge_end_date as end_date,
          'Unknown' as creator_username
        FROM finished_sessions fs
        WHERE fs.classic_challenge_id = ${challengeId}
        LIMIT 1
      `;
    } else {
      sessionCode = challengeResult[0].session_code;
    }

    if (!challengeResult.length) {
      return res.status(404).send({ message: "Challenge not found" });
    }

    const challenge = challengeResult[0];
    const now = new Date();
    const startDate = new Date(challenge.start_date);
    const endDate = new Date(challenge.end_date);

    // Determine challenge state
    let state: 'pending' | 'started' | 'finished';
    if (now < startDate) {
      state = 'pending';
    } else if (now > endDate) {
      state = 'finished';
    } else {
      state = 'started';
    }

    // Get participants (users who have finished sessions for this challenge)
    const participantsResult = await sql`
      SELECT
        fs.user_id,
        fs.score,
        fs.duration,
        fs.correct,
        fs.incorrect,
        fs.attempts,
        fs.avg_time_per_region,
        fs.created_at as completion_date,
        u.username,
        u.team_id,
        t.name as team_name,
        ROW_NUMBER() OVER (ORDER BY fs.score DESC, fs.avg_time_per_region ASC) as ranking
      FROM finished_sessions fs
      JOIN users u ON fs.user_id = u.id
      LEFT JOIN teams t ON u.team_id = t.id
      WHERE fs.classic_challenge_id = ${challengeId}
        AND u.publish_to_leaderboard = true
      ORDER BY fs.score DESC, fs.duration ASC
    `;

    res.status(200).send({
      challenge: {
        id: challenge.id,
        name: challenge.name,
        startDate: challenge.start_date,
        endDate: challenge.end_date,
        creator: challenge.creator_username
      },
      sessionCode,
      state,
      participants: participantsResult.map(p => ({
        userId: p.user_id,
        username: p.username,
        score: p.score,
        duration: p.duration,
        correct: p.correct,
        incorrect: p.incorrect,
        attempts: p.attempts,
        avgTimePerRegion: p.avg_time_per_region,
        completionDate: p.completion_date,
        ranking: p.ranking,
        teamId: p.team_id,
        teamName: p.team_name
      }))
    });

  } catch (error) {
    logger.error("Error getting challenge results:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};
export const checkIfClassicChallenge = async (req: Request, res: Response) => {
  try {
    const { sessionCode } = req.params;
    const sessions = await sql`
      SELECT id, is_classic_challenge FROM multi_sessions WHERE session_code = ${sessionCode} LIMIT 1
    ` as { id: number; is_classic_challenge: boolean | null; }[];
    if (!sessions.length) {
      return res.status(404).send({ isClassicChallenge: false });
    }
    const isClassic = sessions[0].is_classic_challenge === true ? true : false;
    res.status(200).send({ isClassicChallenge: isClassic, challengeId: isClassic ? sessions[0].id : null });
  } catch (error) {
    logger.error("Error checking if classic challenge:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};


import { Socket } from "socket.io";
import { logger } from "./logging.ts";
import { sql } from "./database_init.ts";
import { imageRef, imageMetadata, regionCenters, validRegions } from "./game.ts";
import { getDistance } from "./utils_compute.ts";
import { getIO } from "./socket.io.ts";
import jwt from "jsonwebtoken";
import { config } from "./multi.ts";

const MAX_POINTS_PER_REGION = 50;
const BONUS_POINTS_PER_SECOND = 1;
const MAX_DISTANCE_WITH_PENALTY = 50;
const MAX_POINTS_WITH_PENALTY = 30;
const BLIND_MODE_MULTIPLIER = 1.5;
const STREAK_BONUS_AFTER = 5;
const STREAK_BONUS = 5;
const MAX_STREAK_DISTANCE = 50;
const MAX_NUMBER_ERRORS_STREAK = 3;
const MAX_ATTEMPTS_BEFORE_HIGHLIGHT = 3;
const MAX_TIME_IN_SECONDS = 100;
const TOTAL_REGIONS_TIME_ATTACK = 18;

export interface SinglePlayerGameState {
  userId: number | null;
  atlas: string;
  mode: string;
  blindMode: boolean;
  currentRegionId?: number;
  score: number;
  streak: number;
  consecutiveErrors: number;
  attempts: number;
  totalAttempts: number,
  startTime: number;
  regionsAnswered: Set<number>;
  isActive: boolean;
  lastActivity: number;
  endTimer?: NodeJS.Timeout;
  askedId: number; // autoincremental ID for each asked region
  correctCount: number; // number of correct guesses
  incorrectCount: number; // number of incorrect guesses
  lastAsked: number; // timestamp of last sent command (start-game, next-region)
  regionSuccessDurations: number[]; // durations for successful regions
  regionFailedDurations: number[]; // durations for failed attempts
  sessionId: number | null; // id of the finished_sessions row created at game start
}

// In-memory storage for active single player games
export const activeSingleGames = new Map<string, SinglePlayerGameState>();

// Clean up inactive games (called periodically)
export function cleanupInactiveSingleGames() {
  const now = Date.now();
  const timeoutMs = 30 * 60 * 1000; // 30 minutes

  for (const [userId, gameState] of activeSingleGames.entries()) {
    if (now - gameState.lastActivity > timeoutMs) {
      // Clear any active timer before deleting
      if (gameState.endTimer) {
        clearTimeout(gameState.endTimer);
      }
      logger.info(`Cleaning up inactive single player game for user ${userId}`);
      activeSingleGames.delete(userId);
    }
  }
}

// Start a single player game
export async function startSingleGame(socket: Socket, data: {
  atlas: string;
  mode: string;
  blindMode: boolean;
  authToken?: string;
}) {
  try {
    const { atlas, mode, blindMode, authToken } = data;

    // Get user ID (authenticated or anonymous)
    let userId: number | null = null;
    try {
      if(authToken){
        const decoded = jwt.verify(authToken, config.jwt_secret || 'fallback-secret') as any;
        userId = decoded.id;
      }
    } catch (err) {
      socket.emit('single-game-error', { message: 'Invalid authentication token' });
      return;
    }

    // Validate atlas exists
    if (!validRegions[atlas]) {
      socket.emit('single-game-error', { message: 'Invalid atlas selected' });
      return;
    }

    // Clean up any existing game for this user
    if (activeSingleGames.has(socket.id)) {
      await endSingleGame(socket.id, 'abandoned');
    }

    // Create a preliminary finished_sessions row so we have an id to link individual_clicks
    let sessionId: number | null = null;
    if (userId !== null) {
      try {
        const sessionRow = await sql`
          INSERT INTO finished_sessions (user_id, mode, atlas, blind_mode, score, attempts, correct, incorrect, duration, quit_reason)
          VALUES (${userId}, ${mode}, ${atlas}, ${blindMode}, 0, 0, 0, 0, 0, 'in_progress')
          RETURNING id
        `;
        sessionId = sessionRow[0].id;
      } catch (err) {
        logger.error('Error creating preliminary finished_sessions row:', err);
      }
    }

    // Initialize game state
    const gameState: SinglePlayerGameState = {
      userId,
      atlas,
      mode,
      blindMode,
      score: 0,
      streak: 0,
      consecutiveErrors: 0,
      attempts: 0,
      totalAttempts: 0,
      startTime: Date.now(),
      regionsAnswered: new Set(),
      isActive: true,
      lastActivity: Date.now(),
      askedId: 0,
      correctCount: 0,
      incorrectCount: 0,
      lastAsked: Date.now(), // Set when game starts
      regionSuccessDurations: [],
      regionFailedDurations: [],
      sessionId
    };

    // Set up automatic end timer for time-attack mode
    if (mode === "time-attack") {
      const endTime = gameState.startTime + (MAX_TIME_IN_SECONDS * 1000);
      gameState.endTimer = setTimeout(async () => {
        const currentGameState = activeSingleGames.get(socket.id);
        if (currentGameState && currentGameState.isActive) {
          await endSingleGame(socket.id, 'timeout');
          socket.emit('single-game-ended', {
            reason: 'timeout',
            finalScore: currentGameState.score,
            elapsedTime: MAX_TIME_IN_SECONDS,
            attempts: currentGameState.totalAttempts,
            correct: currentGameState.correctCount,
            incorrect: currentGameState.incorrectCount,
            remainingTime: 0
          });
        }
      }, MAX_TIME_IN_SECONDS * 1000);
    }

    activeSingleGames.set(socket.id, gameState);

    logger.info('Single player game started', {
      userId,
      atlas,
      mode,
      blindMode,
      socketId: socket.id
    });

    // Prepare response data
    const responseData: any = {
      message: 'Game started successfully',
      gameState: {
        atlas: gameState.atlas,
        mode: gameState.mode,
        blindMode: gameState.blindMode,
        score: gameState.score,
        streak: gameState.streak
      }
    };

    // Add endDate and maxScore for time-attack mode
    if (mode === "time-attack") {
      responseData.gameState.endDate = new Date(gameState.startTime + (MAX_TIME_IN_SECONDS * 1000));
      // Calculate theoretical maximum score: all correct guesses plus maximum time bonus at end
      const baseScore = TOTAL_REGIONS_TIME_ATTACK * MAX_POINTS_PER_REGION;
      const timeBonus = MAX_TIME_IN_SECONDS * BONUS_POINTS_PER_SECOND;
      const blindMultiplier = blindMode ? BLIND_MODE_MULTIPLIER : 1;
      const maxScore = (baseScore + timeBonus) * blindMultiplier;
      responseData.gameState.maxScore = maxScore;
    }

    socket.emit('single-game-started', responseData);

    if(mode !== "navigation"){
      getNextSingleRegion(socket, { authToken });
    }
  } catch (error) {
    logger.error('Error starting single player game:', error);
    socket.emit('single-game-error', { message: 'Failed to start game' });
  }
}

// Get next region for single player game
export async function getNextSingleRegion(socket: Socket, data: { authToken?: string }) {
  try {
    const { authToken } = data;

    // Get user ID (authenticated or anonymous)
    let userId: number | null = null;
    try {
      if(authToken){
        const decoded = jwt.verify(authToken, config.jwt_secret || 'fallback-secret') as any;
        userId = decoded.id;
      }
    } catch (err) {
      socket.emit('single-game-error', { message: 'Invalid authentication token' });
      return;
    }
    const gameState = activeSingleGames.get(socket.id);

    if (!gameState || !gameState.isActive) {
      socket.emit('single-game-error', { message: 'No active game found' });
      return;
    }

    gameState.lastActivity = Date.now();

    // Check if time is up for time-attack mode
    if (gameState.mode === "time-attack") {
      const elapsedTime = (Date.now() - gameState.startTime) / 1000;
      if (elapsedTime >= MAX_TIME_IN_SECONDS) {
        await endSingleGame(socket.id, 'timeout');
        socket.emit('single-game-ended', {
          reason: 'timeout',
          finalScore: gameState.score,
          attempts: gameState.totalAttempts,
          correct: gameState.correctCount,
          incorrect: gameState.incorrectCount,
          elapsedTime
        });
        return;
      }
    }

    // Select next region
    let randomRegionId: number | null = null;
    const atlasValidRegions = validRegions[gameState.atlas];

    if (gameState.mode === "time-attack") {
      // In time-attack, allow repeats but prefer unused regions
      const availableRegions = atlasValidRegions.filter(id => !gameState.regionsAnswered.has(id));
      if (availableRegions.length > 0) {
        randomRegionId = availableRegions[Math.floor(Math.random() * availableRegions.length)];
      } else {
        // All regions used, allow repeats
        randomRegionId = atlasValidRegions[Math.floor(Math.random() * atlasValidRegions.length)];
      }
    } else {
      // For other modes, ensure no repeats
      const availableRegions = atlasValidRegions.filter(id => !gameState.regionsAnswered.has(id));
      if (availableRegions.length === 0) {
        // Game finished
        await endSingleGame(socket.id, 'completed');
        const elapsedTime = (Date.now() - gameState.startTime) / 1000;
        socket.emit('single-game-ended', {
          reason: 'completed',
          finalScore: gameState.score,
          attempts: gameState.totalAttempts,
          correct: gameState.correctCount,
          incorrect: gameState.incorrectCount,
          regionsAnswered: gameState.regionsAnswered.size,
          elapsedTime
        });
        return;
      }
      randomRegionId = availableRegions[Math.floor(Math.random() * availableRegions.length)];
    }

    if (randomRegionId !== null) {
      gameState.currentRegionId = randomRegionId;
      gameState.attempts = 0; // Reset attempts for new region

      // Update lastAsked timestamp for the sent command
      gameState.lastAsked = Date.now();

      const nextRegionData: any = {
        regionId: randomRegionId,
        attempts: gameState.attempts,
        askedId: gameState.askedId + 1,
        totalNumRegions: TOTAL_REGIONS_TIME_ATTACK
      };

      socket.emit('next-region', nextRegionData);

      // Increment askedId for time-attack mode
      gameState.askedId++;

      logger.info('Next region selected for single player', {
        userId,
        regionId: randomRegionId,
        mode: gameState.mode,
        askedId: gameState.askedId
      });
    }

  } catch (error) {
    logger.error('Error getting next single player region:', error);
    socket.emit('single-game-error', { message: 'Failed to get next region' });
  }
}

// Validate guess for single player game
export async function validateSingleGuess(socket: Socket, data: {
  authToken?: string;
  coordinates: { mm: number[]; vox: number[] };
  pastRegionId?: number;
}) {
  try {
    const { authToken, coordinates, pastRegionId } = data;

    // Get user ID (authenticated or anonymous)
    let userId: number | null = null;
    try {
      if(authToken){
        const decoded = jwt.verify(authToken, config.jwt_secret || 'fallback-secret') as any;
        userId = decoded.id;
      }
    } catch (err) {
      socket.emit('single-game-error', { message: 'Invalid authentication token' });
      return;
    }
    const gameState = activeSingleGames.get(socket.id);

    if (!gameState || !gameState.isActive) {
      socket.emit('single-game-error', { message: 'No active game' });
      return;
    }
    if (!gameState.currentRegionId && gameState.mode !== "navigation") {
      socket.emit('single-game-error', { message: 'No active region' });
      return;
    }

    gameState.attempts++;
    gameState.totalAttempts++;

    const regionId = gameState.currentRegionId;
    const [x, y, z] = coordinates.vox;

    if(regionId){
      // Validate coordinates are within bounds
      const atlasMetadata = imageMetadata[gameState.atlas];
      if (x < 0 || x >= atlasMetadata.nx || y < 0 || y >= atlasMetadata.ny || z < 0 || z >= atlasMetadata.nz) {
        socket.emit('guess-result', {
          isCorrect: false,
          scoreIncrement: 0,
          message: 'Coordinates out of bounds'
        });
        return;
      }
    }

    // Get voxel value at clicked position
    const voxelValue = imageRef[gameState.atlas].getValue(x, y, z);
    let isCorrect = voxelValue === regionId;

    let scoreIncrement = 0;
    let streakBonus = 0;
    let newStreak = gameState.streak;
    let newConsecutiveErrors = gameState.consecutiveErrors;
    let streakTooFar = false;
    let minDistance = Infinity;
    let nearestCenter: number[] | undefined = undefined;
    let nearestBoundary: number[] | undefined = undefined;
    let elapsedTime: number = 0;
    let remainingTime: number = 0;

    // Calculate distance and score
    let distanceResult: { distance: number; center: number[] | undefined; boundary: number[] | undefined } | null = null;

    if (regionId && regionCenters[gameState.atlas] && regionCenters[gameState.atlas][regionId]) {
      const centers = regionCenters[gameState.atlas][regionId];
      distanceResult = getDistance(centers, coordinates, gameState.atlas, regionId);
      minDistance = distanceResult.distance;
      nearestCenter = distanceResult.center;
      nearestBoundary = distanceResult.boundary;
    }

    if (gameState.mode === "streak") {
      // Streak mode logic
      if (isCorrect) {
        newStreak++;
        newConsecutiveErrors = 0;
        scoreIncrement = MAX_POINTS_PER_REGION;
        if (newStreak >= STREAK_BONUS_AFTER) {
            streakBonus = STREAK_BONUS;
            scoreIncrement += streakBonus;
        }
      } else {
        if (minDistance <= MAX_STREAK_DISTANCE) {
            newStreak = 0;
            newConsecutiveErrors++;
            scoreIncrement = 0;
        } else {
            streakTooFar = true;
        }
      }

    } else if (gameState.mode === "time-attack") {
      // Time-attack mode logic
      elapsedTime = (Date.now() - gameState.startTime) / 1000;
      remainingTime = Math.max(0, MAX_TIME_IN_SECONDS - elapsedTime);

      if (isCorrect) {
        scoreIncrement = MAX_POINTS_PER_REGION;
        newStreak++;
        newConsecutiveErrors = 0;
      } else {
        scoreIncrement = MAX_POINTS_WITH_PENALTY*Math.max(0, MAX_DISTANCE_WITH_PENALTY - Math.floor(minDistance))/MAX_DISTANCE_WITH_PENALTY;
        newStreak = 0;
        newConsecutiveErrors++;
      }
    } else if (gameState.mode === "practice") {
      // Practice mode logic
      if (isCorrect) {
        scoreIncrement = MAX_POINTS_PER_REGION;
        newStreak++;
        newConsecutiveErrors = 0;
      } else {
        scoreIncrement = MAX_POINTS_WITH_PENALTY*Math.max(0, MAX_DISTANCE_WITH_PENALTY - Math.floor(minDistance))/MAX_DISTANCE_WITH_PENALTY;
        newStreak = 0;
        newConsecutiveErrors++;
      }
    } else { // Navigation mode logic
        isCorrect = true;
        newConsecutiveErrors = 0;
        newStreak = 0;
    }

    // Apply blind mode multiplier
    if (gameState.blindMode) {
      scoreIncrement = Math.floor(scoreIncrement * BLIND_MODE_MULTIPLIER);
    }

    // Update game state
    gameState.score += scoreIncrement;
    gameState.streak = newStreak;
    gameState.consecutiveErrors = newConsecutiveErrors;

    // Track correct/incorrect counts and durations
    const currentTime = Date.now();
    const duration = currentTime - gameState.lastAsked;
    if (isCorrect) {
      gameState.correctCount++;
      // Calculate duration from lastAsked (when region was presented) to now
      gameState.regionSuccessDurations.push(duration);
    } else {
      gameState.incorrectCount++;
      // Calculate duration from lastActivity to now for failed attempts
      gameState.regionFailedDurations.push(duration);
    }

    gameState.lastActivity = Date.now();

    // Highlight region in practice mode after max failed attempts
    if (gameState.mode === "practice" && !isCorrect && gameState.consecutiveErrors >= MAX_ATTEMPTS_BEFORE_HIGHLIGHT) {
      socket.emit('region-highlight', {
        regionId: regionId,
        reason: 'max-failed-attempts'
      });
    }

    await sql`
      INSERT INTO individual_clicks (
        is_authenticated,
        user_id,
        singleplayer_session_id,
        singleplayer_mode,
        command_index,
        atlas,
        blind_mode,
        region_id,
        clicked_x,
        clicked_y,
        clicked_z,
        clicked_x_mm,
        clicked_y_mm,
        clicked_z_mm,
        nearest_center_x_mm,
        nearest_center_y_mm,
        nearest_center_z_mm,
        boundary_point_x_mm,
        boundary_point_y_mm,
        boundary_point_z_mm,
        distance_to_target,
        time_taken,
        is_correct,
        score_increment,
        attempts,
        has_clicked
      ) VALUES (
        ${gameState.userId !== null},
        ${gameState.userId},
        ${gameState.sessionId},
        ${gameState.mode},
        ${gameState.askedId},
        ${gameState.atlas},
        ${gameState.blindMode},
        ${regionId || null},
        ${x},
        ${y},
        ${z},
        ${coordinates.mm[0] ?? null},
        ${coordinates.mm[1] ?? null},
        ${coordinates.mm[2] ?? null},
        ${nearestCenter ? nearestCenter[0] : null},
        ${nearestCenter ? nearestCenter[1] : null},
        ${nearestCenter ? nearestCenter[2] : null},
        ${nearestBoundary ? nearestBoundary[0] : null},
        ${nearestBoundary ? nearestBoundary[1] : null},
        ${nearestBoundary ? nearestBoundary[2] : null},
        ${minDistance === Infinity ? null : minDistance},
        ${duration},
        ${isCorrect},
        ${Math.round(scoreIncrement)},
        ${gameState.attempts},
        ${true}
      )
    `;

    if (isCorrect && regionId) {
      gameState.regionsAnswered.add(regionId);
    }

    socket.emit('guess-result', {
      isCorrect,
      scoreIncrement,
      totalScore: gameState.score,
      streak: gameState.streak,
      distance: minDistance,
      attempts: gameState.attempts,
      regionCompleted: isCorrect,
      consecutiveErrors: gameState.consecutiveErrors,
      maxErrorsStreak: MAX_NUMBER_ERRORS_STREAK,
      pastRegionId,
      regionCenter: nearestCenter,
      regionBoundary: nearestBoundary,
      clickedPosition: coordinates
    });

    logger.info('Single player guess validated', {
      userId,
      regionId,
      isCorrect,
      scoreIncrement,
      totalScore: gameState.score,
      streak: gameState.streak
    });

    if (gameState.mode === "streak") {
        // Check if game should end due to max consecutive errors
        if (newConsecutiveErrors >= MAX_NUMBER_ERRORS_STREAK) {
            // End the game
            await endSingleGame(socket.id, 'max-consecutive-errors');
            socket.emit('single-game-ended', {
              reason: 'max-consecutive-errors',
              finalScore: gameState.score,
              attempts: gameState.totalAttempts,
              correct: gameState.correctCount,
              incorrect: gameState.incorrectCount,
              lastDistance: minDistance,
              consecutiveErrors: newConsecutiveErrors
            });
            return;
        } else if (streakTooFar) {
            // end the game
            await endSingleGame(socket.id, 'exceeded-max-distance');
            socket.emit('single-game-ended', {
                reason: 'exceeded-max-distance',
                finalScore: gameState.score,
                attempts: gameState.totalAttempts,
                correct: gameState.correctCount,
                incorrect: gameState.incorrectCount,
                lastDistance: minDistance,
                consecutiveErrors: newConsecutiveErrors
            });
            return;
        }
        getNextSingleRegion(socket, { authToken });
    }
    if (gameState.mode === "practice") {
      // Practice mode logic
      if (isCorrect) {
        getNextSingleRegion(socket, { authToken });
      }
    }
    if (gameState.mode === "time-attack") {
      if(gameState.askedId >= TOTAL_REGIONS_TIME_ATTACK){
          // Add time bonus for remaining seconds
          gameState.score += Math.max(0, remainingTime) * BONUS_POINTS_PER_SECOND;
          await endSingleGame(socket.id, 'guessed-all-regions');
          socket.emit('single-game-ended', {
            reason: 'guessed-all-regions',
            finalScore: gameState.score,
            attempts: gameState.totalAttempts,
            correct: gameState.correctCount,
            incorrect: gameState.incorrectCount,
            lastDistance: minDistance,
            consecutiveErrors: newConsecutiveErrors,
            elapsedTime,
            remainingTime
          });
          return;
      } else {
        getNextSingleRegion(socket, { authToken });
      }
    }
  } catch (error) {
    logger.error('Error validating single player guess:', error);
    socket.emit('single-game-error', { message: 'Failed to validate guess' });
  }
}

// End single player game
export async function endSingleGame(socketId: string, reason: string = 'completed') {
  const gameState = activeSingleGames.get(socketId);
  if (!gameState) return;

  // Clear any active timer
  if (gameState.endTimer) {
    clearTimeout(gameState.endTimer);
    gameState.endTimer = undefined;
  }

  try {
    const elapsedTime = Date.now() - gameState.startTime;

    // Calculate timing statistics from duration arrays
    let minTimePerRegion: number | null = null;
    let maxTimePerRegion: number | null = null;
    let avgTimePerRegion: number | null = null;
    let minTimePerCorrectRegion: number | null = null;
    let maxTimePerCorrectRegion: number | null = null;
    let avgTimePerCorrectRegion: number | null = null;

    // Combine success and failed durations for overall region timing stats
    const allRegionDurations = [...gameState.regionSuccessDurations, ...gameState.regionFailedDurations];
    
    if (allRegionDurations.length > 0) {
      minTimePerRegion = Math.round(Math.min(...allRegionDurations));
      maxTimePerRegion = Math.round(Math.max(...allRegionDurations));
      avgTimePerRegion = Math.round(allRegionDurations.reduce((a, b) => a + b, 0) / allRegionDurations.length);
    }

    if (gameState.regionSuccessDurations.length > 0) {
      minTimePerCorrectRegion = Math.round(Math.min(...gameState.regionSuccessDurations));
      maxTimePerCorrectRegion = Math.round(Math.max(...gameState.regionSuccessDurations));
      avgTimePerCorrectRegion = Math.round(gameState.regionSuccessDurations.reduce((a, b) => a + b, 0) / gameState.regionSuccessDurations.length);
    }

    // Save to database for both authenticated and anonymous users
    // Calculate theoretical maximum score for time-attack mode
    let theoreticalMaxScore: number | null = null;
    if (gameState.mode === "time-attack") {
      const baseScore = TOTAL_REGIONS_TIME_ATTACK * MAX_POINTS_PER_REGION;
      const timeBonus = MAX_TIME_IN_SECONDS * BONUS_POINTS_PER_SECOND;
      const blindMultiplier = gameState.blindMode ? BLIND_MODE_MULTIPLIER : 1;
      theoreticalMaxScore = (baseScore + timeBonus) * blindMultiplier;
    }

    // Calculate score percentage for time-attack mode
    let scorePercentage: number | null = null;
    if (theoreticalMaxScore !== null && theoreticalMaxScore > 0) {
      scorePercentage = Math.round((gameState.score / theoreticalMaxScore) * 10000) / 100;
    }

    if (gameState.sessionId !== null) {
      // Update the preliminary row created at game start
      await sql`
        UPDATE finished_sessions SET
          score = ${Math.round(gameState.score)},
          attempts = ${gameState.totalAttempts},
          correct = ${gameState.correctCount},
          incorrect = ${gameState.incorrectCount},
          min_time_per_region = ${minTimePerRegion},
          max_time_per_region = ${maxTimePerRegion},
          avg_time_per_region = ${avgTimePerRegion},
          min_time_per_correct_region = ${minTimePerCorrectRegion},
          max_time_per_correct_region = ${maxTimePerCorrectRegion},
          avg_time_per_correct_region = ${avgTimePerCorrectRegion},
          quit_reason = ${reason},
          duration = ${elapsedTime},
          theoretical_maximum_score = ${theoreticalMaxScore},
          score_percentage = ${scorePercentage}
        WHERE id = ${gameState.sessionId}
      `;
    } else {
      // Fallback for unauthenticated users (no sessionId)
      await sql`
        INSERT INTO finished_sessions (
          user_id, mode, atlas, blind_mode, score, attempts, correct, incorrect,
          min_time_per_region, max_time_per_region, avg_time_per_region,
          min_time_per_correct_region, max_time_per_correct_region, avg_time_per_correct_region,
          quit_reason, duration, theoretical_maximum_score, score_percentage
        ) VALUES (
          ${gameState.userId}, ${gameState.mode}, ${gameState.atlas},
          ${gameState.blindMode}, ${Math.round(gameState.score)}, ${gameState.totalAttempts}, ${gameState.correctCount}, ${gameState.incorrectCount},
          ${minTimePerRegion}, ${maxTimePerRegion}, ${avgTimePerRegion},
          ${minTimePerCorrectRegion}, ${maxTimePerCorrectRegion}, ${avgTimePerCorrectRegion},
          ${reason}, ${elapsedTime}, ${theoreticalMaxScore}, ${scorePercentage}
        )
      `;
    }

    logger.info('Single player game ended and saved', {
      userId: gameState.userId,
      reason,
      finalScore: gameState.score,
      attempts: gameState.totalAttempts,
      correct: gameState.correctCount,
      incorrect: gameState.incorrectCount,
      timingStats: {
        minTimePerRegion,
        maxTimePerRegion,
        avgTimePerRegion,
        minTimePerCorrectRegion,
        successDurationsCount: gameState.regionSuccessDurations.length,
        failedDurationsCount: gameState.regionFailedDurations.length
      },
      elapsedTime: `${elapsedTime}ms`,
      theoreticalMaxScore,
      scorePercentage
    });

  } catch (error) {
    logger.error('Error saving single player game result:', error);
  } finally {
    // Clean up game state
    activeSingleGames.delete(socketId);
  }
}

// Handle socket disconnection for single player
export async function handleSinglePlayerDisconnect(socket: Socket) {
  const gameState = activeSingleGames.get(socket.id);
  if (gameState) {
    // End the game with 'disconnected' reason
    await endSingleGame(socket.id, 'disconnected');
  }
  logger.info('Single player socket disconnected', { socketId: socket.id });
}

// Handle client-initiated game end
export async function handleEndSingleGame(socket: Socket, data: { authToken?: string }) {
  try {
    // Get user ID (authenticated or anonymous)
    let userId: number | null = null;
    try {
      if(data.authToken){
        const decoded = jwt.verify(data.authToken, config.jwt_secret) as any;
        userId = decoded.id;
      }
    } catch (err) {
      // Ignore auth errors for game ending
    }

    const gameState = activeSingleGames.get(socket.id);
    if (gameState) {
      // End the game with 'abandoned' reason
      await endSingleGame(socket.id, 'abandoned');
      logger.info('Single player game ended by client', { socketId: socket.id, userId });
    }
  } catch (error) {
    logger.error('Error ending single player game:', error);
  }
}

// Initialize single player socket handlers
export function initSinglePlayerSockets() {
  const io = getIO();

  io.on('connection', (socket) => {
    // Single player game events
    socket.on('start-single-game', (data) => startSingleGame(socket, data));
    socket.on('get-next-single-region', (data) => getNextSingleRegion(socket, data));
    socket.on('validate-single-guess', (data) => validateSingleGuess(socket, data));
    socket.on('end-single-game', (data) => handleEndSingleGame(socket, data));

    // Handle disconnection
    socket.on('disconnect', () => {
      handleSinglePlayerDisconnect(socket);
    });
  });

  // Set up periodic cleanup
  setInterval(cleanupInactiveSingleGames, 5 * 60 * 1000); // Every 5 minutes
}
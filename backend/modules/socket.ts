import { ChangeSessionCodeData, JoinLobbyData, MultiplayerParametersType, Recurrence } from "interfaces/multi.interfaces.ts";
import jwt from "jsonwebtoken";
import { sql } from "./database_init.ts";
import { logger } from "./logging.ts";
import { socketInfo, config, games, handleValidateGuess, 
  handleUpdateParameters, handleLaunchGame, broadcastToSession, 
  socketClients, playerInfo, multiJoinLobby, multiLeaveLobby, handleChatMessage } from "./multi.ts";
import { handleSaveAsRealtimeChallenge } from "./multi_challenge.ts";
import { canJoinClassicChallengeSocket, deactivateClassicChallenge, 
  getActiveClassicChallengesRaw, getAllClassicChallengesRaw, 
  getClassicChallengeLeaderboard, getClassicChallengesByIdRaw, 
  handleCreateClassicChallenge } from "./multi_classic_challenge.ts";
import { handleDestroySession } from "./multi_cleanup.ts";
import { buildPublicLobbies } from "./multi_public.ts";
import { getIO } from "./socket.io.ts";


// Atomic game update locks to prevent race conditions
const gameStateLocks = new Map<string, boolean>();
/**
 * Executes a game state update atomically to prevent race conditions
 * @param sessionCode - The session code to lock
 * @param updateFn - The function to execute atomically
 * @param timeoutMs - Optional timeout in milliseconds (default: 5000)
 * @returns Promise<T> - The result of the update function
 */
export async function atomicGameUpdate<T>(
  sessionCode: string,
  updateFn: () => Promise<T> | T,
  timeoutMs: number = 5000): Promise<T | null> {
  const lockKey = `game:${sessionCode}`;

  // Check if already locked
  if (gameStateLocks.get(lockKey)) {
    logger.warn(`Game ${sessionCode}: Operation blocked due to concurrent access`);
    return null;
  }

  // Acquire lock
  gameStateLocks.set(lockKey, true);

  try {
    // Set timeout to prevent deadlocks
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Atomic update timeout for game ${sessionCode}`)), timeoutMs);
    });

    const updatePromise = Promise.resolve(updateFn());

    // Race between update and timeout
    const result = await Promise.race([updatePromise, timeoutPromise]);
    return result;
  } catch (error) {
    logger.error(`Atomic update failed for game ${sessionCode}:`, error);
    throw error;
  } finally {
    // Always release lock
    gameStateLocks.delete(lockKey);
  }
}
/**
 * Checks if a game session is currently locked
 * @param sessionCode - The session code to check
 * @returns boolean - True if locked, false otherwise
 */
function isGameLocked(sessionCode: string): boolean {
  return gameStateLocks.has(`game:${sessionCode}`);
}
/**
 * Forces release of a game lock (use with caution)
 * @param sessionCode - The session code to unlock
 */

export function forceUnlockGame(sessionCode: string): void {
  const lockKey = `game:${sessionCode}`;
  if (gameStateLocks.has(lockKey)) {
    gameStateLocks.delete(lockKey);
    logger.warn(`Forced unlock for game ${sessionCode}`);
  }
}
// Helper to check if a session code is reserved (0000, 1111, 2222, etc.)
export function isReservedSessionCode(code: string): boolean {
  if (code.length !== 8) return false;

  // Check if all digits are the same (0000, 1111, 2222, etc.)
  const firstDigit = code[0];
  return code.split('').every(digit => digit === firstDigit);
}
// Helper to generate a unique 8-digit code
export function generateCode(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}// Initialize Socket.io handling


export function initSocketHandlers() {
  const io = getIO();

  io.on('connection', (socket) => {
    const clientIP = socket.handshake.address || 'unknown';

    logger.info('Socket connection established', {
      socketId: socket.id,
      clientIP,
      timestamp: new Date().toISOString()
    });

    // Handle join lobby
    socket.on('join-lobby', async (data: JoinLobbyData) => {
        multiJoinLobby(socket, data);
    });

    // Handle validate guess
    socket.on('validate-guess', async (data: {
      sessionCode: string;
      userName: string;
      voxelProp: any;
      anonToken?: string;
      userToken?: string;
      pastRegionId?: number;
    }) => {
      try {
        const info = socketInfo[socket.id];
        if (!info) {
          socket.emit('error', { message: "Not authenticated" });
          return;
        }
        await handleValidateGuess({ ...data, userName: info.userName });
      } catch (error) {
        logger.error("Validate guess error:", error);
        socket.emit('error', { message: "Error validating guess" });
      }
    });

    // Handle update parameters
    socket.on('update-parameters', async (data: {
      sessionCode: string;
      sessionToken: string;
      parameters: Partial<MultiplayerParametersType>;
    }) => {
      try {
        const info = socketInfo[socket.id];
        if (!info) {
          socket.emit('error', { message: "Not authenticated" });
          return;
        }
        const result = await handleUpdateParameters({ ...data, userName: info.userName });
        socket.emit('parameters-has-updated', result);
      } catch (error) {
        logger.error("Update parameters error:", error);
        socket.emit('error', { message: "Error updating parameters" });
      }
    });

    // Handle launch game
    socket.on('launch-game', async (data: {
      sessionCode: string;
      sessionToken: string;
      userToken: string;
    }) => {
      try {
        const info = socketInfo[socket.id];
        if (!info) {
          socket.emit('error', { message: "Not authenticated" });
          return;
        }
        const result = await handleLaunchGame({ ...data, userName: info.userName });
        socket.emit('game-launched', result);
      } catch (error) {
        logger.error("Launch game error:", error);
        socket.emit('error', { message: "Error launching game" });
      }
    });

    // Handle save as realtime challenge
    socket.on('save-as-realtime-challenge', async (data: {
      sessionCode: string;
      sessionToken: string;
      userToken: string;
      name?: string;
      recurrent?: Recurrence;
    }) => {
      try {
        const info = socketInfo[socket.id];
        if (!info) {
          socket.emit('error', { message: "Not authenticated" });
          return;
        }
        await handleSaveAsRealtimeChallenge({ ...data, userName: info.userName });
      } catch (error) {
        logger.error("Save as realtime challenge error:", error);
        socket.emit('error', { message: "Error saving realtime challenge" });
      }
    });

    // Handle admin change session code
    socket.on('change-session-code', async (data: ChangeSessionCodeData) => {
       changeSessionCode(socket, data);
    });

    // Handle create classic challenge (admin only)
    socket.on('create-classic-challenge', async (data: {
      sessionCode: string;
      sessionToken: string;
      name: string;
      start_date: Date;
      end_date: Date;
      public: boolean;
      userToken: string;
    }) => {
      try {
        const result = await handleCreateClassicChallenge(socket, data);
        socket.emit('classic-challenge-created', result);
      } catch (error) {
        logger.error("Create classic challenge error:", error);
        socket.emit('error', { message: error });
      }
    });

    // Handle get active classic challenges
    socket.on('get-active-classic-challenges', async () => {
      try {
        const result = await getActiveClassicChallengesRaw();
        socket.emit('active-classic-challenges', { challenges: result });
      } catch (error) {
        logger.error("Get active classic challenges error:", error);
        socket.emit('error', { message: "Error getting active classic challenges" });
      }
    });

    // Handle get all classic challenges (admin only)
    socket.on('get-all-classic-challenges', async (data: { userToken: string; }) => {
      try {
        const { userToken } = data;

        // Verify admin privileges
        if (!userToken) {
          socket.emit('error', { message: "Authentication token required" });
          return;
        }

        try {
          const jwtPayload: any = jwt.verify(userToken, config.jwt_secret);
          if (!jwtPayload || !jwtPayload.admin) {
            socket.emit('error', { message: "Admin privileges required" });
            return;
          }

          const result = await getAllClassicChallengesRaw();
          socket.emit('all-classic-challenges', { challenges: result });

        } catch (jwtError) {
          socket.emit('error', { message: "Invalid authentication token" });
          return;
        }

      } catch (error) {
        logger.error("Get all classic challenges error:", error);
        socket.emit('error', { message: "Error getting all classic challenges" });
      }
    });

    // Handle get classic challenge by ID
    socket.on('get-classic-challenge', async (data: { challengeId: number; }) => {
      try {
        const result = await getClassicChallengesByIdRaw(data.challengeId);
        if (result.length === 0) {
          socket.emit('error', { message: "Challenge not found" });
          return;
        }
        socket.emit('classic-challenge-details', { challenge: result[0] });
      } catch (error) {
        logger.error("Get classic challenge error:", error);
        socket.emit('error', { message: "Error getting classic challenge" });
      }
    });

    // Handle check if user can join classic challenge
    socket.on('can-join-classic-challenge', async (data: {
      challengeId: number;
      userToken?: string;
      anonToken?: string;
    }) => {
      try {
        const result = await canJoinClassicChallengeSocket(data);
        socket.emit('can-join-result', result);
      } catch (error) {
        logger.error("Can join classic challenge error:", error);
        socket.emit('error', { message: error });
      }
    });

    // Handle deactivate classic challenge (admin only)
    socket.on('deactivate-classic-challenge', async (data: {
      challengeId: number;
      userToken: string;
    }) => {
        try {
            await deactivateClassicChallenge(socket, data);
        } catch (error) {
            logger.error("Deactivate classic challenge error:", error);
            socket.emit('error', { message: error });
        }
    });

    // Handle get classic challenge leaderboard
    socket.on('get-classic-challenge-leaderboard', async (data: {
      challengeId: number;
      limit?: number;
    }) => {
      try {
        const result = await getClassicChallengeLeaderboard(data.challengeId, data.limit || 50);
        socket.emit('classic-challenge-leaderboard', { leaderboard: result });
      } catch (error) {
        logger.error("Get classic challenge leaderboard error:", error);
        socket.emit('error', { message: "Error getting classic challenge leaderboard" });
      }
    });

    // Handle destroy session (creator leaving config screen)
    socket.on('destroy-session', async (data: {
      sessionCode: string;
      sessionToken: string;
      userToken: string;
    }) => {
      try {
        const { sessionCode, sessionToken, userToken } = data;
        const result = await handleDestroySession({ sessionCode, sessionToken, userToken });
        if (result.status != 200) {
          socket.emit('error', { message: result.message });
          return;
        }
      } catch (error) {
        logger.error("Destroy session error:", error);
        socket.emit('error', { message: "Error destroying session" });
      }
    });

    // Handle explicit leave-lobby (when user navigates away from multiplayer page)
    socket.on('leave-lobby', async (data: {
      sessionCode: string;
      userName: string;
      anonToken?: string;
      userToken?: string;
    }) => {
      try {
        await multiLeaveLobby(socket, data.userName);
      } catch (error) {
        logger.error("Leave lobby error:", error);
      }
    });

    // Subscribe to public lobbies updates
    socket.on('connect-public', async () => {
      try {
        socket.join('public-lobbies');
        const lobbies = await buildPublicLobbies();
        socket.emit('public-lobbies-update', { lobbies });
      } catch (e) {
        // no-op
      }
    });

    // Handle chat message
    socket.on('send-chat-message', async (data: {
      sessionCode: string;
      userToken: string;
      message: string;
    }) => {
      try {
        await handleChatMessage(data);
      } catch (error) {
        logger.error('Send chat message error:', error);
      }
    });
  });
}

const changeSessionCode = async (socket: any, data: ChangeSessionCodeData) => {
    try {
        const { currentSessionCode, newSessionCode, sessionToken, userToken } = data;

        // Verify admin privileges
        if (!userToken) {
            socket.emit('error', { message: "Authentication token required" });
            return;
        }

        try {
            const jwtPayload: any = jwt.verify(userToken, config.jwt_secret);
            if (!jwtPayload || !jwtPayload.admin) {
            socket.emit('error', { message: "Admin privileges required" });
            return;
            }

            // Validate new session code format (8 digits)
            if (!newSessionCode || newSessionCode.length !== 8 || !/^\d{8}$/.test(newSessionCode)) {
            socket.emit('error', { message: "Invalid session code format. Must be 8 digits." });
            return;
            }

            // Check if new session code is already in use
            const existingSession = await sql`
            SELECT COUNT(*) as count 
            FROM multi_sessions 
            WHERE session_code = ${newSessionCode}
            `;

            if (existingSession[0]?.count > 0) {
            socket.emit('error', { message: "Session code already in use" });
            return;
            }

            // Verify current session exists and user has access
            const currentSession = await sql`
            SELECT id, creator_id 
            FROM multi_sessions 
            WHERE session_code = ${currentSessionCode} AND session_token = ${sessionToken}
            ` as { id: number; creator_id: number; }[];

            if (currentSession.length === 0) {
            socket.emit('error', { message: "Current session not found or invalid token" });
            return;
            }

            // Update the session code in database
            await sql`
            UPDATE multi_sessions 
            SET session_code = ${newSessionCode}
            WHERE session_code = ${currentSessionCode} AND session_token = ${sessionToken}
            `;

            // Get IO instance to access all sockets
            const io = getIO();

            // First, notify all clients in the current room about the upcoming change
            broadcastToSession(currentSessionCode, 'session-code-changed', {
            oldCode: currentSessionCode,
            newCode: newSessionCode
            });

            // Find all socketClient keys for this session and move sockets to new room
            const affectedPlayerKeys: string[] = [];
            Object.keys(socketClients).forEach(playerKey => {
            if (playerKey.startsWith(`${currentSessionCode}:`)) {
                affectedPlayerKeys.push(playerKey);

                // Move all sockets for this player to the new room
                socketClients[playerKey].forEach(socketId => {
                const clientSocket = io.sockets.sockets.get(socketId);
                if (clientSocket) {
                    clientSocket.leave(`game:${currentSessionCode}`);
                    clientSocket.join(`game:${newSessionCode}`);
                }
                });
            }
            });

            // Update in-memory data structures
            if (games[currentSessionCode]) {
            games[newSessionCode] = games[currentSessionCode];
            games[newSessionCode].sessionCode = newSessionCode;
            delete games[currentSessionCode];
            }

            // Update socketClients mapping (change keys from oldCode:userName to newCode:userName)
            affectedPlayerKeys.forEach(oldPlayerKey => {
            const userName = oldPlayerKey.split(':')[1]; // Extract userName from "sessionCode:userName"
            const newPlayerKey = `${newSessionCode}:${userName}`;
            socketClients[newPlayerKey] = socketClients[oldPlayerKey];
            delete socketClients[oldPlayerKey];
            });

            // Update socket info for all connected clients
            Object.keys(socketInfo).forEach(socketId => {
            if (socketInfo[socketId].sessionCode === currentSessionCode) {
                socketInfo[socketId].sessionCode = newSessionCode;
            }
            });

            // Update playerInfo mapping (change keys from oldCode:userName to newCode:userName)
            Object.keys(playerInfo).forEach(playerKey => {
            if (playerKey.startsWith(`${currentSessionCode}:`)) {
                const userName = playerKey.split(':')[1];
                const newPlayerKey = `${newSessionCode}:${userName}`;
                playerInfo[newPlayerKey] = { ...playerInfo[playerKey], sessionCode: newSessionCode };
                delete playerInfo[playerKey];
            }
            });

            // Send updated lobby users list to the new room
            const userList = Object.values(playerInfo)
            .filter(info => info.sessionCode === newSessionCode)
            .map(info => info.userName)
            .filter(Boolean);

            broadcastToSession(newSessionCode, 'lobby-users', { users: userList });

            logger.info(`Admin ${jwtPayload.id} changed session code from ${currentSessionCode} to ${newSessionCode}`);

        } catch (jwtError) {
            socket.emit('error', { message: "Invalid authentication token" });
            return;
        }

    } catch (error) {
        logger.error("Change session code error:", error);
        socket.emit('error', { message: "Error changing session code" });
    }
}
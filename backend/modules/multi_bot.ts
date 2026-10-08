import crypto from "crypto";
import { ChatMessage, MultiplayerGame } from "interfaces/multi.interfaces.ts";
import { imageRef, regionCenters } from "./game.ts";
import { logger } from "./logging.ts";
import { broadcastToSession, config, games, handleValidateGuess, playerInfo, socketClients } from "./multi.ts";
import { emitPublicLobbiesUpdate } from "./multi_public.ts";

export const BOT_USERNAME = "Bot";
const BOT_USER_ID = -1; // sentinel id for the bot

const BOT_CHAT_PHRASES = [
  "Good luck everyone!",
  "This one's tricky...",
  "Nice click!",
  "I almost had it!",
  "Let's go!",
  "Hmm, where could that be?",
  "Great game so far!",
  "I'm warming up!",
  "Stay focused!",
  "So close!",
];

// Schedule bot join for a standard multiplayer game (5 seconds after session creation)
export function scheduleBotJoinStandard(sessionCode: string): void {
  if (!config.activateMultiplayerBot) return;

  setTimeout(() => {
    botJoinGame(sessionCode).catch(err => {
      logger.error(`Bot: Error joining standard game ${sessionCode}:`, err);
    });
  }, 5000);
}

// Schedule bot join for a realtime challenge (30 seconds before startTime)
export function scheduleBotJoinRealtime(sessionCode: string, startTimeIso: string): void {
  if (!config.activateMultiplayerBot) return;

  const startTime = new Date(startTimeIso).getTime();
  const joinTime = startTime - 30 * 1000;
  const delay = Math.max(0, joinTime - Date.now());

  setTimeout(() => {
    botJoinGame(sessionCode).catch(err => {
      logger.error(`Bot: Error joining realtime challenge ${sessionCode}:`, err);
    });
  }, delay);
}

// Bot joins a game session directly, bypassing socket connection
async function botJoinGame(sessionCode: string): Promise<void> {
  const gameRef = games[sessionCode];
  if (!gameRef) {
    logger.warn(`Bot: Game ${sessionCode} not found, skipping join`);
    return;
  }
  // Never join classic challenges
  if (gameRef.isClassicChallenge) return;
  if (gameRef.hasStarted) {
    logger.warn(`Bot: Game ${sessionCode} already started, skipping join`);
    return;
  }
  if (gameRef.hasEnded) return;

  const playerKey = `${sessionCode}:${BOT_USERNAME}`;
  if (playerInfo[playerKey]) {
    logger.warn(`Bot: Already in game ${sessionCode}`);
    return;
  }

  const botAnonToken = crypto.randomBytes(32).toString("hex");

  // Add to anonymous usernames list
  if (!gameRef.anonymousUsernames.includes(BOT_USERNAME)) {
    gameRef.anonymousUsernames.push(BOT_USERNAME);
  }

  // Register in socketClients with empty array (no real socket)
  socketClients[playerKey] = [];

  // Register in playerInfo
  playerInfo[playerKey] = {
    isAnonymous: true,
    userName: BOT_USERNAME,
    sessionCode,
    anonToken: botAnonToken,
    gameRef,
  };

  // Initialize scores in game state
  gameRef.individualScores[BOT_USERNAME] = 0;
  gameRef.individualAttempts[BOT_USERNAME] = 0;
  gameRef.individualSuccesses[BOT_USERNAME] = 0;
  gameRef.individualDurations[BOT_USERNAME] = [];
  gameRef.individualCorrectDurations[BOT_USERNAME] = [];

  // Notify real players in the session
  broadcastToSession(sessionCode, 'player-joined', { userName: BOT_USERNAME });
  emitPublicLobbiesUpdate();

  scheduleBotChat(sessionCode);

  logger.info(`Bot joined game ${sessionCode}`);
}

// Called from sendNextCommand when a "guess" command is dispatched.
// Schedules the bot to submit a guess within the allowed window.
export function scheduleBotGuess(gameRef: MultiplayerGame, commandIndex: number): void {
  if (!config.activateMultiplayerBot) return;

  const playerKey = `${gameRef.sessionCode}:${BOT_USERNAME}`;
  if (!playerInfo[playerKey]) return;

  const command = gameRef.commands?.[commandIndex];
  if (!command || command.action !== "guess" || command.regionId === undefined) return;

  const regionId = command.regionId;
  const maxDurationMs = (command.duration || 15) * 1000;
  // Random delay between 1s and 60% of the available time
  const upperBound = Math.max(1001, Math.floor(maxDurationMs * 0.6));
  const delay = Math.floor(Math.random() * (upperBound - 1000)) + 1000;

  setTimeout(async () => {
    await executeBotGuess(gameRef.sessionCode, commandIndex, regionId);
  }, delay);
}

// Submits the bot's guess for the given region using the region's center coordinates
async function executeBotGuess(sessionCode: string, commandIndex: number, regionId: number): Promise<void> {
  try {
    const gameRef = games[sessionCode];
    if (!gameRef || gameRef.hasEnded) return;
    // Ensure we are still on the same command
    if (gameRef.currentCommandIndex !== commandIndex) return;

    const playerKey = `${sessionCode}:${BOT_USERNAME}`;
    const botPlayer = playerInfo[playerKey];
    if (!botPlayer) return;

    const atlas = gameRef.currentAtlas;
    if (!atlas) return;

    const atlasImage = imageRef[atlas];
    const centers = regionCenters[atlas];
    if (!atlasImage || !centers) {
      logger.warn(`Bot: Atlas or centers not available for ${atlas}`);
      return;
    }

    // regionCenters[atlas] is indexed by regionId and contains [x_mm, y_mm, z_mm]
    const center = (centers as unknown as number[][][])[regionId]![0];
    if (!center || center.length < 3) {
      logger.warn(`Bot: No center for region ${regionId} in atlas ${atlas}`);
      return;
    }

    const [mmX, mmY, mmZ] = center;
    const vox = atlasImage.mm2vox([mmX, mmY, mmZ]);
    const x = Math.round(vox[0]);
    const y = Math.round(vox[1]);
    const z = Math.round(vox[2]);

    await handleValidateGuess({
      sessionCode,
      userName: BOT_USERNAME,
      voxelProp: { vox: [x, y, z], mm: [mmX, mmY, mmZ] },
      anonToken: botPlayer.anonToken,
    });

    logger.info(`Bot guessed region ${regionId} in game ${sessionCode}`);
  } catch (error) {
    logger.error(`Bot: Error executing guess in game ${sessionCode}:`, error);
  }
}

// Schedule recurring random chat messages for the bot throughout the game
function scheduleBotChat(sessionCode: string): void {
  const sendNext = () => {
    const gameRef = games[sessionCode];
    if (!gameRef || gameRef.hasEnded) return;
    if (!playerInfo[`${sessionCode}:${BOT_USERNAME}`]) return;

    botSendChat(sessionCode);

    // Schedule the next message: between 5 and 30 seconds
    const delay = Math.floor(Math.random() * 25_000) + 5_000;
    setTimeout(sendNext, delay);
  };

  // First message: between 5 and 20 seconds after joining
  const initialDelay = Math.floor(Math.random() * 15_000) + 5_000;
  setTimeout(sendNext, initialDelay);
}

// Push a random chat message on behalf of the bot directly (no JWT needed)
function botSendChat(sessionCode: string): void {
  try {
    const gameRef = games[sessionCode];
    if (!gameRef || gameRef.hasEnded) return;

    const phrase = BOT_CHAT_PHRASES[Math.floor(Math.random() * BOT_CHAT_PHRASES.length)];
    const chatMsg: ChatMessage = {
      userName: BOT_USERNAME,
      userId: BOT_USER_ID,
      message: phrase,
      timestamp: Date.now(),
    };

    gameRef.chatMessages.push(chatMsg);
    broadcastToSession(sessionCode, 'chat-message', chatMsg);
    logger.info(`Bot sent chat in game ${sessionCode}: ${phrase}`);
  } catch (error) {
    logger.error(`Bot: Error sending chat in game ${sessionCode}:`, error);
  }
}

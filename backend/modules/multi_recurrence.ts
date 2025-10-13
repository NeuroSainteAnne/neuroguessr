import { MultiplayerGame, Recurrence } from "interfaces/multi.interfaces.ts";
import { sql } from "./database_init.ts";
import { logger } from "./logging.ts";
import { games, sendNextCommand } from "./multi.ts";
import { extractPersistentState } from "./multi_challenge.ts";
import { emitPublicLobbiesUpdate } from "./multi_public.ts";

// Helper function to calculate the next start time based on recurrence settings
export function calculateNextStartTime(currentStartTime: string, recurrence: Recurrence): Date {
  const current = new Date(currentStartTime);
  const next = new Date(current);

  switch (recurrence.type) {
    case "hour":
      next.setHours(current.getHours() + recurrence.interval);
      break;
    case "day":
      next.setDate(current.getDate() + recurrence.interval);
      break;
    case "week":
      next.setDate(current.getDate() + (7 * recurrence.interval));
      break;
    case "month":
      next.setMonth(current.getMonth() + recurrence.interval);
      break;
    case "year":
      next.setFullYear(current.getFullYear() + recurrence.interval);
      break;
  }

  return next;
}export async function handleGameRecurrence(gameBackup: MultiplayerGame): Promise<void> {
  try {
    if (!gameBackup.parameters.recurrence || !gameBackup.commands || gameBackup.commands.length === 0) {
      return;
    }

    // Find the countdown command with startTime
    const countdownCommand = gameBackup.commands.find(cmd => cmd.action === "countdown" && cmd.startTime);
    if (!countdownCommand || !countdownCommand.startTime) {
      logger.error(`No countdown command with startTime found for recurring session ${gameBackup.sessionCode}`);
      return;
    }

    // Calculate next start time
    const nextStartTime = calculateNextStartTime(countdownCommand.startTime, gameBackup.parameters.recurrence).toISOString();

    // Update the countdown command with the new start time
    const updatedCommands = gameBackup.commands.map(cmd => {
      if (cmd.action === "countdown" && cmd.startTime) {
        return { ...cmd, startTime: nextStartTime };
      }
      return cmd;
    });

    // Update the existing session in the database with the new start time
    const persistentState = extractPersistentState({
      ...gameBackup,
      commands: updatedCommands,
      parameters: {
        ...gameBackup.parameters,
        commands: updatedCommands
      }
    });

    await sql`
      UPDATE multi_sessions 
      SET created_at = NOW(), 
          persistent_config = ${JSON.stringify(persistentState)}
      WHERE session_code = ${gameBackup.sessionCode}
    `;

    // Recreate the game in memory with updated commands
    games[gameBackup.sessionCode] = {
      ...gameBackup,
      commands: updatedCommands,
      parameters: {
        ...gameBackup.parameters,
        commands: updatedCommands
      }
    };

    // Start the countdown for the next occurrence
    sendNextCommand(games[gameBackup.sessionCode]);

    logger.info(`Realtime challenge ${gameBackup.sessionCode} has been rescheduled for next occurrence at ${nextStartTime}`);

    // Notify watchers that lobbies list may have changed
    emitPublicLobbiesUpdate();
  } catch (error) {
    logger.error(`Error handling recurrence for session ${gameBackup.sessionCode}:`, error);
  }
}
// Helper function to backup game state for recurrence
export function backupGameForRecurrence(gameRef: MultiplayerGame): MultiplayerGame | null {
  if (!gameRef.isChallenge || !gameRef.parameters.recurrence || !gameRef.commands || gameRef.commands.length === 0) {
    return null;
  }

  // Create a deep copy of the relevant game state
  return {
    sessionCode: gameRef.sessionCode,
    originalSessionCode: gameRef.originalSessionCode,
    hasStarted: false, // Reset for next occurrence
    hasFinishedCountdown: false,
    hasEnded: false,
    parameters: { ...gameRef.parameters }, // Keep all parameters including recurrence
    commands: gameRef.commands ? [...gameRef.commands] : undefined, // Copy commands array
    currentCommandIndex: 0,
    currentAtlas: '',
    currentRegionId: -1,
    duration: 0,
    stepStartTime: undefined,
    commandTimeout: undefined,
    totalGuessNumber: gameRef.totalGuessNumber,
    hasAnswered: {},
    individualScores: {},
    individualAttempts: {},
    individualSuccesses: {},
    individualDurations: {},
    individualCorrectDurations: {},
    anonymousUsernames: [],
    lastActivity: Date.now(),
    isCurrentlyBlind: false,
    creatorId: gameRef.creatorId,
    isChallenge: gameRef.isChallenge,
    name: gameRef.name
  };
}


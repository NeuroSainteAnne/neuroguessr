/*  MULTIPLAYER */
export interface PlayerInfo {
  isAnonymous: boolean;
  userName: string;
  gameRef: MultiplayerGame;
  sessionCode: string;
  userId?: number;
  anonToken?: string;
}

export interface MultiplayerParametersType {
  atlas?: string
  regionsNumber: number;
  durationPerRegion: number;
  gameoverOnError: boolean;
  blindMode: boolean;
  commands?: ExternalGameCommands[];
  totalDuration?: number;
  isChallenge?: boolean;
  recurrence?: Recurrence;
}

export interface MultiplayerGame {
  sessionCode: string;
  hasStarted: boolean;
  hasFinishedCountdown: boolean;
  hasEnded: boolean;
  parameters: MultiplayerParametersType;
  commands?: GameCommands[];
  currentCommandIndex: number;
  currentAtlas: string;
  currentRegionId: number;
  duration: number;
  stepStartTime?: number;
  commandTimeout?: NodeJS.Timeout;
  totalGuessNumber: number;
  hasAnswered: Record<string,boolean[]>;
  individualScores: Record<string,number>;
  individualAttempts: Record<string,number>;
  individualSuccesses: Record<string,number>;
  individualDurations: Record<string,number[]>;
  individualCorrectDurations: Record<string,number[]>;
  anonymousUsernames: string[];
  lastActivity: number;
  isCurrentlyBlind: boolean;
  creatorId?: number;
  isChallenge?: boolean;
  name?: string;
}

export type Recurrence = {
  type: "day" | "week" | "month" | "year";
  interval: number;
}

// Persistent game state for challenge mode (saved to database)
export interface PersistentGameState {
  sessionCode: string;
  hasStarted: boolean;
  hasFinishedCountdown: boolean;
  hasEnded: boolean;
  parameters: MultiplayerParametersType;
  commands?: GameCommands[];
  duration: number;
  lastActivity: number;
  creatorId?: number;
  isChallenge?: boolean;
  name?: string;
} 

export interface AtlasLUT {
  R: number[];
  G: number[];
  B: number[];
  A: number[];
  I: number[];
  labels: string[];
}

export interface GameCommands {
  action: "load-atlas" | "guess" | "countdown";
  atlas?: string;
  lut?: AtlasLUT;
  regionId?: number;
  duration?: number;
  startTime?: string; // ISO date string for countdown action
  blindMode?: boolean;
  mapping?: Record<number, number>
  inverseMapping?: Record<number, number>
}

export interface ExternalGameCommands {
  action: "load-atlas" | "guess" | "countdown";
  atlas?: string;
  regionId?: number;
  duration?: number;
  startTime?: string; // ISO date string for countdown action
  blindMode?: boolean;
}
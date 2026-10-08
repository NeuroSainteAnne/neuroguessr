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
  id: number;
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
  // Classic challenge fields
  isClassicChallenge?: boolean;
  startDate?: Date;
  endDate?: Date;
  classicChallengeId?: number;
  originalSessionCode: string; // For classic challenges, stores the original session code
  theoreticalMaximumScore?: number; // Pre-calculated theoretical maximum score for percentage calculations
  chatMessages: ChatMessage[];
}

export interface ChatMessage {
  userName: string;
  userId: number;
  message: string;
  timestamp: number;
}

export type Recurrence = {
  type: "hour" | "day" | "week" | "month" | "year";
  interval: number;
}

// Persistent game state for challenge mode (saved to database)
export interface PersistentGameState {
  id: number;
  sessionCode: string;
  originalSessionCode: string;
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
  // Classic challenge fields
  isClassicChallenge?: boolean;
  challengeName?: string;
  startDate?: Date;
  endDate?: Date;
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
export type ColorMap = {
  R: number[];
  G: number[];
  B: number[];
  A: number[];
  I: number[];
  min?: number;
  max?: number;
  labels: string[];
  centers?: number[][][];
};

export type JoinLobbyData = {
  sessionCode: string;
  userName: string;
  isAnonymous: boolean;
  token?: string;
  anonToken?: string;
}

export type ChangeSessionCodeData = {
  currentSessionCode: string;
  newSessionCode: string;
  sessionToken: string;
  userToken: string;
}
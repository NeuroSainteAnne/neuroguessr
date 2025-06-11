
/*  MULTIPLAYER */
export interface PlayerInfo {
  isAnonymous?: boolean;
  userName: string;
  gameRef: MultiplayerGame;
  sessionCode: string;
  anonToken?: string;
}

export interface MultiplayerParametersType {
  atlas?: string
  regionsNumber: number;
  durationPerRegion: number;
  gameoverOnError: boolean;
}

export interface MultiplayerGame {
  sessionCode: string;
  hasStarted: boolean;
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
  action: string;
  atlas?: string;
  lut?: AtlasLUT;
  regionId?: number;
  duration: number;
}
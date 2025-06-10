export interface User {
    id: number;
    username: string;
    firstname: string;
    lastname: string;
    email: string;
    password: string;
    createdAt: string; // ISO date string
    verified: boolean;
    publishToLeaderboard: boolean | null;
    language: string;
}

export interface Token {
    id: number;
    userId: number;
    token: string;
    createdAt: string; // ISO date string
}

export interface GameSession {
    id: number;
    userId: number;
    token: string;
    mode: string;
    atlas: string;
    createdAt: number; // Unix ms timestamp
    currentScore: number;
}

export interface GameProgress {
    id: number;
    sessionId: number;
    sessionToken: string;
    regionId: number;
    timeTaken: number;
    isActive: boolean;
    isCorrect: boolean;
    scoreIncrement: number;
    attempts: number;
    createdAt: number; // Unix ms timestamp
}

export interface FinishedSession {
    id: number;
    userId: number;
    mode: string;
    atlas: string;
    score: number;
    attempts?: number;
    correct?: number;
    incorrect?: number;
    minTimePerRegion?: number;
    maxTimePerRegion?: number;
    avgTimePerRegion?: number;
    minTimePerCorrectRegion?: number;
    maxTimePerCorrectRegion?: number;
    avgTimePerCorrectRegion?: number;
    quitReason?: string;
    multiplayerGamesWon?: number;
    duration: number; // In milliseconds
    createdAt: number; // Unix ms timestamp
}
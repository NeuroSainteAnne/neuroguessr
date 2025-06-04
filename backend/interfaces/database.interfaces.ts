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
    // Add privacyMode if you add it to the schema
    // privacyMode: number;
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
    createdAt: number; // Unix ms timestamp
}

export interface FinishedSession {
    id: number;
    userId: number;
    mode: string;
    atlas: string;
    score: number;
    accuracy: number;
    duration: number;
    createdAt: number; // Unix ms timestamp
}
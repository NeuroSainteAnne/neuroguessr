import type { User } from "./database.interfaces.ts";
import type { Request } from 'express';

/* LOGIN interfaces */

export interface LoginRequestBody {
    username: string;
    password: string;
}

export interface AuthenticatedRequest extends Request {
    user: User;
}

/* REGISTER interfaces */

export interface RegisterBody {
    username: string;
    firstname: string;
    lastname: string;
    email: string;
    password: string;
    language?: string;
    captcha_token?: string;
}

export interface RegisterRequest extends Request {
    body: RegisterBody;
}

export interface VerifyEmailBody {
    id: string;
    token: string;
}

export interface VerifyEmailRequest extends Request<VerifyEmailBody> {
    body: VerifyEmailBody;
}

export interface PasswordLinkBody {
    email: string;
    language?: string;
    captcha_token?: string;
}

export interface PasswordLinkRequest extends Request {
    body: PasswordLinkBody;
}

export interface ResetPasswordBody {
    password: string;
    id: string;
    token: string;
}

export interface ResetPasswordRequest extends Request {
    body: ResetPasswordBody;
}

export interface ValidateResetTokenBody {
    id: string;
    token: string;
}

export interface ValidateResetTokenRequest extends Request {
    body: ValidateResetTokenBody;
}

/* GAME INTERFACES */

export interface StartGameSessionBody {
    mode: string;
    atlas: string;
}

export interface StartGameSessionRequest extends Request {
    body: StartGameSessionBody;
    user: User;
}

export interface GetNextRegionRequest extends Request {
    body: GetNextRegionRequestBody;
    user: User;
}

export interface GetNextRegionRequestBody {
    sessionId: number;
    sessionToken: string;
}

interface ValidateRegionRequestBody {
    sessionId: number;
    sessionToken: string;
    coordinates: [number, number, number];
}

export interface ValidateRegionRequest extends Request {
    body: ValidateRegionRequestBody;
}

interface ClotureGameSessionBody {
    sessionId: number;
    sessionToken: string;
}

export interface ClotureGameSessionRequest extends Request {
    body: ClotureGameSessionBody;
}

/* CONFIG USER INTERFACES */

export interface ConfigUserBody {
    firstname?: string;
    lastname?: string;
    password?: string;
    publishToLeaderboard?: boolean | null;
    language?: string;
}

/* LEADERBOARD INTERFACES */

interface GetLeaderboardBody {
    mode?: string;
    atlas?: string;
    numberLimit?: number;
    timeLimit?: number;
    appendTotal?: boolean;
}

export interface GetLeaderboardRequest {
    body: GetLeaderboardBody
}

/* STATS request */


interface GetStatsBody {
    mode?: string;
    atlas?: string;
    numberLimit?: number;
    timeLimit?: number;
    appendTotal?: boolean;
}

export interface GetStatsRequest {
    body: GetStatsBody
}

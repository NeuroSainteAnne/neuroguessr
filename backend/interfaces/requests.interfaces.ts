import type { User } from "./database.interfaces.ts";
import type { Request } from 'express';
import { MultiplayerParametersType } from "./multi.interfaces.ts";

/* LOGIN interfaces */

export interface LoginRequestBody {
    username: string;
    password: string;
}

export interface AuthenticatedRequest extends Request {
    user: User;
    userToken: string;
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
    clinical_trial_gender?: "male" | "female" | "other" | null;
    clinical_trial_age?: number | null;
    clinical_trial_country?: string | null;
    clinical_trial_occupation?: string | null;
    clinical_trial_consent?: "data_usage" | "acknowledgement" | "none" | null;
    clinical_trial_consent_date?: string | null; 
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

/* CONFIG USER INTERFACES */

export interface ConfigUserBody {
    firstname?: string;
    lastname?: string;
    password?: string;
    publishToLeaderboard?: boolean | null;
    language?: string;
    clinical_trial_gender?: "male" | "female" | "other" | null;
    clinical_trial_age?: number | null;
    clinical_trial_country?: string | null;
    clinical_trial_occupation?: string | null;
    clinical_trial_consent?: "data_usage" | "acknowledgement" | "none" | null;
}

/* LEADERBOARD INTERFACES */

interface GetLeaderboardBody {
    mode?: string;
    atlas?: string;
    numberLimit?: number;
    timeLimit?: number;
    appendTotal?: boolean;
    blindMode?: boolean | null;
}

export interface GetLeaderboardRequest {
    body: GetLeaderboardBody
}

interface GetMostUsedAtlasBody {
}

export interface GetMostUsedAtlasRequest {
    body: GetMostUsedAtlasBody
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


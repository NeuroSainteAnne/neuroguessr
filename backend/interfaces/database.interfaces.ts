export interface User {
    id: number;
    username: string;
    firstname: string;
    lastname: string;
    email: string;
    password: string;
    created_at: string; // ISO date string
    verified: boolean;
    admin: boolean;
    publish_to_leaderboard: boolean | null;
    language: string;
    clinical_trial_gender: "male" | "female" | "other" | null;
    clinical_trial_age: number | null;
    clinical_trial_country: string | null;
    clinical_trial_occupation: string | null;
    clinical_trial_consent: "data_usage" | "acknowledgement" | "none" | null;
    clinical_trial_consent_date: string | null; // ISO date string
}

export interface Token {
    id: number;
    user_id: number;
    token: string;
    created_at: string; // ISO date string
}

export interface GameSession {
    id: number;
    user_id: number;
    token: string;
    mode: string;
    atlas: string;
    blind_mode: boolean;
    created_at: number; // Unix ms timestamp
    current_score: number;
    current_streak: number;
    consecutive_errors: number;
}

export interface GameProgress {
    id: number;
    session_id: number;
    session_token: string;
    region_id: number;
    time_taken: number;
    is_active: boolean;
    is_correct: boolean;
    score_increment: number;
    attempts: number;
    created_at: number; // Unix ms timestamp
}

export interface FinishedSession {
    id: number;
    user_id: number;
    mode: string;
    atlas: string;
    score: number;
    blind_mode: boolean;
    attempts?: number;
    correct?: number;
    incorrect?: number;
    min_time_per_region?: number;
    max_time_per_region?: number;
    avg_time_per_region?: number;
    min_time_per_correct_region?: number;
    max_time_per_correct_region?: number;
    avg_time_per_correct_region?: number;
    quit_reason?: string;
    multiplayer_games_won?: number;
    duration: number; // In milliseconds
    created_at: number; // Unix ms timestamp
}

export interface FinishedSessionCamelCase {
    id: number;
    userId: number;
    mode: string;
    atlas: string;
    score: number;
    blindMode: boolean;
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

export interface MultiSession {
  id: number;
  session_code: number;
  session_token: string;
  creator_id: number | null;
  created_at: Date;
  public?: boolean;
  is_challenge?: boolean;
  persistent_config?: string | null;
}

export interface AdvancedGameSettings {
  id: number;
  name: string;
  user_id: number;
  created_at: Date;
  public: boolean;
  settings: string;
}
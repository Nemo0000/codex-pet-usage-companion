export type Language = "zh-CN" | "en";
export type ThemePreference = "system" | "light" | "dark";
export type MetricPreference = "remaining" | "used";

export interface AccountInfo {
  type: string;
  email?: string | null;
  planType?: string | null;
}

export interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
}

export interface RateLimitBucket {
  limitId?: string | null;
  limitName?: string | null;
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
  planType?: string | null;
  rateLimitReachedType?: string | null;
}

export interface ResetCreditSummary {
  availableCount: number;
}

export interface RateLimitsResponse {
  rateLimits?: RateLimitBucket | null;
  rateLimitsByLimitId?: Record<string, RateLimitBucket> | null;
  rateLimitResetCredits?: ResetCreditSummary | null;
}

export interface DashboardSnapshot {
  account: AccountInfo | null;
  requiresOpenaiAuth: boolean;
  rateLimits: RateLimitsResponse | null;
  rateLimitsError: string | null;
  fetchedAt: number;
}

export interface LoginStartResult {
  authUrl: string;
  loginId: string;
}

export interface DisplayLimit {
  id: string;
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetsAt: number | null;
  windowDurationMins: number | null;
  reached: boolean;
}

export interface UserSettings {
  language: Language;
  theme: ThemePreference;
  metric: MetricPreference;
  compact: boolean;
}

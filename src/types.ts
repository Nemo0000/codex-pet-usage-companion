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

export interface OfficialPetSyncResult {
  petId: "custom";
  displayName: string;
  method: "windows-ui-automation";
}

export interface PetdexPet {
  slug: string;
  displayName: string;
  kind: string;
  submittedBy: string;
  spritesheetUrl: string;
  spriteVersionNumber: 1 | 2;
  installed: boolean;
}

export interface PetdexManifestResult {
  generatedAt: string;
  total: number;
  pets: PetdexPet[];
}

export interface PetdexInstallResult {
  slug: string;
  displayName: string;
  directoryPath: string;
  alreadyInstalled: boolean;
  spriteVersionNumber: 1 | 2;
  method: "petdex-community-package";
}

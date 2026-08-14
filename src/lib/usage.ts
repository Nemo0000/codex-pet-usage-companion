import { translate } from "../i18n";
import type {
  DisplayLimit,
  Language,
  RateLimitBucket,
  RateLimitsResponse,
} from "../types";

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function maskEmail(email?: string | null): string {
  if (!email) return "";
  const at = email.indexOf("@");
  if (at <= 0) return "••••";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}${"•".repeat(Math.max(3, Math.min(6, local.length - visible.length)))}${domain}`;
}

export function formatPlanName(planType?: string | null): string {
  if (!planType) return "";
  return planType
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatWindowLabel(
  minutes: number | null,
  language: Language,
  fallback?: string | null,
): string {
  if (!minutes || minutes <= 0) return fallback || translate(language, "shortWindow");
  if (minutes === 1_440) return translate(language, "dailyWindow");
  if (minutes >= 10_000 && minutes <= 10_200) return translate(language, "weeklyWindow");
  if (minutes < 60) return translate(language, "minuteWindow", { count: minutes });
  if (minutes % 60 === 0) {
    return translate(language, "hourWindow", { count: Math.round(minutes / 60) });
  }
  return fallback || translate(language, "shortWindow");
}

export function formatCountdown(
  resetsAt: number | null,
  nowMs: number,
  language: Language,
): string {
  if (!resetsAt) return "—";
  const totalSeconds = Math.max(0, Math.floor(resetsAt - nowMs / 1_000));
  if (totalSeconds === 0) return translate(language, "resetting");

  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);

  if (language === "zh-CN") {
    if (days > 0) return `${days} 天 ${hours} 小时`;
    if (hours > 0) return `${hours} 小时 ${minutes} 分`;
    return `${Math.max(1, minutes)} 分钟`;
  }

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

function bucketEntries(
  bucket: RateLimitBucket,
  bucketKey: string,
  language: Language,
): DisplayLimit[] {
  return (["primary", "secondary"] as const).flatMap((kind) => {
    const window = bucket[kind];
    if (!window || typeof window.usedPercent !== "number") return [];
    const usedPercent = clampPercent(window.usedPercent);
    const minutes = window.windowDurationMins ?? null;
    return [
      {
        id: `${bucket.limitId || bucketKey}-${kind}-${minutes || "unknown"}`,
        label: formatWindowLabel(minutes, language, bucket.limitName),
        usedPercent,
        remainingPercent: clampPercent(100 - usedPercent),
        resetsAt: window.resetsAt ?? null,
        windowDurationMins: minutes,
        reached: Boolean(bucket.rateLimitReachedType) || usedPercent >= 100,
      },
    ];
  });
}

export function normalizeLimits(
  response: RateLimitsResponse | null,
  language: Language,
): DisplayLimit[] {
  if (!response) return [];
  const byId = response.rateLimitsByLimitId;
  const buckets = byId && Object.keys(byId).length > 0
    ? Object.entries(byId)
    : response.rateLimits
      ? [["codex", response.rateLimits] as const]
      : [];

  const seen = new Set<string>();
  return buckets
    .flatMap(([key, bucket]) => bucketEntries(bucket, key, language))
    .filter((limit) => {
      const signature = `${limit.windowDurationMins}-${limit.resetsAt}-${limit.usedPercent}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .sort((left, right) =>
      (left.windowDurationMins ?? Number.MAX_SAFE_INTEGER)
      - (right.windowDurationMins ?? Number.MAX_SAFE_INTEGER),
    );
}

export function selectCompactLimit(limits: DisplayLimit[]): DisplayLimit | null {
  if (limits.length === 0) return null;
  return [...limits].sort(
    (left, right) => (right.windowDurationMins ?? 0) - (left.windowDurationMins ?? 0),
  )[0];
}

export function severityForRemaining(remaining: number): "safe" | "warning" | "danger" {
  if (remaining <= 20) return "danger";
  if (remaining <= 45) return "warning";
  return "safe";
}

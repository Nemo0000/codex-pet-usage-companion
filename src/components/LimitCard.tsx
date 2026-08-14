import { AlertTriangle, Clock3 } from "lucide-react";
import { translate } from "../i18n";
import { formatCountdown, severityForRemaining } from "../lib/usage";
import type { DisplayLimit, Language, MetricPreference } from "../types";

interface LimitCardProps {
  limit: DisplayLimit;
  language: Language;
  metric: MetricPreference;
  now: number;
}

export function LimitCard({ limit, language, metric, now }: LimitCardProps) {
  const shownPercent = metric === "remaining" ? limit.remainingPercent : limit.usedPercent;
  const barPercent = metric === "remaining" ? limit.remainingPercent : limit.usedPercent;
  const severity = severityForRemaining(limit.remainingPercent);
  const metricLabel = translate(language, metric === "remaining" ? "remaining" : "used");
  const countdown = formatCountdown(limit.resetsAt, now, language);

  return (
    <article className={`limit-card limit-card--${severity}`} aria-label={limit.label}>
      <div className="limit-card__heading">
        <div>
          <p className="limit-card__label">{limit.label}</p>
          {limit.reached && (
            <span className="limit-card__reached">
              <AlertTriangle size={12} aria-hidden="true" />
              {translate(language, "limitReached")}
            </span>
          )}
        </div>
        <div className="limit-card__value" aria-label={`${shownPercent}% ${metricLabel}`}>
          <strong>{shownPercent}%</strong>
          <span>{metricLabel}</span>
        </div>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shownPercent}
      >
        <span className="progress-track__fill" style={{ width: `${barPercent}%` }} />
      </div>
      <div className="limit-card__meta">
        <Clock3 size={14} aria-hidden="true" />
        <span>{translate(language, "resetIn", { time: countdown })}</span>
      </div>
    </article>
  );
}

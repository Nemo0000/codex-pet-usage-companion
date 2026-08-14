import type { LucideIcon } from "lucide-react";

interface StatePanelProps {
  icon: LucideIcon;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function StatePanel({
  icon: Icon,
  title,
  body,
  actionLabel,
  onAction,
  busy,
  secondaryLabel,
  onSecondary,
}: StatePanelProps) {
  return (
    <section className="state-panel" aria-live="polite">
      <span className="state-panel__icon"><Icon size={24} aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p>{body}</p>
      {(actionLabel || secondaryLabel) && (
        <div className="state-panel__actions">
          {actionLabel && (
            <button className="primary-button" type="button" onClick={onAction} disabled={busy}>
              {actionLabel}
            </button>
          )}
          {secondaryLabel && (
            <button className="secondary-button" type="button" onClick={onSecondary} disabled={busy}>
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

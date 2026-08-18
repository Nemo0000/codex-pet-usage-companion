import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { translate } from "../i18n";
import { CommunityPetsPanel } from "./CommunityPetsPanel";
import type { Language, MetricPreference, ThemePreference, UserSettings } from "../types";

interface SettingsPanelProps {
  settings: UserSettings;
  initialView?: "settings" | "community";
  autostart: boolean;
  alwaysOnTop: boolean;
  onChange: (settings: UserSettings) => void;
  onAutostartChange: (enabled: boolean) => Promise<void>;
  onAlwaysOnTopChange: (enabled: boolean) => Promise<void>;
  onClose: () => void;
}

function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="setting-row setting-row--switch">
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <input
        className="switch-input"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-control" aria-hidden="true" />
    </label>
  );
}

export function SettingsPanel({
  settings,
  initialView = "settings",
  autostart,
  alwaysOnTop,
  onChange,
  onAutostartChange,
  onAlwaysOnTopChange,
  onClose,
}: SettingsPanelProps) {
  const { language } = settings;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<"settings" | "community">(initialView);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setActiveView(initialView);
  }, [initialView]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [activeView]);

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <section className="settings-panel">
        <header className="settings-panel__header">
          <div className="settings-panel__title">
            <h2 id="settings-title">
              {translate(language, activeView === "community" ? "communityPetsTitle" : "settings")}
            </h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={translate(language, "closeSettings")}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div ref={bodyRef} className={`settings-panel__body${activeView === "community" ? " settings-panel__body--community" : ""}`}>
          {activeView === "community" ? (
            <CommunityPetsPanel language={language} />
          ) : (
            <>
              <fieldset>
                <legend>{translate(language, "appearance")}</legend>
                <label className="setting-row">
                  <span>{translate(language, "language")}</span>
                  <select
                    value={settings.language}
                    onChange={(event) => onChange({ ...settings, language: event.target.value as Language })}
                  >
                    <option value="zh-CN">简体中文</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label className="setting-row">
                  <span>{translate(language, "theme")}</span>
                  <select
                    value={settings.theme}
                    onChange={(event) => onChange({ ...settings, theme: event.target.value as ThemePreference })}
                  >
                    <option value="system">{translate(language, "themeSystem")}</option>
                    <option value="light">{translate(language, "themeLight")}</option>
                    <option value="dark">{translate(language, "themeDark")}</option>
                  </select>
                </label>
                <label className="setting-row">
                  <span>{translate(language, "metric")}</span>
                  <select
                    value={settings.metric}
                    onChange={(event) => onChange({ ...settings, metric: event.target.value as MetricPreference })}
                  >
                    <option value="remaining">{translate(language, "metricRemaining")}</option>
                    <option value="used">{translate(language, "metricUsed")}</option>
                  </select>
                </label>
              </fieldset>

              <fieldset>
                <legend>{translate(language, "behavior")}</legend>
                <Switch
                  checked={alwaysOnTop}
                  onChange={(enabled) => void onAlwaysOnTopChange(enabled)}
                  label={translate(language, "alwaysOnTop")}
                  hint={translate(language, "alwaysOnTopHint")}
                />
                <Switch
                  checked={autostart}
                  onChange={(enabled) => void onAutostartChange(enabled)}
                  label={translate(language, "autostart")}
                  hint={translate(language, "autostartHint")}
                />
              </fieldset>
            </>
          )}
        </div>

        <footer className="settings-panel__footer">{translate(language, "privacyNote")}</footer>
      </section>
    </div>
  );
}

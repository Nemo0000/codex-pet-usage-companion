import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  AlertCircle,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  LoaderCircle,
  LogIn,
  PawPrint,
  RefreshCw,
  Settings,
  TerminalSquare,
  X,
} from "lucide-react";
import { getCurrentWindow, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { BrandMark } from "./components/BrandMark";
import { LimitCard } from "./components/LimitCard";
import { SettingsPanel } from "./components/SettingsPanel";
import { StatePanel } from "./components/StatePanel";
import { translate } from "./i18n";
import {
  formatPlanName,
  maskEmail,
  normalizeLimits,
  selectCompactLimit,
  severityForRemaining,
} from "./lib/usage";
import {
  beginChatGptLogin,
  fetchDashboard,
  isTauriRuntime,
  parseBackendError,
  restartAppServer,
  waitForChatGptLogin,
} from "./lib/platform";
import type { DashboardSnapshot, UserSettings } from "./types";

type ViewStatus = "loading" | "ready" | "unauthenticated" | "login-pending" | "error";
type PanelView = "settings" | "community";

const SETTINGS_KEY = "codex-usage-companion.settings.v1";
const WINDOW_POSITION_KEY = "codex-usage-companion.position.v1";
const DEFAULT_SETTINGS: UserSettings = {
  language: navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en",
  theme: "system",
  metric: "remaining",
  compact: false,
  officialDesktopPath: "",
};

function loadSettings(): UserSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") as Partial<UserSettings> | null;
    return {
      language: parsed?.language === "zh-CN" || parsed?.language === "en" ? parsed.language : DEFAULT_SETTINGS.language,
      theme: parsed?.theme === "system" || parsed?.theme === "light" || parsed?.theme === "dark" ? parsed.theme : DEFAULT_SETTINGS.theme,
      metric: parsed?.metric === "remaining" || parsed?.metric === "used" ? parsed.metric : DEFAULT_SETTINGS.metric,
      compact: typeof parsed?.compact === "boolean" ? parsed.compact : DEFAULT_SETTINGS.compact,
      officialDesktopPath: typeof parsed?.officialDesktopPath === "string" ? parsed.officialDesktopPath : DEFAULT_SETTINGS.officialDesktopPath,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function snapshotHasUsage(snapshot: DashboardSnapshot): boolean {
  const response = snapshot.rateLimits;
  return Boolean(
    snapshot.account ||
      response?.rateLimits ||
      Object.keys(response?.rateLimitsByLimitId ?? {}).length > 0,
  );
}

function LoadingPanel({ language }: { language: UserSettings["language"] }) {
  return (
    <section className="loading-panel" aria-live="polite" aria-busy="true">
      <div className="loading-panel__heading">
        <span className="skeleton skeleton--circle" />
        <div>
          <span className="skeleton skeleton--title" />
          <span className="skeleton skeleton--text" />
        </div>
      </div>
      <span className="skeleton skeleton--card" />
      <span className="skeleton skeleton--card" />
      <span className="sr-only">{translate(language, "refreshing")}</span>
    </section>
  );
}

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(loadSettings);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [status, setStatus] = useState<ViewStatus>("loading");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>("settings");
  const [loginBusy, setLoginBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [autostart, setAutostart] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const language = settings.language;
  const appWindow = useMemo(() => (isTauriRuntime() ? getCurrentWindow() : null), []);

  const limits = useMemo(
    () => normalizeLimits(snapshot?.rateLimits ?? null, language),
    [snapshot?.rateLimits, language],
  );
  const compactLimit = useMemo(() => selectCompactLimit(limits), [limits]);
  const refresh = useCallback(async (quiet = false) => {
    if (!quiet || !snapshot) setRefreshing(true);
    try {
      const nextSnapshot = await fetchDashboard();
      setSnapshot(nextSnapshot);
      setError(null);
      setStatus(snapshotHasUsage(nextSnapshot) ? "ready" : "unauthenticated");
    } catch (caught) {
      setError(parseBackendError(caught));
      setStatus("error");
    } finally {
      setRefreshing(false);
    }
  }, [snapshot]);

  useEffect(() => {
    void refresh();
  }, []); // Run once; later refreshes are timer/event driven.

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    const timer = window.setInterval(() => void refresh(true), 120_000);
    return () => window.clearInterval(timer);
  }, [status, refresh]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let dispose: (() => void) | undefined;
    void listen("refresh-requested", () => void refresh(true)).then((unlisten) => {
      dispose = unlisten;
    });
    return () => dispose?.();
  }, [refresh]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.lang = settings.language;
  }, [settings]);

  useEffect(() => {
    if (!appWindow) return;
    void isEnabled().then(setAutostart).catch(() => setAutostart(false));
    void appWindow.isAlwaysOnTop().then(setAlwaysOnTop).catch(() => setAlwaysOnTop(false));

    const savedPosition = localStorage.getItem(WINDOW_POSITION_KEY);
    if (savedPosition) {
      try {
        const position = JSON.parse(savedPosition) as { x: number; y: number };
        if (Number.isFinite(position.x) && Number.isFinite(position.y)) {
          void appWindow.setPosition(new PhysicalPosition(position.x, position.y));
        }
      } catch {
        localStorage.removeItem(WINDOW_POSITION_KEY);
      }
    }

    let dispose: (() => void) | undefined;
    void appWindow.onMoved(({ payload }) => {
      localStorage.setItem(WINDOW_POSITION_KEY, JSON.stringify(payload));
    }).then((unlisten) => {
      dispose = unlisten;
    });
    return () => dispose?.();
  }, [appWindow]);

  const handleLogin = async () => {
    setLoginBusy(true);
    setStatus("login-pending");
    setError(null);
    try {
      const login = await beginChatGptLogin();
      const nextSnapshot = await waitForChatGptLogin(login.loginId);
      setSnapshot(nextSnapshot);
      setStatus(snapshotHasUsage(nextSnapshot) ? "ready" : "unauthenticated");
      if (snapshotHasUsage(nextSnapshot)) {
        return;
      }
      throw new Error("LOGIN_INCOMPLETE::The browser sign-in completed without an account");
    } catch (caught) {
      setError(parseBackendError(caught));
      setStatus("error");
    } finally {
      setLoginBusy(false);
    }
  };

  const handleWindowDrag = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || !appWindow) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, [role='button']")) return;
    void appWindow.startDragging();
  };

  const handleReconnect = async () => {
    setRefreshing(true);
    try {
      const nextSnapshot = await restartAppServer();
      setSnapshot(nextSnapshot);
      setError(null);
      setStatus(snapshotHasUsage(nextSnapshot) ? "ready" : "unauthenticated");
    } catch (caught) {
      setError(parseBackendError(caught));
      setStatus("error");
    } finally {
      setRefreshing(false);
    }
  };

  const handleCompactToggle = async () => {
    const compact = !settings.compact;
    setSettings((current) => ({ ...current, compact }));
    if (appWindow) {
      await appWindow.setSize(new LogicalSize(compact ? 228 : 380, compact ? 92 : 560));
    }
  };

  const openPanel = (view: PanelView) => {
    setPanelView(view);
    setSettingsOpen(true);
  };

  const handleAutostartChange = async (enabled: boolean) => {
    if (enabled) await enable();
    else await disable();
    setAutostart(enabled);
  };

  const handleAlwaysOnTopChange = async (enabled: boolean) => {
    await appWindow?.setAlwaysOnTop(enabled);
    setAlwaysOnTop(enabled);
  };

  const handleCopyCommand = async () => {
    await navigator.clipboard.writeText("codex --version\ncodex app-server --help");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  const hideWindow = () => void appWindow?.hide();
  const formattedTime = snapshot
    ? new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(snapshot.fetchedAt)
    : "—";
  const planName = formatPlanName(snapshot?.account?.planType) || translate(language, "planUnknown");

  if (settings.compact && status === "ready" && compactLimit) {
    const percent = settings.metric === "remaining" ? compactLimit.remainingPercent : compactLimit.usedPercent;
    const severity = severityForRemaining(compactLimit.remainingPercent);
    return (
      <main className={`app-shell app-shell--compact compact-card compact-card--${severity}`}>
        <div className="compact-card__drag" data-tauri-drag-region onMouseDown={handleWindowDrag}>
          <BrandMark small />
          <div className="compact-card__copy">
            <span>{compactLimit.label}</span>
            <strong>{percent}%</strong>
          </div>
        </div>
        <button className="icon-button icon-button--compact" type="button" onClick={() => void handleCompactToggle()} aria-label={translate(language, "compact")}>
          <ChevronsUpDown size={16} aria-hidden="true" />
        </button>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="panel-card">
        <header className="titlebar" data-tauri-drag-region onMouseDown={handleWindowDrag}>
          <div className="titlebar__brand" data-tauri-drag-region>
            <BrandMark />
            <div data-tauri-drag-region>
              <h1 data-tauri-drag-region>{translate(language, "appName")}</h1>
              <span className={`connection-status connection-status--${status === "ready" ? "online" : "offline"}`}>
                <i aria-hidden="true" />
                {translate(language, status === "ready" ? "connected" : "disconnected")}
              </span>
            </div>
          </div>
          <div className="titlebar__actions">
            <button className="icon-button" type="button" onClick={() => void handleCompactToggle()} aria-label={translate(language, "compact")} disabled={status !== "ready" || limits.length === 0}>
              <ChevronsDownUp size={17} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={() => openPanel("settings")} aria-label={translate(language, "settings")}>
              <Settings size={17} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={hideWindow} aria-label={translate(language, "hide")}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="panel-content">
          {status === "loading" && <LoadingPanel language={language} />}

          {(status === "unauthenticated" || status === "login-pending") && (
            <StatePanel
              icon={LogIn}
              title={translate(language, "loginTitle")}
              body={translate(language, "loginBody")}
              actionLabel={translate(language, status === "login-pending" ? "loginWaiting" : "loginAction")}
              onAction={() => void handleLogin()}
              busy={loginBusy || status === "login-pending"}
            />
          )}

          {status === "error" && error?.code === "CLI_NOT_FOUND" && (
            <StatePanel
              icon={TerminalSquare}
              title={translate(language, "cliMissingTitle")}
              body={translate(language, "cliMissingBody")}
              actionLabel={translate(language, "retry")}
              onAction={() => void handleReconnect()}
              busy={refreshing}
              secondaryLabel={translate(language, copied ? "copied" : "copyCommand")}
              onSecondary={() => void handleCopyCommand()}
            />
          )}

          {status === "error" && error?.code !== "CLI_NOT_FOUND" && (
            <StatePanel
              icon={AlertCircle}
              title={translate(language, "errorTitle")}
              body={error?.message || translate(language, "errorBody")}
              actionLabel={translate(language, "reconnect")}
              onAction={() => void handleReconnect()}
              busy={refreshing}
            />
          )}

          {status === "ready" && snapshot && (
            <>
              <section className="account-card" aria-label={translate(language, "account")}>
                <div>
                  <span className="account-card__eyebrow">{translate(language, "account")}</span>
                  <strong>{maskEmail(snapshot.account?.email) || planName}</strong>
                </div>
                <span className="plan-badge">{planName}</span>
              </section>

              <button className="pet-home-entry" type="button" onClick={() => openPanel("community")}>
                <span className="pet-home-entry__icon" aria-hidden="true"><PawPrint size={17} /></span>
                <span className="pet-home-entry__copy">
                  <strong>{translate(language, "changePet")}</strong>
                  <small>{translate(language, "changePetHint")}</small>
                </span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>

              {limits.length > 0 ? (
                <section className="limits-list" aria-live="polite">
                  {limits.map((limit) => (
                    <LimitCard
                      key={limit.id}
                      limit={limit}
                      language={language}
                      metric={settings.metric}
                      now={now}
                    />
                  ))}
                </section>
              ) : (
                <StatePanel
                  icon={AlertCircle}
                  title={translate(language, "noLimitsTitle")}
                  body={snapshot.rateLimitsError || translate(language, "noLimitsBody")}
                  actionLabel={translate(language, "retry")}
                  onAction={() => void refresh()}
                  busy={refreshing}
                />
              )}
            </>
          )}
        </div>

        <footer className="panel-footer">
          <span>{translate(language, "lastUpdated", { time: formattedTime })}</span>
          <button className="refresh-button" type="button" onClick={() => void refresh()} disabled={refreshing || status === "loading"}>
            {refreshing ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
            {translate(language, refreshing ? "refreshing" : "refresh")}
          </button>
        </footer>
      </section>

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          initialView={panelView}
          autostart={autostart}
          alwaysOnTop={alwaysOnTop}
          onChange={setSettings}
          onAutostartChange={handleAutostartChange}
          onAlwaysOnTopChange={handleAlwaysOnTopChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
  );
}

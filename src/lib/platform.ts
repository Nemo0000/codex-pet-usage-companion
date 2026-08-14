import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { DashboardSnapshot, LoginStartResult } from "../types";

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

const mockSnapshot: DashboardSnapshot = {
  account: {
    type: "chatgpt",
    email: "demo.user@example.com",
    planType: "pro",
  },
  requiresOpenaiAuth: true,
  rateLimits: {
    rateLimits: {
      limitId: "codex",
      primary: {
        usedPercent: 32,
        windowDurationMins: 300,
        resetsAt: Math.floor(Date.now() / 1_000) + 7_800,
      },
      secondary: {
        usedPercent: 18,
        windowDurationMins: 10_080,
        resetsAt: Math.floor(Date.now() / 1_000) + 410_000,
      },
      planType: "pro",
    },
  },
  rateLimitsError: null,
  fetchedAt: Date.now(),
};

export async function fetchDashboard(): Promise<DashboardSnapshot> {
  if (!isTauriRuntime()) {
    if (import.meta.env.DEV) return mockSnapshot;
    throw new Error("RUNTIME_UNAVAILABLE::Desktop runtime is unavailable");
  }
  return invoke<DashboardSnapshot>("dashboard_snapshot");
}

export async function beginChatGptLogin(): Promise<LoginStartResult> {
  if (!isTauriRuntime()) {
    throw new Error("RUNTIME_UNAVAILABLE::Login requires the desktop app");
  }
  const result = await invoke<LoginStartResult>("start_chatgpt_login");
  await openUrl(result.authUrl);
  return result;
}

export async function waitForChatGptLogin(loginId: string): Promise<DashboardSnapshot> {
  if (!isTauriRuntime()) {
    throw new Error("RUNTIME_UNAVAILABLE::Login requires the desktop app");
  }
  return invoke<DashboardSnapshot>("wait_for_chatgpt_login", { loginId });
}

export async function restartAppServer(): Promise<DashboardSnapshot> {
  if (!isTauriRuntime()) return mockSnapshot;
  return invoke<DashboardSnapshot>("restart_app_server");
}

export function parseBackendError(error: unknown): { code: string; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const separator = raw.indexOf("::");
  if (separator === -1) return { code: "UNKNOWN", message: raw };
  return { code: raw.slice(0, separator), message: raw.slice(separator + 2) };
}

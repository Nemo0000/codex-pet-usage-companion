import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  DashboardSnapshot,
  LoginStartResult,
  OfficialPetSyncResult,
  PetdexInstallResult,
  PetdexManifestResult,
  PetdexUninstallResult,
} from "../types";

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

export async function syncOfficialCustomPet(displayName: string, executablePath = ""): Promise<OfficialPetSyncResult> {
  if (!isTauriRuntime()) {
    throw new Error("RUNTIME_UNAVAILABLE::Official custom pet sync requires the Windows desktop app");
  }
  return invoke<OfficialPetSyncResult>("sync_official_custom_pet", {
    displayName,
    executablePath: executablePath.trim() || null,
  });
}

const mockPetdexManifest: PetdexManifestResult = {
  generatedAt: new Date().toISOString(),
  total: 3,
  pets: [
    {
      slug: "boba",
      displayName: "Boba",
      kind: "character",
      submittedBy: "Petdex",
      spritesheetUrl: "",
      spriteVersionNumber: 2,
      installed: false,
    },
    {
      slug: "pixel-cat",
      displayName: "Pixel Cat",
      kind: "animal",
      submittedBy: "Petdex",
      spritesheetUrl: "",
      spriteVersionNumber: 1,
      installed: true,
    },
    {
      slug: "tiny-orbit",
      displayName: "Tiny Orbit",
      kind: "mascot",
      submittedBy: "Petdex",
      spritesheetUrl: "",
      spriteVersionNumber: 2,
      installed: false,
    },
  ],
};

export async function fetchPetdexManifest(force = false): Promise<PetdexManifestResult> {
  if (!isTauriRuntime()) {
    if (import.meta.env.DEV) return mockPetdexManifest;
    throw new Error("RUNTIME_UNAVAILABLE::Petdex browsing requires the desktop app");
  }
  return invoke<PetdexManifestResult>("fetch_petdex_manifest", { force });
}

export async function installPetdexPet(slug: string): Promise<PetdexInstallResult> {
  if (!isTauriRuntime()) {
    if (import.meta.env.DEV) {
      const pet = mockPetdexManifest.pets.find((candidate) => candidate.slug === slug);
      if (!pet) throw new Error("PETDEX_NOT_FOUND::The selected pet is unavailable");
      return {
        slug: pet.slug,
        displayName: pet.displayName,
        directoryPath: `.codex/pets/${pet.slug}`,
        alreadyInstalled: pet.installed,
        spriteVersionNumber: pet.spriteVersionNumber,
        method: "petdex-community-package",
      };
    }
    throw new Error("RUNTIME_UNAVAILABLE::Petdex installation requires the desktop app");
  }
  return invoke<PetdexInstallResult>("install_petdex_pet", { slug });
}

export async function uninstallPetdexPet(slug: string): Promise<PetdexUninstallResult> {
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(slug)) {
    throw new Error("PETDEX_NOT_FOUND::The selected pet ID is invalid");
  }
  if (!isTauriRuntime()) {
    if (import.meta.env.DEV) {
      return { slug, removed: true, directoryPath: `.codex/pets/${slug}` };
    }
    throw new Error("RUNTIME_UNAVAILABLE::Petdex management requires the desktop app");
  }
  return invoke<PetdexUninstallResult>("uninstall_petdex_pet", { slug });
}

export async function openPetdexPetPage(slug: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(slug)) {
    throw new Error("PETDEX_NOT_FOUND::The selected pet ID is invalid");
  }
  const url = `https://petdex.dev/pets/${encodeURIComponent(slug)}`;
  if (isTauriRuntime()) {
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
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

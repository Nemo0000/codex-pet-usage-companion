import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { isTauriRuntime } from "./platform";
import type { Language } from "../types";
import { translate } from "../i18n";

export async function sendLowUsageNotification(
  language: Language,
  label: string,
  remainingPercent: number,
): Promise<boolean> {
  if (!isTauriRuntime()) return false;

  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (!granted) return false;

    await sendNotification({
      title: translate(language, "lowUsageNotificationTitle"),
      body: translate(language, "lowUsageNotificationBody", {
        label,
        percent: remainingPercent,
      }),
    });
    return true;
  } catch {
    // A notification is best-effort. The in-panel warning remains authoritative.
    return false;
  }
}

import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatWindowLabel,
  maskEmail,
  normalizeLimits,
  selectCompactLimit,
  severityForRemaining,
} from "./usage";

describe("usage utilities", () => {
  it("masks the local part of an email", () => {
    expect(maskEmail("sample.user@example.com")).toBe("sam••••••@example.com");
    expect(maskEmail(null)).toBe("");
  });

  it("formats known quota windows", () => {
    expect(formatWindowLabel(300, "zh-CN")).toBe("5 小时额度");
    expect(formatWindowLabel(10_080, "en")).toBe("Weekly");
  });

  it("normalizes primary and secondary windows", () => {
    const limits = normalizeLimits({
      rateLimits: {
        limitId: "codex",
        primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 2_000 },
        secondary: { usedPercent: 80, windowDurationMins: 10_080, resetsAt: 3_000 },
      },
    }, "en");

    expect(limits).toHaveLength(2);
    expect(limits[0].remainingPercent).toBe(75);
    expect(selectCompactLimit(limits)?.label).toBe("Weekly");
  });

  it("uses clear severity thresholds", () => {
    expect(severityForRemaining(75)).toBe("safe");
    expect(severityForRemaining(35)).toBe("warning");
    expect(severityForRemaining(10)).toBe("danger");
  });

  it("formats a stable countdown", () => {
    expect(formatCountdown(86_400 + 7_200, 0, "en")).toBe("1d 2h");
    expect(formatCountdown(7_200, 0, "zh-CN")).toBe("2 小时 0 分");
  });
});

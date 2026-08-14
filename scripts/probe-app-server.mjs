import { spawn } from "node:child_process";
import readline from "node:readline";

const explicitExecutable = process.env.CODEX_CLI_PATH;
const executable = explicitExecutable || (process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "codex");
const args = explicitExecutable
  ? ["app-server"]
  : process.platform === "win32"
    ? ["/d", "/s", "/c", "codex app-server"]
    : ["app-server"];
const child = spawn(executable, args, {
  stdio: ["pipe", "pipe", "ignore"],
  windowsHide: true,
});
const lines = readline.createInterface({ input: child.stdout });
const pending = new Map();
let nextId = 1;
const refreshToken = process.env.PROBE_REFRESH === "1";

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function request(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 20_000);
    pending.set(id, { resolve, reject, timeout });
    send({ method, id, params });
  });
}

lines.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  const entry = pending.get(message.id);
  if (!entry) return;
  clearTimeout(entry.timeout);
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(message.error.message || "App Server error"));
  else entry.resolve(message.result);
});

child.once("error", (error) => {
  console.error(`App Server probe failed to launch: ${error.message}`);
  process.exitCode = 1;
});

try {
  await request("initialize", {
    clientInfo: {
      name: "codex_usage_companion_probe",
      title: "Codex Usage Companion Probe",
      version: "0.1.0",
    },
    capabilities: { experimentalApi: false },
  });
  send({ method: "initialized", params: {} });
  console.log("initialize: ok");

  const accountResult = await request("account/read", { refreshToken });
  const account = accountResult?.account;
  console.log(`account: ${account ? "connected" : "not signed in"}`);
  if (process.env.PROBE_LIMITS === "1") {
    try {
      const limits = await request("account/rateLimits/read");
      console.log(`rate-limits response: ${limits ? "received" : "empty"}`);
      console.log(`rate-limit buckets: ${Object.keys(limits?.rateLimitsByLimitId || {}).length}`);
      console.log(`rate-limits keys: ${Object.keys(limits || {}).join(",") || "none"}`);
    } catch (error) {
      console.log(`rate-limits error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (account) {
    console.log(`auth type: ${account.type || "unknown"}`);
    console.log(`plan type: ${account.planType || "unknown"}`);
    const limits = await request("account/rateLimits/read");
    const buckets = limits?.rateLimitsByLimitId
      ? Object.values(limits.rateLimitsByLimitId)
      : limits?.rateLimits
        ? [limits.rateLimits]
        : [];
    const windows = buckets.flatMap((bucket) => [bucket?.primary, bucket?.secondary]).filter(Boolean);
    console.log(`rate-limit windows: ${windows.length}`);
    for (const window of windows) {
      console.log(`- used=${window.usedPercent}% duration=${window.windowDurationMins ?? "unknown"}m`);
    }
  }
} catch (error) {
  console.error(`probe: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  lines.close();
  child.kill();
}

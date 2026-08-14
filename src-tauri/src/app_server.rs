use serde_json::{json, Value};
use std::{
    env,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::mpsc::{self, Receiver, RecvTimeoutError},
    thread,
    time::{Duration, Instant},
};
use thiserror::Error;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Error)]
pub enum AppServerError {
    #[error("Codex CLI was not found on PATH")]
    CliNotFound,
    #[error("Could not launch Codex App Server: {0}")]
    Launch(String),
    #[error("Codex App Server did not respond in time")]
    Timeout,
    #[error("Codex App Server closed the local connection")]
    ConnectionClosed,
    #[error("Could not write to Codex App Server: {0}")]
    Write(String),
    #[error("Codex App Server returned an error: {0}")]
    Server(String),
    #[error("Codex App Server returned an invalid response: {0}")]
    InvalidResponse(String),
}

impl AppServerError {
    pub fn coded_message(&self) -> String {
        let code = match self {
            Self::CliNotFound => "CLI_NOT_FOUND",
            Self::Launch(_) => "APP_SERVER_LAUNCH_FAILED",
            Self::Timeout => "APP_SERVER_TIMEOUT",
            Self::ConnectionClosed => "APP_SERVER_DISCONNECTED",
            Self::Write(_) => "APP_SERVER_WRITE_FAILED",
            Self::Server(_) => "APP_SERVER_ERROR",
            Self::InvalidResponse(_) => "APP_SERVER_INVALID_RESPONSE",
        };
        format!("{code}::{self}")
    }
}

pub struct AppServerClient {
    child: Child,
    stdin: ChildStdin,
    messages: Receiver<Value>,
    next_id: u64,
}

impl AppServerClient {
    pub fn start() -> Result<Self, AppServerError> {
        let mut child = spawn_codex_app_server()?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AppServerError::Launch("stdin was unavailable".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppServerError::Launch("stdout was unavailable".into()))?;

        let (sender, messages) = mpsc::channel();
        thread::Builder::new()
            .name("codex-app-server-reader".into())
            .spawn(move || {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    if let Ok(message) = serde_json::from_str::<Value>(&line) {
                        if sender.send(message).is_err() {
                            break;
                        }
                    }
                }
            })
            .map_err(|error| AppServerError::Launch(error.to_string()))?;

        let mut client = Self {
            child,
            stdin,
            messages,
            next_id: 1,
        };

        client.request(
            "initialize",
            json!({
                "clientInfo": {
                    "name": "codex_usage_companion",
                    "title": "Codex Usage Companion",
                    "version": env!("CARGO_PKG_VERSION")
                },
                "capabilities": {
                    "experimentalApi": false,
                    "optOutNotificationMethods": [
                        "thread/started",
                        "item/started",
                        "item/completed",
                        "item/agentMessage/delta"
                    ]
                }
            }),
        )?;
        client.notify("initialized", json!({}))?;
        Ok(client)
    }

    pub fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    pub fn request(&mut self, method: &str, params: Value) -> Result<Value, AppServerError> {
        let id = self.next_id;
        self.next_id += 1;
        self.send(&json!({ "method": method, "id": id, "params": params }))?;

        let deadline = Instant::now() + REQUEST_TIMEOUT;
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(AppServerError::Timeout);
            }
            match self.messages.recv_timeout(remaining) {
                Ok(message) => {
                    if message.get("id").and_then(Value::as_u64) != Some(id) {
                        // Account and rate-limit notifications are sparse updates. v0.1.0
                        // deliberately refetches snapshots instead of persisting raw payloads.
                        continue;
                    }
                    if let Some(error) = message.get("error") {
                        let text = error
                            .get("message")
                            .and_then(Value::as_str)
                            .unwrap_or("unknown server error");
                        return Err(AppServerError::Server(text.to_string()));
                    }
                    return message
                        .get("result")
                        .cloned()
                        .ok_or_else(|| AppServerError::InvalidResponse("missing result".into()));
                }
                Err(RecvTimeoutError::Timeout) => return Err(AppServerError::Timeout),
                Err(RecvTimeoutError::Disconnected) => {
                    return Err(AppServerError::ConnectionClosed)
                }
            }
        }
    }

    fn notify(&mut self, method: &str, params: Value) -> Result<(), AppServerError> {
        self.send(&json!({ "method": method, "params": params }))
    }

    fn send(&mut self, message: &Value) -> Result<(), AppServerError> {
        let serialized = serde_json::to_string(message)
            .map_err(|error| AppServerError::Write(error.to_string()))?;
        self.stdin
            .write_all(serialized.as_bytes())
            .and_then(|_| self.stdin.write_all(b"\n"))
            .and_then(|_| self.stdin.flush())
            .map_err(|error| AppServerError::Write(error.to_string()))
    }
}

impl Drop for AppServerClient {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn explicit_codex_path() -> Option<PathBuf> {
    env::var_os("CODEX_CLI_PATH").map(PathBuf::from)
}

#[cfg(windows)]
fn spawn_codex_app_server() -> Result<Child, AppServerError> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let mut command = if let Some(path) = explicit_codex_path() {
        if !path.is_file() {
            return Err(AppServerError::CliNotFound);
        }
        let mut command = Command::new(path);
        command.arg("app-server");
        command
    } else {
        let found = Command::new("where.exe")
            .arg("codex")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
        if !found {
            return Err(AppServerError::CliNotFound);
        }
        let mut command = Command::new("cmd.exe");
        command.args(["/D", "/S", "/C", "codex app-server"]);
        command
    };

    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| AppServerError::Launch(error.to_string()))
}

#[cfg(not(windows))]
fn spawn_codex_app_server() -> Result<Child, AppServerError> {
    let executable = explicit_codex_path().unwrap_or_else(|| PathBuf::from("codex"));
    Command::new(executable)
        .arg("app-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                AppServerError::CliNotFound
            } else {
                AppServerError::Launch(error.to_string())
            }
        })
}

#[cfg(test)]
mod tests {
    use super::AppServerError;

    #[test]
    fn errors_have_stable_frontend_codes() {
        assert!(AppServerError::CliNotFound
            .coded_message()
            .starts_with("CLI_NOT_FOUND::"));
        assert!(AppServerError::Timeout
            .coded_message()
            .starts_with("APP_SERVER_TIMEOUT::"));
    }
}

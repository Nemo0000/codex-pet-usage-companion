mod app_server;

use app_server::{AppServerClient, AppServerError};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};

#[derive(Clone, Default)]
struct AppState {
    client: Arc<Mutex<Option<AppServerClient>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DashboardSnapshot {
    account: Option<Value>,
    requires_openai_auth: bool,
    rate_limits: Option<Value>,
    rate_limits_error: Option<String>,
    fetched_at: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginStartResult {
    auth_url: String,
    login_id: String,
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn with_client<T>(
    shared: &Arc<Mutex<Option<AppServerClient>>>,
    operation: impl FnOnce(&mut AppServerClient) -> Result<T, AppServerError>,
) -> Result<T, String> {
    let mut guard = shared
        .lock()
        .map_err(|_| "APP_SERVER_STATE::The local App Server lock was poisoned".to_string())?;
    let needs_start = guard
        .as_mut()
        .map(|client| !client.is_alive())
        .unwrap_or(true);
    if needs_start {
        *guard = Some(AppServerClient::start().map_err(|error| error.coded_message())?);
    }
    operation(guard.as_mut().expect("client was initialized"))
        .map_err(|error| error.coded_message())
}

fn read_snapshot(client: &mut AppServerClient) -> Result<DashboardSnapshot, AppServerError> {
    let account_result = client.request("account/read", json!({ "refreshToken": false }))?;
    let account = account_result
        .get("account")
        .filter(|value| !value.is_null())
        .cloned();
    let requires_openai_auth = account_result
        .get("requiresOpenaiAuth")
        .and_then(Value::as_bool)
        .unwrap_or(true);

    let (rate_limits, rate_limits_error) = if account.is_some() {
        match client.request("account/rateLimits/read", json!({})) {
            Ok(value) => (Some(value), None),
            Err(error) => (None, Some(error.to_string())),
        }
    } else {
        (None, None)
    };

    Ok(DashboardSnapshot {
        account,
        requires_openai_auth,
        rate_limits,
        rate_limits_error,
        fetched_at: now_millis(),
    })
}

#[tauri::command]
async fn dashboard_snapshot(state: State<'_, AppState>) -> Result<DashboardSnapshot, String> {
    let shared = state.client.clone();
    tauri::async_runtime::spawn_blocking(move || with_client(&shared, read_snapshot))
        .await
        .map_err(|error| format!("APP_SERVER_TASK::{error}"))?
}

#[tauri::command]
async fn start_chatgpt_login(state: State<'_, AppState>) -> Result<LoginStartResult, String> {
    let shared = state.client.clone();
    tauri::async_runtime::spawn_blocking(move || {
        with_client(&shared, |client| {
            let result = client.request(
                "account/login/start",
                json!({
                    "type": "chatgpt",
                    "useHostedLoginSuccessPage": true,
                    "appBrand": "codex"
                }),
            )?;
            let auth_url = result
                .get("authUrl")
                .and_then(Value::as_str)
                .ok_or_else(|| AppServerError::InvalidResponse("missing authUrl".into()))?;
            let login_id = result
                .get("loginId")
                .and_then(Value::as_str)
                .ok_or_else(|| AppServerError::InvalidResponse("missing loginId".into()))?;
            Ok(LoginStartResult {
                auth_url: auth_url.to_string(),
                login_id: login_id.to_string(),
            })
        })
    })
    .await
    .map_err(|error| format!("APP_SERVER_TASK::{error}"))?
}

#[tauri::command]
async fn restart_app_server(state: State<'_, AppState>) -> Result<DashboardSnapshot, String> {
    let shared = state.client.clone();
    tauri::async_runtime::spawn_blocking(move || {
        {
            let mut guard = shared.lock().map_err(|_| {
                "APP_SERVER_STATE::The local App Server lock was poisoned".to_string()
            })?;
            *guard = None;
        }
        with_client(&shared, read_snapshot)
    })
    .await
    .map_err(|error| format!("APP_SERVER_TASK::{error}"))?
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show panel", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh usage", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &refresh, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Codex Usage Companion")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "refresh" => {
                show_main_window(app);
                let _ = app.emit("refresh-requested", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--autostart"])
                .build(),
        )
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            dashboard_snapshot,
            start_chatgpt_login,
            restart_app_server
        ])
        .setup(|app| {
            build_tray(app.handle())?;
            let started_automatically = std::env::args().any(|argument| argument == "--autostart");
            if !started_automatically {
                show_main_window(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Codex Usage Companion");
}

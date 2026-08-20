mod app_server;
mod petdex;

use app_server::{AppServerClient, AppServerError};
use petdex::{fetch_petdex_manifest, install_petdex_pet, uninstall_petdex_pet};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    path::PathBuf,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OfficialPetSyncResult {
    pet_id: String,
    display_name: String,
    method: &'static str,
    started_process: bool,
    opened_menu: bool,
    opened_settings: bool,
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
    read_snapshot_with_refresh(client, false)
}

fn read_snapshot_with_refresh(
    client: &mut AppServerClient,
    refresh_token: bool,
) -> Result<DashboardSnapshot, AppServerError> {
    let account_result =
        client.request("account/read", json!({ "refreshToken": refresh_token }))?;
    let account = account_result
        .get("account")
        .filter(|value| !value.is_null())
        .cloned();
    let requires_openai_auth = account_result
        .get("requiresOpenaiAuth")
        .and_then(Value::as_bool)
        .unwrap_or(true);

    let (rate_limits, rate_limits_error) =
        match client.request("account/rateLimits/read", json!({})) {
            Ok(value) => (Some(value), None),
            Err(error) => (None, Some(error.to_string())),
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
async fn wait_for_chatgpt_login(
    login_id: String,
    state: State<'_, AppState>,
) -> Result<DashboardSnapshot, String> {
    let shared = state.client.clone();
    tauri::async_runtime::spawn_blocking(move || {
        with_client(&shared, |client| {
            client.wait_for_login(&login_id)?;
            read_snapshot_with_refresh(client, true)
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

pub(crate) fn codex_pets_directory() -> Result<PathBuf, String> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .ok_or_else(|| "PET_DIRECTORY::The user home directory is unavailable".to_string())?;
    Ok(PathBuf::from(home).join(".codex").join("pets"))
}

fn perform_official_custom_pet_sync(
    display_name: &str,
    executable_path: Option<&str>,
) -> Result<OfficialPetSyncResult, String> {
    let display_name = display_name.trim();
    if display_name.is_empty()
        || display_name.chars().count() > 80
        || display_name.chars().any(char::is_control)
    {
        return Err("PET_DISPLAY_NAME::The custom pet name is invalid".into());
    }

    #[cfg(target_os = "windows")]
    {
        let script = r#"
$ErrorActionPreference = "Stop"
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CodexPetWindowNative {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
} catch {
  "ERR|AUTOMATION_UNAVAILABLE"
  exit 0
}

$target = $env:CODEX_USAGE_PET_TARGET
$configuredExecutable = $env:CODEX_USAGE_PET_EXECUTABLE
$startedProcess = $false
$openedMenu = $false
$openedSettings = $false

function Get-TargetProcesses {
  @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    if ($_.ProcessName -eq "ChatGPT") { return $true }
    if ($_.ProcessName -ne "Codex") { return $false }
    try {
      return $_.Path -match "OpenAI|ChatGPT"
    } catch {
      return $_.MainWindowHandle -ne 0
    }
  })
}

function Get-InteractiveProcesses {
  @(Get-TargetProcesses | Where-Object {
    try { $_.MainWindowHandle -ne 0 } catch { $false }
  })
}

function Get-ExecutableCandidates {
  $candidates = @()
  if (-not [string]::IsNullOrWhiteSpace($configuredExecutable)) {
    $candidates += $configuredExecutable.Trim()
  }
  $candidates += @(
    "$env:LOCALAPPDATA\Programs\ChatGPT\ChatGPT.exe",
    "$env:LOCALAPPDATA\Programs\OpenAI\ChatGPT\ChatGPT.exe",
    "$env:ProgramFiles\ChatGPT\ChatGPT.exe",
    "$env:LOCALAPPDATA\Programs\Codex\Codex.exe",
    "$env:ProgramFiles\Codex\Codex.exe"
  )
  try {
    $appx = Get-AppxPackage -Name "OpenAI.Codex" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $appx -and -not [string]::IsNullOrWhiteSpace($appx.InstallLocation)) {
      $candidates += (Join-Path $appx.InstallLocation "app\ChatGPT.exe")
      $candidates += (Join-Path $appx.InstallLocation "ChatGPT.exe")
    }
  } catch {
  }
  @($candidates |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path -LiteralPath $_ -PathType Leaf) } |
    Select-Object -Unique)
}

$processes = @(Get-TargetProcesses)

if ($processes.Count -eq 0 -or @(Get-InteractiveProcesses).Count -eq 0) {
  $executable = @(Get-ExecutableCandidates) | Select-Object -First 1
  if ($null -eq $executable) {
    if ($processes.Count -eq 0) { "ERR|CHATGPT_NOT_INSTALLED" }
    else { "ERR|CHATGPT_WINDOW_NOT_READY" }
    exit 0
  }
  try {
    Start-Process -FilePath $executable | Out-Null
    $startedProcess = $true
  } catch {
    "ERR|CHATGPT_LAUNCH_FAILED"
    exit 0
  }
  for ($launchAttempt = 0; $launchAttempt -lt 40; $launchAttempt++) {
    Start-Sleep -Milliseconds 500
    $processes = @(Get-TargetProcesses)
    if ($processes.Count -gt 0 -and @(Get-InteractiveProcesses).Count -gt 0) { break }
  }
  if ($processes.Count -eq 0 -or @(Get-InteractiveProcesses).Count -eq 0) {
    "ERR|CHATGPT_LAUNCH_FAILED"
    exit 0
  }
}

function Get-WindowNodes {
  param([System.Windows.Automation.AutomationElement]$WindowRoot)
  try {
    return $WindowRoot.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition
    )
  } catch {
    return @()
  }
}

function Get-AppWindows {
  $desktop = [System.Windows.Automation.AutomationElement]::RootElement
  $windows = @()
  foreach ($process in @(Get-TargetProcesses)) {
    try {
      $condition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
        $process.Id
      )
      $windows += @($desktop.FindAll(
        [System.Windows.Automation.TreeScope]::Children,
        $condition
      ))
    } catch {
    }
  }
  return @($windows)
}

function Activate-AppWindow {
  param([System.Windows.Automation.AutomationElement]$WindowRoot)
  try {
    $windowHandle = [IntPtr]$WindowRoot.Current.NativeWindowHandle
    if ($windowHandle -ne [IntPtr]::Zero) {
      [CodexPetWindowNative]::ShowWindowAsync($windowHandle, 9) | Out-Null
      [CodexPetWindowNative]::SetForegroundWindow($windowHandle) | Out-Null
      Start-Sleep -Milliseconds 300
      return $true
    }
  } catch {
  }
  return $false
}

function Get-PrimaryAppWindow {
  foreach ($window in @(Get-AppWindows)) {
    try {
      if ([IntPtr]$window.Current.NativeWindowHandle -ne [IntPtr]::Zero -and
          -not $window.Current.IsOffscreen) {
        return $window
      }
    } catch {
    }
  }
  return $null
}

function Get-PetsWindow {
  $desktop = [System.Windows.Automation.AutomationElement]::RootElement
  $processes = @(Get-TargetProcesses)
  foreach ($process in $processes) {
    $condition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
      $process.Id
    )
    $windows = $desktop.FindAll(
      [System.Windows.Automation.TreeScope]::Children,
      $condition
    )
    foreach ($window in $windows) {
      try {
        $windowNodes = $window.FindAll(
          [System.Windows.Automation.TreeScope]::Descendants,
          [System.Windows.Automation.Condition]::TrueCondition
        )
        $refresh = $windowNodes | Where-Object {
          try {
            $_.Current.ControlType.ProgrammaticName -eq "ControlType.Button" -and
              $_.Current.Name -in @("Refresh", "刷新", "Refresh pets", "刷新宠物", "Reload", "重新加载")
          } catch { $false }
        } | Select-Object -First 1
        if ($null -ne $refresh) { return $window }
        $hasPetsLabel = @($windowNodes | Where-Object {
          try { $_.Current.Name -in @("Pets", "宠物") -and -not $_.Current.IsOffscreen } catch { $false }
        }).Count -gt 0
        $hasSelectButton = @($windowNodes | Where-Object {
          try {
            $_.Current.ControlType.ProgrammaticName -eq "ControlType.Button" -and
              $_.Current.Name -in @("Select", "选择") -and -not $_.Current.IsOffscreen
          } catch { $false }
        }).Count -gt 0
        if ($hasPetsLabel -and $hasSelectButton) { return $window }
      } catch {
      }
    }
  }
  return $null
}

function Invoke-Node {
  param([System.Windows.Automation.AutomationElement]$Node)
  try { $Node.SetFocus() } catch { }
  try {
    $pattern = $Node.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $pattern.Invoke()
    return $true
  } catch {
  }
  try {
    $pattern = $Node.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
    $pattern.Select()
    return $true
  } catch {
  }
  try {
    $pattern = $Node.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)
    $pattern.Expand()
    return $true
  } catch {
  }
  try {
    $pattern = $Node.GetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern)
    $pattern.DoDefaultAction()
    return $true
  } catch {
  }
  return $false
}

function Invoke-NamedControl {
  param([string[]]$Names)
  $desktop = [System.Windows.Automation.AutomationElement]::RootElement
  $processes = @(Get-TargetProcesses)
  foreach ($process in $processes) {
    $condition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
      $process.Id
    )
    $windows = $desktop.FindAll(
      [System.Windows.Automation.TreeScope]::Children,
      $condition
    )
    foreach ($window in $windows) {
      foreach ($node in @(Get-WindowNodes $window)) {
        try {
          if ($node.Current.Name -notin $Names -or $node.Current.IsOffscreen) { continue }
          if ($node.Current.ControlType.ProgrammaticName -notin @(
            "ControlType.Button", "ControlType.MenuItem", "ControlType.TabItem", "ControlType.ListItem", "ControlType.Hyperlink"
          )) { continue }
           if (Invoke-Node $node) { return $true }
        } catch {
        }
      }
    }
  }
  return $false
}

if ($null -eq (Get-PetsWindow)) {
  $primaryWindow = Get-PrimaryAppWindow
  if ($null -ne $primaryWindow) { Activate-AppWindow $primaryWindow | Out-Null }
  if (Invoke-NamedControl @("Settings", "设置")) {
    $openedSettings = $true
  } elseif (Invoke-NamedControl @(
    "Menu", "Open menu", "Open navigation", "Navigation menu", "More", "Account menu", "Profile menu", "User menu", "Open account menu", "更多", "菜单", "打开菜单", "打开导航菜单", "账户菜单", "用户菜单"
  )) {
    $openedMenu = $true
    Start-Sleep -Milliseconds 400
    if (Invoke-NamedControl @("Settings", "设置")) {
      $openedSettings = $true
    }
  }
  for ($navigationAttempt = 0; $navigationAttempt -lt 40; $navigationAttempt++) {
    Start-Sleep -Milliseconds 350
    if ($null -ne (Get-PetsWindow)) { break }
    if (Invoke-NamedControl @("Pets", "宠物", "Pet settings", "宠物设置")) {
      $openedSettings = $true
      Start-Sleep -Milliseconds 350
    }
  }
}

function Find-RowButton {
  param(
    [System.Windows.Automation.AutomationElement]$WindowRoot,
    [string]$TargetName,
    [string[]]$ButtonNames
  )
  try {
    $allNodes = $WindowRoot.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition
    )
  } catch {
    return $null
  }

  $targetNodes = @($allNodes | Where-Object {
    try {
       ($_.Current.Name -eq $TargetName -or $_.Current.Name.StartsWith($TargetName, [System.StringComparison]::OrdinalIgnoreCase)) -and
        $_.Current.ControlType.ProgrammaticName -ne "ControlType.Button" -and
        -not $_.Current.IsOffscreen
    } catch { $false }
  })
  $best = $null
  $bestScore = [double]::PositiveInfinity
  foreach ($targetNode in $targetNodes) {
    try {
      $targetRect = $targetNode.Current.BoundingRectangle
      if ($targetRect.Width -le 0 -or $targetRect.Height -le 0) { continue }
      $targetCenterY = $targetRect.Y + $targetRect.Height / 2
      foreach ($node in $allNodes) {
        try {
          if (
            $node.Current.ControlType.ProgrammaticName -ne "ControlType.Button" -or
             (($node.Current.Name -notin $ButtonNames) -and
               ($node.Current.AutomationId -notmatch "(?i)select|choose|selected")) -or
            $node.Current.IsOffscreen
          ) { continue }
          $buttonRect = $node.Current.BoundingRectangle
          if ($buttonRect.X -le $targetRect.X + $targetRect.Width) { continue }
          $deltaY = [math]::Abs(
            ($buttonRect.Y + $buttonRect.Height / 2) - $targetCenterY
          )
          if ($deltaY -gt 48) { continue }
          $score = $deltaY * 10000 + ($buttonRect.X - $targetRect.X)
          if ($score -lt $bestScore) {
            $best = $node
            $bestScore = $score
          }
        } catch {
        }
      }
    } catch {
    }
  }
  return $best
}

$root = Get-PetsWindow

if ($null -eq $root) {
  "ERR|SETTINGS_NAVIGATION_FAILED"
  exit 0
}

$windowHandle = [IntPtr]$root.Current.NativeWindowHandle
if ($windowHandle -ne [IntPtr]::Zero) {
  [CodexPetWindowNative]::ShowWindowAsync($windowHandle, 9) | Out-Null
  [CodexPetWindowNative]::SetForegroundWindow($windowHandle) | Out-Null
  Start-Sleep -Milliseconds 350
  $root = Get-PetsWindow
}

try {
  $nodes = $root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )
  $refreshButton = $nodes | Where-Object {
    try {
      $_.Current.ControlType.ProgrammaticName -eq "ControlType.Button" -and
        $_.Current.Name -in @("Refresh", "刷新", "Refresh pets", "刷新宠物", "Reload", "重新加载")
    } catch { $false }
  } | Select-Object -First 1
  if ($null -eq $refreshButton) { throw "refresh button missing" }
  if (-not (Invoke-Node $refreshButton)) { throw "refresh invoke failed" }
} catch {
  "ERR|PETS_REFRESH_FAILED"
  exit 0
}

$targetNodes = @()
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  Start-Sleep -Milliseconds 350
  $root = Get-PetsWindow
  if ($null -eq $root) { continue }
  $nodes = $root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )
  $targetNodes = @($nodes | Where-Object {
    try {
       ($_.Current.Name -eq $target -or $_.Current.Name.StartsWith($target, [System.StringComparison]::OrdinalIgnoreCase)) -and
        $_.Current.ControlType.ProgrammaticName -ne "ControlType.Button"
    } catch { $false }
  })
  if ($targetNodes.Count -eq 0) { continue }
  $visibleTarget = $targetNodes | Where-Object {
    try { -not $_.Current.IsOffscreen } catch { $false }
  } | Select-Object -First 1
  if ($null -ne $visibleTarget) { break }
  try {
    $scrollPattern = $targetNodes[0].GetCurrentPattern(
      [System.Windows.Automation.ScrollItemPattern]::Pattern
    )
    $scrollPattern.ScrollIntoView()
  } catch {
  }
}

if ($targetNodes.Count -eq 0) {
  "ERR|CUSTOM_PET_NOT_FOUND"
  exit 0
}

$selectedNames = @("Selected", "已选", "Selected $target", "已选 $target")
$selectNames = @("Select", "选择", "Select $target", "选择 $target")
$selectedButton = Find-RowButton -WindowRoot $root -TargetName $target -ButtonNames $selectedNames
if ($null -ne $selectedButton) {
  if ($startedProcess) { "INFO|STARTED" }
  if ($openedMenu) { "INFO|MENU_OPENED" }
  if ($openedSettings) { "INFO|SETTINGS_OPENED" }
  "OK|$target"
  exit 0
}

$selectButton = Find-RowButton -WindowRoot $root -TargetName $target -ButtonNames $selectNames
if ($null -eq $selectButton -or -not $selectButton.Current.IsEnabled) {
  "ERR|SELECT_BUTTON_NOT_FOUND"
  exit 0
}

try {
  if (-not (Invoke-Node $selectButton)) { throw "select invoke failed" }
} catch {
  "ERR|SELECT_INVOKE_FAILED"
  exit 0
}

for ($verifyAttempt = 0; $verifyAttempt -lt 32; $verifyAttempt++) {
  Start-Sleep -Milliseconds 250
  $currentRoot = Get-PetsWindow
  if ($null -eq $currentRoot) { continue }
  $selectedButton = Find-RowButton -WindowRoot $currentRoot -TargetName $target -ButtonNames $selectedNames
  if ($null -ne $selectedButton) {
    if ($startedProcess) { "INFO|STARTED" }
    if ($openedMenu) { "INFO|MENU_OPENED" }
    if ($openedSettings) { "INFO|SETTINGS_OPENED" }
    "OK|$target"
    exit 0
  }
}

"ERR|SELECTION_NOT_CONFIRMED"
"#;

        let output = {
            use std::os::windows::process::CommandExt;

            std::process::Command::new("powershell.exe")
                .args([
                    "-NoLogo",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Sta",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    script,
                ])
                .env("CODEX_USAGE_PET_TARGET", display_name)
                .env(
                    "CODEX_USAGE_PET_EXECUTABLE",
                    executable_path.unwrap_or_default(),
                )
                .creation_flags(0x08000000)
                .output()
        }
        .map_err(|error| {
            format!("POWERSHELL_START_FAILED::Could not start Windows UI Automation ({error})")
        })?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let started_process = stdout.lines().any(|line| line.trim() == "INFO|STARTED");
        let opened_menu = stdout.lines().any(|line| line.trim() == "INFO|MENU_OPENED");
        let opened_settings = stdout
            .lines()
            .any(|line| line.trim() == "INFO|SETTINGS_OPENED");
        let result_line = stdout
            .lines()
            .map(str::trim)
            .find(|line| line.starts_with("OK|") || line.starts_with("ERR|"))
            .unwrap_or("");
        if let Some(selected_name) = result_line.strip_prefix("OK|") {
            return Ok(OfficialPetSyncResult {
                pet_id: "custom".to_string(),
                display_name: selected_name.to_string(),
                method: "windows-ui-automation",
                started_process,
                opened_menu,
                opened_settings,
            });
        }

        let code = result_line
            .strip_prefix("ERR|")
            .unwrap_or("AUTOMATION_FAILED");
        let message = match code {
            "CHATGPT_NOT_RUNNING" => "Open the official ChatGPT desktop app first.",
            "CHATGPT_NOT_INSTALLED" => {
                "ChatGPT desktop was not found. Configure its executable path in Settings."
            }
            "CHATGPT_LAUNCH_FAILED" => {
                "ChatGPT desktop could not be started. Check the path or open it manually."
            }
            "CHATGPT_WINDOW_NOT_READY" => {
                "ChatGPT desktop is running, but its window is not ready for automation yet. Try again in a moment."
            }
            "SETTINGS_NAVIGATION_FAILED" => {
                "The desktop app opened, but Settings > Pets could not be opened automatically."
            }
            "PETS_SETTINGS_NOT_OPEN" => "Open ChatGPT Settings > Pets, then try again.",
            "PETS_REFRESH_FAILED" => "The official Pets list could not be refreshed.",
            "CUSTOM_PET_NOT_FOUND" => "The installed custom pet did not appear after refresh.",
            "SELECT_BUTTON_NOT_FOUND" => {
                "The custom pet was found, but its Select button was unavailable."
            }
            "SELECT_INVOKE_FAILED" => "The custom pet Select button could not be invoked.",
            "SELECTION_NOT_CONFIRMED" => {
                "The official Pets page did not confirm the selected custom pet."
            }
            _ => "The custom pet could not be selected.",
        };
        Err(format!("{code}::{message}"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = display_name;
        let _ = executable_path;
        Err("UNSUPPORTED_PLATFORM::Official custom pet sync is currently Windows-only".into())
    }
}

#[tauri::command]
async fn sync_official_custom_pet(
    display_name: String,
    executable_path: Option<String>,
) -> Result<OfficialPetSyncResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        perform_official_custom_pet_sync(&display_name, executable_path.as_deref())
    })
    .await
    .map_err(|error| format!("OFFICIAL_CUSTOM_PET_TASK::{error}"))?
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
        .tooltip("Codex Pet & Usage Companion")
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

#[cfg(test)]
mod tests {
    use super::perform_official_custom_pet_sync;

    #[cfg(target_os = "windows")]
    #[test]
    #[ignore = "requires the official Codex Pets page and CODEX_USAGE_TEST_PET"]
    fn selects_a_live_custom_pet_through_windows_ui_automation() {
        let target = std::env::var("CODEX_USAGE_TEST_PET")
            .expect("CODEX_USAGE_TEST_PET must name a visible installed custom pet");
        let result = perform_official_custom_pet_sync(&target, None)
            .expect("the official Pets page should select and confirm the target pet");
        assert_eq!(result.display_name, target);
        assert_eq!(result.method, "windows-ui-automation");
    }
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
            wait_for_chatgpt_login,
            restart_app_server,
            sync_official_custom_pet,
            fetch_petdex_manifest,
            install_petdex_pet,
            uninstall_petdex_pet
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

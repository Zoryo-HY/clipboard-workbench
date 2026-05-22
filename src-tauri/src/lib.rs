mod clipboard;
mod db;
mod tray;

use std::sync::{Arc, Mutex};
use std::time::Instant;
use sha2::{Sha256, Digest};
use tauri::{Manager, Emitter};

pub struct AppState {
    db: Arc<Mutex<rusqlite::Connection>>,
    last_written: Arc<Mutex<(String, Instant)>>,
    last_hash: Arc<Mutex<String>>,
    data_dir: std::path::PathBuf,
    default_data_dir: std::path::PathBuf,
    last_active_label: Arc<Mutex<String>>,
    window_visible: Arc<Mutex<bool>>,
}

#[tauri::command]
fn get_history(state: tauri::State<AppState>, limit: u32, offset: u32) -> Result<Vec<db::ClipboardItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::get_history(&conn, limit, offset).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_full_content(state: tauri::State<AppState>, id: i64) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::get_item_content(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_to_clipboard(state: tauri::State<AppState>, text: String) -> Result<(), String> {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    let hash = format!("{:x}", hasher.finalize());

    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(&text).map_err(|e| e.to_string())?;

    let mut lw = state.last_written.lock().map_err(|e| e.to_string())?;
    *lw = (hash, Instant::now());

    Ok(())
}

#[tauri::command]
fn copy_to_clipboard(state: tauri::State<AppState>, id: i64) -> Result<(), String> {
    let content_type = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::get_item_type(&conn, id).map_err(|e| e.to_string())?
    };

    if content_type == "image" {
        let path = {
            let conn = state.db.lock().map_err(|e| e.to_string())?;
            db::get_item_content(&conn, id).map_err(|e| e.to_string())?
        };
        let img = image::open(&path).map_err(|e| format!("Failed to open image: {}", e))?;
        let rgba = img.to_rgba8();
        let (w, h) = rgba.dimensions();
        let img_data = arboard::ImageData {
            width: w as usize,
            height: h as usize,
            bytes: rgba.into_raw().into(),
        };
        let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        cb.set_image(img_data).map_err(|e| e.to_string())?;
    } else {
        let content = {
            let conn = state.db.lock().map_err(|e| e.to_string())?;
            db::get_item_content(&conn, id).map_err(|e| e.to_string())?
        };
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        let hash = format!("{:x}", hasher.finalize());
        let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        cb.set_text(&content).map_err(|e| e.to_string())?;
        let mut lw = state.last_written.lock().map_err(|e| e.to_string())?;
        *lw = (hash, Instant::now());
    }

    Ok(())
}

#[tauri::command]
fn toggle_favorite(state: tauri::State<AppState>, id: i64) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::toggle_favorite(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_item(state: tauri::State<AppState>, id: i64) -> Result<(), String> {
    // Get content before deleting (for file cleanup)
    let (content_type, content) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let ct = db::get_item_type(&conn, id).map_err(|e| e.to_string())?;
        let c = db::get_item_content(&conn, id).map_err(|e| e.to_string())?;
        (ct, c)
    };

    // Delete from DB
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::delete_item(&conn, id).map_err(|e| e.to_string())?;
    }

    // Only delete image files (copies created by the app).
    // "file" type entries point to original user files — must not touch them.
    if content_type == "image" {
        let _ = std::fs::remove_file(&content);
    }

    // Set last_hash to deleted content so monitor skips it
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    if let Ok(mut lw) = state.last_written.lock() {
        *lw = (hash.clone(), Instant::now());
    }
    if let Ok(mut lh) = state.last_hash.lock() {
        *lh = hash;
    }

    Ok(())
}

#[tauri::command]
fn clear_history(state: tauri::State<AppState>) -> Result<(), String> {
    let image_paths = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::clear_history(&conn).map_err(|e| e.to_string())?
    };
    for path in &image_paths {
        let _ = std::fs::remove_file(path);
    }
    // Clear monitor hash so clipboard content can be re-detected
    if let Ok(mut lh) = state.last_hash.lock() {
        *lh = String::new();
    }
    if let Ok(mut lw) = state.last_written.lock() {
        *lw = (String::new(), Instant::now());
    }
    Ok(())
}

#[tauri::command]
fn clear_cache(state: tauri::State<AppState>) -> Result<String, String> {
    let mut total_freed: u64 = 0;
    let images_dir = state.data_dir.join("images");

    // Delete image files not referenced by any DB record
    if images_dir.exists() {
        if let Ok(conn) = state.db.lock() {
            // Get all image paths currently in DB
            let mut stmt = conn.prepare(
                "SELECT content FROM clipboard_items WHERE content_type = 'image'"
            ).map_err(|e| e.to_string())?;
            let db_paths: Vec<String> = stmt.query_map([], |row| row.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();

            // Scan images directory for orphans
            if let Ok(entries) = std::fs::read_dir(&images_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        let path_str = path.to_string_lossy().to_string();
                        if !db_paths.iter().any(|p| p == &path_str) {
                            let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                            if std::fs::remove_file(&path).is_ok() {
                                total_freed += size;
                            }
                        }
                    }
                }
            }
        }
    }

    let msg = if total_freed > 0 {
        let mb = total_freed as f64 / (1024.0 * 1024.0);
        format!("已清理 {:.1} MB 缓存", mb)
    } else {
        "无需清理，缓存已是最新状态".into()
    };
    Ok(msg)
}

#[tauri::command]
fn get_settings(state: tauri::State<AppState>) -> Result<db::Settings, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut settings = db::get_settings(&conn).map_err(|e| e.to_string())?;

    // Always overlay storage_path from config file (authoritative source)
    let config_path = state.default_data_dir.join("storage_path.txt");
    if config_path.exists() {
        if let Ok(s) = std::fs::read_to_string(&config_path) {
            let trimmed = s.trim().to_string();
            if !trimmed.is_empty() {
                settings.storage_path = trimmed;
            }
        }
    }
    Ok(settings)
}

#[tauri::command]
fn update_settings(app: tauri::AppHandle, state: tauri::State<AppState>, settings: db::Settings) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_settings(&conn, &settings).map_err(|e| e.to_string())?;

    // Persist storage_path to plain-text file at default location.
    let config_path = state.default_data_dir.join("storage_path.txt");
    let log_path = state.default_data_dir.join("debug.log");
    let log_msg = format!(
        "update_settings called: storage_path='{}', config_path='{}', default_data_dir='{}'\n",
        settings.storage_path,
        config_path.display(),
        state.default_data_dir.display(),
    );
    let _ = std::fs::write(&log_path, &log_msg);
    if let Err(e) = std::fs::write(&config_path, settings.storage_path.trim()) {
        let _ = std::fs::write(&log_path, format!("{}ERROR: {}\n", log_msg, e));
    }
    let _ = app.emit("settings-changed", &settings);
    Ok(())
}

#[tauri::command]
fn minimize_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.minimize();
    }
}

#[tauri::command]
fn toggle_maximize_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_maximized().unwrap_or(false) {
            let _ = w.unmaximize();
        } else {
            let _ = w.maximize();
        }
    }
}

#[tauri::command]
fn close_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.close();
    }
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn open_file_location(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .args(["/select,", &path])
        .spawn()
        .map_err(|e| format!("{}", e))?;
    Ok(())
}

#[tauri::command]
fn open_image(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("文件不存在: {}", path));
    }
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &path])
        .spawn()
        .map_err(|e| format!("无法打开文件: {}", e))?;
    Ok(())
}

#[tauri::command]
fn pick_folder() -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new().pick_folder();
    Ok(folder.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn get_data_dir(state: tauri::State<AppState>) -> String {
    state.data_dir.to_string_lossy().to_string()
}

#[tauri::command]
fn open_data_dir(state: tauri::State<AppState>) -> Result<(), String> {
    let path = state.data_dir.to_string_lossy().to_string();
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("无法打开文件夹: {}", e))?;
    Ok(())
}

// ── Window switching ──

fn update_active_label(state: &AppState, label: &str) {
    if let Ok(mut l) = state.last_active_label.lock() {
        *l = label.to_string();
    }
}

#[tauri::command]
fn switch_to_mini(state: tauri::State<AppState>, app: tauri::AppHandle) -> Result<(), String> {
    update_active_label(&state, "mini");
    if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); }
    if let Some(w) = app.get_webview_window("mini") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    if let Ok(mut v) = state.window_visible.lock() { *v = true; }
    eprintln!("[switch] → mini window");
    Ok(())
}

#[tauri::command]
fn switch_to_main(state: tauri::State<AppState>, app: tauri::AppHandle) -> Result<(), String> {
    update_active_label(&state, "main");
    if let Some(w) = app.get_webview_window("mini") { let _ = w.hide(); }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    if let Ok(mut v) = state.window_visible.lock() { *v = true; }
    eprintln!("[switch] → main window");
    Ok(())
}

#[tauri::command]
fn toggle_active_window(state: tauri::State<AppState>, app: tauri::AppHandle) -> Result<(), String> {
    let label = state.last_active_label.lock().map_err(|e| e.to_string())?.clone();
    let label = if label.is_empty() { "main".to_string() } else { label };
    if let Some(w) = app.get_webview_window(&label) {
        let visible = *state.window_visible.lock().map_err(|e| e.to_string())?;
        if visible {
            let _ = w.hide();
            if let Ok(mut v) = state.window_visible.lock() { *v = false; }
            eprintln!("[toggle] hide {}", label);
        } else {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
            if let Ok(mut v) = state.window_visible.lock() { *v = true; }
            eprintln!("[toggle] show {}", label);
        }
    }
    Ok(())
}

// ── Clear item (mini window soft-delete) ──

#[tauri::command]
fn clear_item(state: tauri::State<AppState>, app: tauri::AppHandle, id: i64) -> Result<(), String> {
    // Get content before clearing so we can compute hash
    let content = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::get_item_content(&conn, id).map_err(|e| e.to_string())?
    };
    let deleted_file = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::clear_item(&conn, id).map_err(|e| e.to_string())?
    };
    if let Some(path) = deleted_file {
        let _ = std::fs::remove_file(&path);
        eprintln!("[clear_item] deleted cached file: {}", path);
    }
    // Set last_hash to cleared content so monitor skips it
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    if let Ok(mut lw) = state.last_written.lock() {
        *lw = (hash.clone(), Instant::now());
    }
    if let Ok(mut lh) = state.last_hash.lock() {
        *lh = hash;
    }
    let item = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::get_item_by_id(&conn, id).map_err(|e| e.to_string())?
    };
    let _ = app.emit("item-cleared", item);
    eprintln!("[clear_item] id={} cleared", id);
    Ok(())
}

// ── Screenshot: invoke Windows native snipping tool ──

#[tauri::command]
fn take_screenshot() -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "ms-screenclip:"])
            .spawn()
            .map_err(|e| format!("{}", e))?;
        eprintln!("[screenshot] launched ms-screenclip:");
    }
    #[cfg(not(windows))]
    { let _ = (); }
    Ok(())
}

// ── Shortcut config ──

#[tauri::command]
fn get_shortcut_config(state: tauri::State<AppState>) -> Result<db::ShortcutConfig, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::get_shortcut_config(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_shortcut(state: tauri::State<AppState>, app: tauri::AppHandle, modifiers: String, key: String) -> Result<(), String> {
    let config = db::ShortcutConfig { modifiers: modifiers.clone(), key: key.clone() };
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::update_shortcut_config(&conn, &config).map_err(|e| e.to_string())?;
    }
    // Re-register shortcut
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    let mods = parse_modifiers(&modifiers);
    let code = parse_key_code(&key);
    if let (Some(m), Some(c)) = (mods, code) {
        let shortcut = Shortcut::new(Some(m), c);
        app.global_shortcut().unregister_all().map_err(|e| format!("{}", e))?;
        app.global_shortcut().register(shortcut).map_err(|e| format!("{}", e))?;
        eprintln!("[shortcut] re-registered: {:?}+{:?}", modifiers, key);
    }
    Ok(())
}

fn parse_modifiers(s: &str) -> Option<tauri_plugin_global_shortcut::Modifiers> {
    use tauri_plugin_global_shortcut::Modifiers;
    match s.to_lowercase().as_str() {
        "control" => Some(Modifiers::CONTROL),
        "alt" => Some(Modifiers::ALT),
        "super" | "meta" => Some(Modifiers::SUPER),
        "shift" => Some(Modifiers::SHIFT),
        "control+shift" => Some(Modifiers::CONTROL.union(Modifiers::SHIFT)),
        "control+alt" => Some(Modifiers::CONTROL.union(Modifiers::ALT)),
        "alt+shift" => Some(Modifiers::ALT.union(Modifiers::SHIFT)),
        _ => None,
    }
}

fn parse_key_code(s: &str) -> Option<tauri_plugin_global_shortcut::Code> {
    use tauri_plugin_global_shortcut::Code;
    match s.to_lowercase().as_str() {
        "space" => Some(Code::Space),
        "a" => Some(Code::KeyA), "b" => Some(Code::KeyB), "c" => Some(Code::KeyC),
        "d" => Some(Code::KeyD), "e" => Some(Code::KeyE), "f" => Some(Code::KeyF),
        "g" => Some(Code::KeyG), "h" => Some(Code::KeyH), "i" => Some(Code::KeyI),
        "j" => Some(Code::KeyJ), "k" => Some(Code::KeyK), "l" => Some(Code::KeyL),
        "m" => Some(Code::KeyM), "n" => Some(Code::KeyN), "o" => Some(Code::KeyO),
        "p" => Some(Code::KeyP), "q" => Some(Code::KeyQ), "r" => Some(Code::KeyR),
        "s" => Some(Code::KeyS), "t" => Some(Code::KeyT), "u" => Some(Code::KeyU),
        "v" => Some(Code::KeyV), "w" => Some(Code::KeyW), "x" => Some(Code::KeyX),
        "y" => Some(Code::KeyY), "z" => Some(Code::KeyZ),
        "0" => Some(Code::Digit0), "1" => Some(Code::Digit1), "2" => Some(Code::Digit2),
        "3" => Some(Code::Digit3), "4" => Some(Code::Digit4), "5" => Some(Code::Digit5),
        "6" => Some(Code::Digit6), "7" => Some(Code::Digit7), "8" => Some(Code::Digit8),
        "9" => Some(Code::Digit9),
        "f1" => Some(Code::F1), "f2" => Some(Code::F2), "f3" => Some(Code::F3),
        "f4" => Some(Code::F4), "f5" => Some(Code::F5), "f6" => Some(Code::F6),
        "f7" => Some(Code::F7), "f8" => Some(Code::F8), "f9" => Some(Code::F9),
        "f10" => Some(Code::F10), "f11" => Some(Code::F11), "f12" => Some(Code::F12),
        "escape" => Some(Code::Escape), "enter" => Some(Code::Enter),
        "tab" => Some(Code::Tab), "backspace" => Some(Code::Backspace),
        _ => None,
    }
}

#[tauri::command]
fn set_auto_start(enable: bool, state: tauri::State<AppState>) -> Result<bool, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_path = exe.to_string_lossy().to_string();
    if enable {
        let output = std::process::Command::new("reg")
            .args(["add", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                   "/v", "CopyBox", "/t", "REG_SZ",
                   "/d", &exe_path, "/f"])
            .output()
            .map_err(|e| format!("reg add failed: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("reg add error: {}", stderr));
        }
    } else {
        let output = std::process::Command::new("reg")
            .args(["delete", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                   "/v", "CopyBox", "/f"])
            .output()
            .map_err(|e| format!("reg delete failed: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("reg delete error: {}", stderr));
        }
    }
    // Persist to DB
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let val = if enable { "true" } else { "false" };
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_start', ?1)", rusqlite::params![val])
        .map_err(|e| e.to_string())?;
    Ok(enable)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    if event.state == ShortcutState::Pressed {
                        let state = app.state::<AppState>();
                        let label = state.last_active_label.lock()
                            .map(|l| l.clone())
                            .unwrap_or_else(|_| "main".to_string());
                        let label = if label.is_empty() { "main".to_string() } else { label };
                        if let Some(w) = app.get_webview_window(&label) {
                            let visible = *state.window_visible.lock().unwrap_or_else(|e| e.into_inner());
                            if visible {
                                let _ = w.hide();
                                if let Ok(mut v) = state.window_visible.lock() { *v = false; }
                            } else {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                                if let Ok(mut v) = state.window_visible.lock() { *v = true; }
                            }
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let default_data_dir = app.path().app_data_dir()?;
            eprintln!("[setup] default_data_dir={}", default_data_dir.display());
            std::fs::create_dir_all(&default_data_dir)?;

            // Read storage_path from plain-text config at DEFAULT location.
            // Must live outside the DB since the DB path depends on this setting.
            let config_path = default_data_dir.join("storage_path.txt");
            let custom_path = std::fs::read_to_string(&config_path)
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
            eprintln!("[setup] config_path={}, custom_path='{}'", config_path.display(), custom_path);

            // Determine actual data directory
            let data_dir = if custom_path.is_empty() {
                default_data_dir.clone()
            } else {
                std::path::PathBuf::from(&custom_path)
            };

            eprintln!("[setup] data_dir={}", data_dir.display());

            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("clipboard.db");
            let conn = rusqlite::Connection::open(&db_path)?;
            db::init(&conn)?;

            // Sync storage_path from config file into the DB so get_settings returns it
            if !custom_path.is_empty() {
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO settings (key, value) VALUES ('storage_path', ?1)",
                    rusqlite::params![&custom_path],
                );
            }

            let db = Arc::new(Mutex::new(conn));
            let last_written = Arc::new(Mutex::new((String::new(), Instant::now())));
            let last_hash = Arc::new(Mutex::new(String::new()));
            let last_active_label = Arc::new(Mutex::new("main".to_string()));
            let window_visible = Arc::new(Mutex::new(true));

            app.manage(AppState {
                db: db.clone(),
                last_written: last_written.clone(),
                last_hash: last_hash.clone(),
                data_dir: data_dir.clone(),
                default_data_dir: default_data_dir.clone(),
                last_active_label: last_active_label.clone(),
                window_visible: window_visible.clone(),
            });

            let images_dir = data_dir.join("images");
            std::fs::create_dir_all(&images_dir)?;

            tray::setup(app)?;

            let handle = app.handle().clone();
            clipboard::start_monitoring(db.clone(), handle, images_dir, last_written, last_hash);

            use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
            let sc = {
                let db_lock = db.lock().map_err(|e| format!("{}", e))?;
                db::get_shortcut_config(&db_lock).unwrap_or(db::ShortcutConfig {
                    modifiers: "Control".to_string(),
                    key: "Space".to_string(),
                })
            };
            let mods = parse_modifiers(&sc.modifiers);
            let code = parse_key_code(&sc.key);
            if let (Some(m), Some(c)) = (mods, code) {
                let shortcut = Shortcut::new(Some(m), c);
                app.global_shortcut().register(shortcut)
                    .map_err(|e| format!("{}", e))?;
                eprintln!("[startup] shortcut: {:?}+{:?}", sc.modifiers, sc.key);
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();

                let handle = app.handle().clone();
                let label_ref = last_active_label.clone();
                let vis_ref = window_visible.clone();
                window.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::CloseRequested { api, .. } => {
                            api.prevent_close();
                            if let Some(w) = handle.get_webview_window("main") { let _ = w.hide(); }
                            if let Ok(mut l) = label_ref.lock() { *l = "main".to_string(); }
                            if let Ok(mut v) = vis_ref.lock() { *v = false; }
                        }
                        tauri::WindowEvent::Focused(focused) if *focused => {
                            if let Ok(mut l) = label_ref.lock() { *l = "main".to_string(); }
                            if let Ok(mut v) = vis_ref.lock() { *v = true; }
                        }
                        _ => {}
                    }
                });
            }

            if let Some(window) = app.get_webview_window("mini") {
                let label_ref = last_active_label.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(focused) = event {
                        if *focused {
                            if let Ok(mut l) = label_ref.lock() { *l = "mini".to_string(); }
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_history,
            get_full_content,
            write_to_clipboard,
            copy_to_clipboard,
            toggle_favorite,
            delete_item,
            clear_history,
            clear_cache,
            get_settings,
            update_settings,
            minimize_window,
            toggle_maximize_window,
            close_window,
            hide_window,
            open_file_location,
            open_image,
            pick_folder,
            get_data_dir,
            open_data_dir,
            switch_to_mini,
            switch_to_main,
            toggle_active_window,
            clear_item,
            take_screenshot,
            get_shortcut_config,
            update_shortcut,
            set_auto_start,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

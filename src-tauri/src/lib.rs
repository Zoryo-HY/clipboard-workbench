mod clipboard;
mod db;
mod tray;

use std::sync::{Arc, Mutex};
use std::time::Instant;
use sha2::{Sha256, Digest};
use tauri::Manager;

struct AppState {
    db: Arc<Mutex<rusqlite::Connection>>,
    last_written: Arc<Mutex<(String, Instant)>>,
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
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_item(&conn, id).map_err(|e| e.to_string())
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
    Ok(())
}

#[tauri::command]
fn get_settings(state: tauri::State<AppState>) -> Result<db::Settings, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::get_settings(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_settings(state: tauri::State<AppState>, settings: db::Settings) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_settings(&conn, &settings).map_err(|e| e.to_string())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    if event.state == ShortcutState::Pressed {
                        if let Some(w) = app.get_webview_window("main") {
                            match w.is_visible() {
                                Ok(true) => { let _ = w.hide(); }
                                _ => { let _ = w.show(); let _ = w.set_focus(); }
                            }
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("clipboard.db");
            let conn = rusqlite::Connection::open(&db_path)?;
            db::init(&conn)?;

            let start_minimized = db::get_settings(&conn)
                .map(|s| s.start_minimized)
                .unwrap_or(false);

            let db = Arc::new(Mutex::new(conn));
            let last_written = Arc::new(Mutex::new((String::new(), Instant::now())));

            app.manage(AppState {
                db: db.clone(),
                last_written: last_written.clone(),
            });

            let images_dir = app_data_dir.join("images");
            std::fs::create_dir_all(&images_dir)?;

            tray::setup(app)?;

            let handle = app.handle().clone();
            clipboard::start_monitoring(db, handle, images_dir, last_written);

            use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, Modifiers, Code};
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::Space);
            app.global_shortcut().register(shortcut)
                .map_err(|e| format!("{}", e))?;

            if let Some(window) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(w) = handle.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                });

                if start_minimized {
                    let _ = window.hide();
                }
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
            get_settings,
            update_settings,
            hide_window,
            open_file_location,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

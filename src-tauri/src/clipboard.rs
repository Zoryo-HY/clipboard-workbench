use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use sha2::{Sha256, Digest};
use tauri::{AppHandle, Emitter};
use crate::db;

pub fn start_monitoring(db: Arc<Mutex<Connection>>, handle: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(1));

        let mut clipboard = match arboard::Clipboard::new() {
            Ok(c) => c,
            Err(_) => {
                let _ = handle.emit("clipboard-error", "Failed to open clipboard");
                return;
            }
        };

        let mut last_hash = String::new();

        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));

            match clipboard.get_text() {
                Ok(text) => {
                    if text.is_empty() {
                        continue;
                    }

                    let mut hasher = Sha256::new();
                    hasher.update(text.as_bytes());
                    let hash = format!("{:x}", hasher.finalize());

                    if hash == last_hash {
                        continue;
                    }
                    last_hash = hash.clone();

                    if let Ok(conn) = db.lock() {
                        let settings = db::get_settings(&conn).unwrap_or(db::Settings {
                            max_text_length: 10000,
                            max_image_size_mb: 10,
                            max_file_size_mb: 50,
                            total_storage_limit_mb: 500,
                            auto_clean_days: 30,
                        });

                        let max_len = settings.max_text_length as usize;
                        let content = if text.len() > max_len {
                            text.chars().take(max_len).collect::<String>()
                        } else {
                            text.clone()
                        };
                        let size = content.len() as i64;

                        match db::insert_item(&conn, "text", &content, &hash, size) {
                            Ok(id) if id > 0 => {
                                let item = db::ClipboardItem {
                                    id,
                                    content_type: "text".to_string(),
                                    content: preview(&content, 200),
                                    size,
                                    is_favorite: false,
                                    created_at: chrono::Utc::now().to_rfc3339(),
                                };
                                let _ = handle.emit("clipboard-changed", &item);
                            }
                            Ok(_) => { /* duplicate, ignored */ }
                            Err(e) => {
                                let _ = handle.emit("clipboard-error", format!("DB: {}", e));
                            }
                        }
                    }
                }
                Err(_) => {
                    last_hash.clear();
                }
            }
        }
    });
}

fn preview(text: &str, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

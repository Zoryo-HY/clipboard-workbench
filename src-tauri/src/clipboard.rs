use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use std::time::Instant;
use rusqlite::Connection;
use sha2::{Sha256, Digest};
use image::ImageEncoder;
use tauri::{AppHandle, Emitter};
use crate::db;

pub fn start_monitoring(
    db: Arc<Mutex<Connection>>,
    handle: AppHandle,
    images_dir: PathBuf,
    last_written: Arc<Mutex<(String, Instant)>>,
) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(1));

        let mut last_hash = String::new();
        let mut tick: u64 = 0;

        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            tick += 1;

            // Skip if we just wrote to clipboard ourselves (500ms cooldown)
            {
                let lw = last_written.lock().unwrap();
                if lw.1.elapsed().as_millis() < 500 && !lw.0.is_empty() {
                    last_hash = lw.0.clone();
                    continue;
                }
            }

            // Periodic cleanup every 60 ticks (~30 seconds)
            if tick % 60 == 0 {
                if let Ok(conn) = db.lock() {
                    if let Ok(settings) = db::get_settings(&conn) {
                        if settings.auto_clean_days > 0 {
                            if let Ok(n) = db::cleanup_old_items(&conn, settings.auto_clean_days) {
                                if n > 0 {
                                    eprintln!("[cleanup] removed {} expired items", n);
                                }
                            }
                        }
                        if settings.total_storage_limit_mb > 0 {
                            let _ = db::enforce_storage_limit(&conn, settings.total_storage_limit_mb);
                        }
                    }
                }
            }

            let mut clipboard = match arboard::Clipboard::new() {
                Ok(cb) => cb,
                Err(_) => continue,
            };

            // Read settings first (short lock)
            let settings = match db.lock() {
                Ok(conn) => db::get_settings(&conn).unwrap_or(db::Settings {
                    max_text_length: 10000,
                    max_image_size_mb: 10,
                    max_file_size_mb: 50,
                    total_storage_limit_mb: 500,
                    auto_clean_days: 30,
                    start_minimized: false,
                }),
                Err(_) => continue,
            };

            // Try text first (more common)
            if let Ok(text) = clipboard.get_text() {
                if !text.is_empty() {
                    let mut hasher = Sha256::new();
                    hasher.update(text.as_bytes());
                    let hash = format!("{:x}", hasher.finalize());

                    if hash != last_hash {
                        let content_type = classify_text(&text);
                        let max_len = settings.max_text_length as usize;
                        let content: String = text.chars().take(max_len).collect();
                        let size = content.len() as i64;
                        let preview = content.chars().take(300).collect::<String>();

                        let inserted = match db.lock() {
                            Ok(conn) => db::insert_item(&conn, content_type, &content, &hash, size).unwrap_or(0),
                            Err(_) => 0,
                        };

                        if inserted > 0 {
                            last_hash = hash;
                            let item = db::ClipboardItem {
                                id: inserted,
                                content_type: content_type.to_string(),
                                content: preview,
                                size,
                                is_favorite: false,
                                created_at: chrono::Utc::now().to_rfc3339(),
                            };
                            let _ = handle.emit("clipboard-changed", &item);
                        }
                    }
                }
                continue;
            }

            // Try image second
            if let Ok(img) = clipboard.get_image() {
                let mut hasher = Sha256::new();
                hasher.update(&img.bytes);
                let hash = format!("{:x}", hasher.finalize());

                if hash == last_hash {
                    continue;
                }

                let size_mb = (img.width * img.height * 4) as f64 / (1024.0 * 1024.0);
                if size_mb > settings.max_image_size_mb as f64 {
                    continue;
                }

                // Check if this hash already exists in DB
                let already_exists = match db.lock() {
                    Ok(conn) => db::hash_exists(&conn, &hash).unwrap_or(false),
                    Err(_) => false,
                };
                if already_exists {
                    last_hash = hash;
                    continue;
                }

                // Encode PNG to memory
                let mut png_bytes = Vec::new();
                let encoder = image::codecs::png::PngEncoder::new(&mut png_bytes);
                if encoder.write_image(
                    &img.bytes,
                    img.width as u32,
                    img.height as u32,
                    image::ExtendedColorType::Rgba8,
                ).is_err() {
                    eprintln!("[image] PNG encode failed");
                    continue;
                }

                // Write file
                std::fs::create_dir_all(&images_dir).ok();
                let timestamp = chrono::Utc::now().timestamp_millis();
                let filename = format!("clipboard_{}.png", timestamp);
                let filepath = images_dir.join(&filename);
                let path_str = filepath.to_string_lossy().to_string();

                if std::fs::write(&filepath, &png_bytes).is_err() {
                    eprintln!("[image] file write failed: {}", path_str);
                    continue;
                }

                let size = png_bytes.len() as i64;

                // Insert into DB (short lock)
                let inserted = match db.lock() {
                    Ok(conn) => db::insert_item(&conn, "image", &path_str, &hash, size).unwrap_or(0),
                    Err(_) => 0,
                };

                if inserted > 0 {
                    last_hash = hash;
                    let item = db::ClipboardItem {
                        id: inserted,
                        content_type: "image".to_string(),
                        content: path_str,
                        size,
                        is_favorite: false,
                        created_at: chrono::Utc::now().to_rfc3339(),
                    };
                    let _ = handle.emit("clipboard-changed", &item);
                } else {
                    // Duplicate — clean up orphan file
                    let _ = std::fs::remove_file(&filepath);
                }
            }
        }
    });
}

fn classify_text(text: &str) -> &str {
    let trimmed = text.trim();

    if (trimmed.starts_with("http://") || trimmed.starts_with("https://"))
        && !trimmed.contains('\n')
        && !trimmed.contains(' ')
    {
        return "link";
    }

    if trimmed.starts_with("C:\\") || trimmed.starts_with("D:\\") {
        let path = std::path::Path::new(trimmed);
        if path.exists() && path.is_file() {
            return "file";
        }
    }

    let first_lines: &str = &trimmed.chars().take(500).collect::<String>();
    let indicators = [
        "def ", "class ", "import ", "from ", "if __name__",
        "function ", "const ", "let ", "var ", "=>", "export ",
        "#!/bin/", "curl ", "npm ", "pip ", "git ", "sudo ",
        "<!DOCTYPE", "<html",
        "fn ", "pub fn", "use ", "impl ",
    ];
    for indicator in &indicators {
        if first_lines.contains(indicator) {
            return "code";
        }
    }

    "text"
}

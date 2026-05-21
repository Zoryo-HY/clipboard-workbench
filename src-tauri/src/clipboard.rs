use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use rusqlite::Connection;
use sha2::{Sha256, Digest};
use image::ImageEncoder;
use tauri::{AppHandle, Emitter};
use crate::db;

pub fn start_monitoring(db: Arc<Mutex<Connection>>, handle: AppHandle, images_dir: PathBuf) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(1));

        let mut last_hash = String::new();

        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));

            if let Ok(conn) = db.lock() {
                let settings = db::get_settings(&conn).unwrap_or(db::Settings {
                    max_text_length: 10000,
                    max_image_size_mb: 10,
                    max_file_size_mb: 50,
                    total_storage_limit_mb: 500,
                    auto_clean_days: 30,
                });

                // 1. Try image first
                if let Ok(img) = arboard::Clipboard::new()
                    .and_then(|mut cb| cb.get_image())
                {
                    if let Some(item) = handle_image(&img, &images_dir, &settings, &conn) {
                        let _ = handle.emit("clipboard-changed", &item);
                        last_hash.clear();
                        continue;
                    }
                }

                // 2. Try text (includes file path detection)
                if let Ok(text) = arboard::Clipboard::new()
                    .and_then(|mut cb| cb.get_text())
                {
                    if text.is_empty() {
                        continue;
                    }
                    let content_type = classify_text(&text);
                    if let Some(item) = handle_text(&text, content_type, &settings, &conn, &mut last_hash) {
                        let _ = handle.emit("clipboard-changed", &item);
                    }
                }
            }
        }
    });
}

fn handle_image(
    img: &arboard::ImageData,
    images_dir: &PathBuf,
    settings: &db::Settings,
    conn: &Connection,
) -> Option<db::ClipboardItem> {
    let size_mb = (img.width * img.height * 4) as f64 / (1024.0 * 1024.0);
    if size_mb > settings.max_image_size_mb as f64 {
        return None;
    }

    std::fs::create_dir_all(images_dir).ok()?;

    let timestamp = chrono::Utc::now().timestamp_millis();
    let filename = format!("clipboard_{}.png", timestamp);
    let filepath = images_dir.join(&filename);

    // Save RGBA as PNG using image crate
    let mut png_bytes = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut png_bytes);
    encoder.write_image(
        &img.bytes,
        img.width as u32,
        img.height as u32,
        image::ExtendedColorType::Rgba8,
    ).ok()?;
    std::fs::write(&filepath, &png_bytes).ok()?;

    let path_str = filepath.to_string_lossy().to_string();

    let mut hasher = Sha256::new();
    hasher.update(path_str.as_bytes());
    let hash = format!("{:x}", hasher.finalize());

    let size = std::fs::metadata(&filepath).map(|m| m.len() as i64).unwrap_or(0);

    match db::insert_item(conn, "image", &path_str, &hash, size) {
        Ok(id) if id > 0 => Some(db::ClipboardItem {
            id,
            content_type: "image".to_string(),
            content: path_str,
            size,
            is_favorite: false,
            created_at: chrono::Utc::now().to_rfc3339(),
        }),
        _ => None,
    }
}

fn handle_text(
    text: &str,
    content_type: &str,
    settings: &db::Settings,
    conn: &Connection,
    last_hash: &mut String,
) -> Option<db::ClipboardItem> {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    let hash = format!("{:x}", hasher.finalize());

    if hash == *last_hash {
        return None;
    }
    *last_hash = hash.clone();

    let max_len = settings.max_text_length as usize;
    let content: String = text.chars().take(max_len).collect();
    let size = content.len() as i64;

    match db::insert_item(conn, content_type, &content, &hash, size) {
        Ok(id) if id > 0 => Some(db::ClipboardItem {
            id,
            content_type: content_type.to_string(),
            content: preview(&content, 300),
            size,
            is_favorite: false,
            created_at: chrono::Utc::now().to_rfc3339(),
        }),
        _ => None,
    }
}

fn classify_text(text: &str) -> &str {
    let trimmed = text.trim();

    // URL
    if (trimmed.starts_with("http://") || trimmed.starts_with("https://"))
        && !trimmed.contains('\n')
        && !trimmed.contains(' ')
    {
        return "link";
    }

    // File path (Windows)
    if trimmed.starts_with("C:\\") || trimmed.starts_with("D:\\") {
        let path = std::path::Path::new(trimmed);
        if path.exists() && path.is_file() {
            return "file";
        }
    }

    // Code detection
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

fn preview(text: &str, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use std::time::Instant;
use rusqlite::Connection;
use sha2::{Sha256, Digest};
use image::ImageEncoder;
use base64::Engine;
use tauri::{AppHandle, Emitter};
use crate::db;

// ── Windows file clipboard (CF_HDROP) ──

#[cfg(windows)]
mod file_clipboard {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use std::path::PathBuf;

    #[link(name = "user32")]
    extern "system" {
        fn OpenClipboard(hWndNewOwner: isize) -> i32;
        fn CloseClipboard() -> i32;
        fn GetClipboardData(uFormat: u32) -> isize;
    }

    #[link(name = "shell32")]
    extern "system" {
        fn DragQueryFileW(hDrop: isize, iFile: u32, lpszFile: *mut u16, cch: u32) -> u32;
    }

    const CF_HDROP: u32 = 15;

    /// Read file paths from the Windows clipboard (CF_HDROP format).
    /// Returns None if no files are on the clipboard.
    pub fn read() -> Option<Vec<PathBuf>> {
        unsafe {
            if OpenClipboard(0) == 0 {
                return None;
            }

            let hdrop = GetClipboardData(CF_HDROP);
            if hdrop == 0 {
                CloseClipboard();
                return None;
            }

            let count = DragQueryFileW(hdrop, 0xFFFFFFFF, std::ptr::null_mut(), 0);
            if count == 0 {
                CloseClipboard();
                return None;
            }

            let mut files = Vec::with_capacity(count as usize);
            for i in 0..count {
                let len = DragQueryFileW(hdrop, i, std::ptr::null_mut(), 0) as usize;
                if len == 0 {
                    continue;
                }
                let mut buf = vec![0u16; len + 1];
                let written = DragQueryFileW(hdrop, i, buf.as_mut_ptr(), buf.len() as u32) as usize;
                buf.truncate(written);
                files.push(PathBuf::from(OsString::from_wide(&buf)));
            }

            CloseClipboard();
            Some(files)
        }
    }
}

#[cfg(not(windows))]
mod file_clipboard {
    use std::path::PathBuf;
    pub fn read() -> Option<Vec<PathBuf>> {
        None
    }
}

// ── Thumbnail generation ──

fn generate_thumbnail_base64(rgba: &[u8], w: u32, h: u32) -> Option<String> {
    let img = image::RgbaImage::from_raw(w, h, rgba.to_vec())?;
    let dyn_img = image::DynamicImage::ImageRgba8(img);
    let thumb = dyn_img.thumbnail(200, 200);
    let mut buf = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut buf);
    encoder.write_image(
        thumb.as_bytes(),
        thumb.width(),
        thumb.height(),
        image::ExtendedColorType::Rgba8,
    ).ok()?;
    Some(base64::engine::general_purpose::STANDARD.encode(&buf))
}

// ── Atomic upsert event ──

#[derive(Clone, serde::Serialize)]
struct ChangeEvent {
    #[serde(skip_serializing_if = "Option::is_none")]
    old_id: Option<i64>,
    #[serde(flatten)]
    item: db::ClipboardItem,
}

// ── Monitoring ──

static MONITOR_STARTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn start_monitoring(
    db: Arc<Mutex<Connection>>,
    handle: AppHandle,
    images_dir: PathBuf,
    last_written: Arc<Mutex<(String, Instant)>>,
) {
    if MONITOR_STARTED.swap(true, std::sync::atomic::Ordering::SeqCst) {
        eprintln!("[monitor] ERROR: already running — refusing to spawn duplicate thread");
        return;
    }
    eprintln!("[monitor] starting (thread={:?})", std::thread::current().id());

    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(1));

        let mut last_hash = String::new();
        let mut tick: u64 = 0;

        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            tick += 1;

            // ── Debounce: skip if we just wrote to clipboard ourselves ──
            {
                let lw = last_written.lock().unwrap();
                if lw.1.elapsed().as_millis() < 500 && !lw.0.is_empty() {
                    eprintln!("[monitor t={}] debounce skip (last_written < 500ms)", tick);
                    last_hash = lw.0.clone();
                    continue;
                }
            }

            // ── Periodic cleanup ──
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

            // Load settings (needed every iteration for size checks)
            let settings = match db.lock() {
                Ok(conn) => db::get_settings(&conn).unwrap_or(db::Settings {
                    max_text_length: 10000,
                    max_image_size_mb: 10,
                    max_file_size_mb: 50,
                    total_storage_limit_mb: 500,
                    auto_clean_days: 30,
                    start_minimized: false,
                    storage_path: String::new(),
                }),
                Err(_) => continue,
            };

            // ═══════════════════════════════════════════════════════
            // 1. File clipboard (Windows CF_HDROP) — highest priority
            // ═══════════════════════════════════════════════════════
            if let Some(files) = file_clipboard::read() {
                if !files.is_empty() {
                    // Build file list text for hashing
                    let file_text = files.iter()
                        .map(|p| p.to_string_lossy().to_string())
                        .collect::<Vec<_>>()
                        .join("\n");

                    let mut hasher = Sha256::new();
                    hasher.update(file_text.as_bytes());
                    let hash = format!("{:x}", hasher.finalize());

                    eprintln!("[monitor t={}] CF_HDROP: {} file(s), hash={:.12}", tick, files.len(), hash);

                    if hash == last_hash {
                        eprintln!("[monitor t={}] file: same hash, skip", tick);
                        continue;
                    }

                    // Use first file as representative; store full list as content
                    let first_path = files[0].to_string_lossy().to_string();
                    let total_size: i64 = files.iter()
                        .filter_map(|p| std::fs::metadata(p).ok())
                        .map(|m| m.len() as i64)
                        .sum();

                    if total_size > settings.max_file_size_mb * 1024 * 1024 {
                        eprintln!("[monitor t={}] file: size {} > limit, skip", tick, total_size);
                        continue;
                    }

                    let (new_id, old_id, _) = match db.lock() {
                        Ok(conn) => db::insert_item(&conn, "file", &first_path, &hash, total_size, None)
                            .unwrap_or((0, None, None)),
                        Err(_) => (0, None, None),
                    };

                    if new_id > 0 {
                        last_hash = hash;
                        eprintln!("[monitor t={}] file: saved id={} old_id={:?}", tick, new_id, old_id);
                        let _ = handle.emit("clipboard-changed", ChangeEvent {
                            old_id,
                            item: db::ClipboardItem {
                                id: new_id,
                                content_type: "file".to_string(),
                                content: first_path,
                                thumbnail: None,
                                size: total_size,
                                is_favorite: false,
                                created_at: chrono::Utc::now().to_rfc3339(),
                            },
                        });
                    }
                    continue; // files take priority, skip text/image
                }
            }

            // ═══════════════════════════════════════════════════════
            // 2. Read text/image via arboard
            // ═══════════════════════════════════════════════════════
            let mut clipboard = match arboard::Clipboard::new() {
                Ok(cb) => cb,
                Err(e) => {
                    eprintln!("[monitor t={}] clipboard open failed: {}", tick, e);
                    continue;
                }
            };

            let text_result = clipboard.get_text();
            let img_result = clipboard.get_image();

            // ═══════════════════════════════════════════════════════
            // 3. Image
            // ═══════════════════════════════════════════════════════
            let mut image_done = false;
            if let Ok(ref img) = img_result {
                let mut hasher = Sha256::new();
                hasher.update(&img.bytes);
                let hash = format!("{:x}", hasher.finalize());

                eprintln!("[monitor t={}] image: {}x{} hash={:.12}", tick, img.width, img.height, hash);

                if hash == last_hash {
                    eprintln!("[monitor t={}] image: same hash, skip", tick);
                    continue;
                }

                let size_mb = (img.width * img.height * 4) as f64 / (1024.0 * 1024.0);
                if size_mb > settings.max_image_size_mb as f64 {
                    eprintln!("[monitor t={}] image: size {}MB > limit, skip", tick, size_mb);
                    continue;
                }

                let width = img.width as u32;
                let height = img.height as u32;
                let rgba = img.bytes.to_vec();

                let thumb_b64 = generate_thumbnail_base64(&rgba, width, height);

                let mut png_bytes = Vec::new();
                let encoder = image::codecs::png::PngEncoder::new(&mut png_bytes);
                if encoder.write_image(&rgba, width, height, image::ExtendedColorType::Rgba8).is_err() {
                    continue;
                }

                std::fs::create_dir_all(&images_dir).ok();
                let timestamp = chrono::Utc::now().timestamp_millis();
                let filename = format!("clipboard_{}.png", timestamp);
                let filepath = images_dir.join(&filename);
                let path_str = filepath.to_string_lossy().to_string();

                if std::fs::write(&filepath, &png_bytes).is_err() {
                    continue;
                }

                let size = png_bytes.len() as i64;
                let thumb_ref = thumb_b64.as_deref();
                let (new_id, old_id, old_content) = match db.lock() {
                    Ok(conn) => db::insert_item(&conn, "image", &path_str, &hash, size, thumb_ref)
                        .unwrap_or((0, None, None)),
                    Err(_) => (0, None, None),
                };

                if new_id > 0 {
                    if let Some(ref old_path) = old_content {
                        if *old_path != path_str {
                            let _ = std::fs::remove_file(old_path);
                        }
                    }
                    image_done = true;
                    last_hash = hash;
                    eprintln!("[monitor t={}] image: saved id={} old_id={:?}", tick, new_id, old_id);
                    let _ = handle.emit("clipboard-changed", ChangeEvent {
                        old_id,
                        item: db::ClipboardItem {
                            id: new_id,
                            content_type: "image".to_string(),
                            content: path_str,
                            thumbnail: thumb_b64,
                            size,
                            is_favorite: false,
                            created_at: chrono::Utc::now().to_rfc3339(),
                        },
                    });
                } else {
                    let _ = std::fs::remove_file(&filepath);
                }
            }

            // ═══════════════════════════════════════════════════════
            // 4. Text / link / code (only if no image was saved)
            // ═══════════════════════════════════════════════════════
            if !image_done {
                if let Ok(ref text) = text_result {
                    if !text.is_empty() {
                        let mut hasher = Sha256::new();
                        hasher.update(text.as_bytes());
                        let hash = format!("{:x}", hasher.finalize());

                        let content_type = classify_text(text);
                        eprintln!("[monitor t={}] text: len={} type={} hash={:.12}", tick, text.len(), content_type, hash);

                        if hash == last_hash {
                            eprintln!("[monitor t={}] text: same hash, skip", tick);
                            continue;
                        }

                        let max_len = settings.max_text_length as usize;
                        let content: String = text.chars().take(max_len).collect();
                        let size = content.len() as i64;
                        let preview = content.chars().take(300).collect::<String>();

                        let (new_id, old_id, _) = match db.lock() {
                            Ok(conn) => db::insert_item(&conn, content_type, &content, &hash, size, None)
                                .unwrap_or((0, None, None)),
                            Err(_) => (0, None, None),
                        };

                        if new_id > 0 {
                            last_hash = hash;
                            eprintln!("[monitor t={}] text: saved id={} old_id={:?}", tick, new_id, old_id);
                            let _ = handle.emit("clipboard-changed", ChangeEvent {
                                old_id,
                                item: db::ClipboardItem {
                                    id: new_id,
                                    content_type: content_type.to_string(),
                                    content: preview,
                                    thumbnail: None,
                                    size,
                                    is_favorite: false,
                                    created_at: chrono::Utc::now().to_rfc3339(),
                                },
                            });
                        }
                    }
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

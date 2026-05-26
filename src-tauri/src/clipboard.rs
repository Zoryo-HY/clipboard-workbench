use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use std::time::Instant;
use rusqlite::{Connection, params};
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

// ── Windows HTML clipboard ──

#[cfg(windows)]
mod html_clipboard {

    #[link(name = "user32")]
    extern "system" {
        fn OpenClipboard(hWndNewOwner: isize) -> i32;
        fn CloseClipboard() -> i32;
        fn GetClipboardData(uFormat: u32) -> isize;
        fn RegisterClipboardFormatA(lpszFormat: *const u8) -> u32;
        fn GlobalLock(hMem: isize) -> *const u8;
        fn GlobalUnlock(hMem: isize) -> i32;
        fn GlobalSize(hMem: isize) -> usize;
        fn IsClipboardFormatAvailable(format: u32) -> i32;
    }

    pub fn read() -> Option<String> {
        unsafe {
            let html_format = RegisterClipboardFormatA("HTML Format\0".as_ptr());
            if html_format == 0 {
                return None;
            }

            if IsClipboardFormatAvailable(html_format) == 0 {
                return None;
            }

            if OpenClipboard(0) == 0 {
                return None;
            }

            let h_data = GetClipboardData(html_format);
            if h_data == 0 {
                CloseClipboard();
                return None;
            }

            let ptr = GlobalLock(h_data);
            if ptr.is_null() {
                CloseClipboard();
                return None;
            }

            let size = GlobalSize(h_data);
            let slice = std::slice::from_raw_parts(ptr, size);

            // Find the start of HTML: look for "<html>" or "<HTML>"
            let haystack = String::from_utf8_lossy(slice);
            let html_start = haystack.find("<html>").or_else(|| haystack.find("<HTML>")).unwrap_or(0);
            let html = haystack[html_start..].to_string();

            GlobalUnlock(h_data);
            CloseClipboard();
            Some(html)
        }
    }

    /// Check if HTML format is available on clipboard without reading full content
    pub fn available() -> bool {
        unsafe {
            let html_format = RegisterClipboardFormatA("HTML Format\0".as_ptr());
            if html_format == 0 { return false; }
            IsClipboardFormatAvailable(html_format) != 0
        }
    }
}

#[cfg(not(windows))]
mod html_clipboard {
    pub fn read() -> Option<String> { None }
    pub fn available() -> bool { false }
}

/// Scan text for URL spans. Returns list of (start_byte, end_byte) ranges.
fn extract_url_ranges(text: &str) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut search_start = 0;
    while let Some(pos) = text[search_start..].find("http") {
        let abs_pos = search_start + pos;
        let rest = &text[abs_pos..];
        if rest.starts_with("https://") || rest.starts_with("http://") {
            let after_scheme = if rest.starts_with("https://") { &rest[8..] } else { &rest[7..] };
            // URL must have at least a dot in the domain part
            if let Some(dot_pos) = after_scheme.find('.') {
                // URL ends at whitespace or certain punctuation
                let url_body_end = after_scheme.find(|c: char| {
                    c.is_whitespace() || c == '"' || c == '\'' || c == '<' || c == '>' || c == '」' || c == '）' || c == '】'
                }).unwrap_or(after_scheme.len());
                if url_body_end > dot_pos {
                    let url_len = if rest.starts_with("https://") { 8 + url_body_end } else { 7 + url_body_end };
                    ranges.push((abs_pos, abs_pos + url_len));
                    search_start = abs_pos + url_len;
                    continue;
                }
            }
        }
        search_start = abs_pos + 4;
    }
    ranges
}

/// Classify a paragraph (double-newline-separated block) as text / link / code.
fn classify_paragraph(para: &str) -> &str {
    let trimmed = para.trim();
    if trimmed.is_empty() {
        return "text";
    }

    // Single standalone URL
    if (trimmed.starts_with("http://") || trimmed.starts_with("https://"))
        && !trimmed.contains('\n') && !trimmed.contains(' ')
    {
        return "link";
    }

    classify_text(trimmed)
}

/// Split text into segments by content type.
///
/// Strategy:
/// 1. Find all URL spans in the text → each URL is a "link" segment.
/// 2. The text between URLs is split by double-newlines into paragraphs.
/// 3. Each paragraph is classified independently as text / code.
/// 4. Consecutive same-type segments are merged.
/// 5. If all segments end up the same type, collapse to a single segment.
fn segment_text(text: &str) -> Vec<(String, String)> {
    if text.is_empty() {
        return vec![];
    }

    let url_ranges = extract_url_ranges(text);

    // Build raw chunks: alternating non-URL ("raw") and URL ("link")
    let mut chunks: Vec<(String, String)> = Vec::new(); // (kind, content)
    let mut pos = 0;
    for (start, end) in &url_ranges {
        if *start > pos {
            let between = text[pos..*start].to_string();
            if !between.trim().is_empty() {
                chunks.push(("raw".into(), between));
            }
        }
        chunks.push(("link".into(), text[*start..*end].to_string()));
        pos = *end;
    }
    if pos < text.len() {
        let rest = text[pos..].to_string();
        if !rest.trim().is_empty() {
            chunks.push(("raw".into(), rest));
        }
    }

    // If no URLs found, still split by paragraphs to separate text from code
    if chunks.is_empty() {
        let paragraphs: Vec<&str> = text.split("\n\n").collect();
        if paragraphs.len() <= 1 {
            return vec![(classify_text(text).to_string(), text.to_string())];
        }
        chunks.push(("raw".into(), text.to_string()));
    }

    // Expand "raw" chunks into classified paragraphs
    let mut segments: Vec<(String, String)> = Vec::new();
    for (kind, content) in chunks {
        if kind == "link" {
            segments.push(("link".into(), content));
        } else {
            // Split raw text by double-newlines into paragraphs, classify each
            for para in content.split("\n\n") {
                let para = para.trim().to_string();
                if para.is_empty() { continue; }
                let ct = classify_paragraph(&para).to_string();
                segments.push((ct, para));
            }
        }
    }

    // Merge consecutive same-type segments
    let mut merged: Vec<(String, String)> = Vec::new();
    for (ct, content) in segments {
        if let Some((last_ct, last_content)) = merged.last_mut() {
            if last_ct == &ct {
                last_content.push_str("\n\n");
                last_content.push_str(&content);
                continue;
            }
        }
        merged.push((ct, content));
    }

    // Collapse if all same type
    if merged.len() > 1 && merged.iter().all(|(t, _)| t == &merged[0].0) {
        let combined: String = merged.into_iter().map(|(_, s)| s).collect::<Vec<_>>().join("\n\n");
        let final_type = classify_text(&combined).to_string();
        return vec![(final_type, combined)];
    }

    merged
}

/// Extract local image file paths from HTML <img src="file:///..."> tags.
/// Returns deduplicated list of existing local paths.
fn extract_html_image_paths(html: &str) -> Vec<String> {
    let mut paths: Vec<String> = Vec::new();
    let lower = html.to_lowercase();
    let mut search_start = 0;
    while let Some(img_pos) = lower[search_start..].find("<img ") {
        let tag_start = search_start + img_pos;
        let tag_end = lower[tag_start..].find('>').map(|p| tag_start + p).unwrap_or(html.len());
        let tag = &html[tag_start..tag_end];

        // Extract src attribute
        if let Some(src_start_rel) = tag.to_lowercase().find("src=\"") {
            let src_val_start = src_start_rel + 5;
            if let Some(src_end) = tag[src_val_start..].find('"') {
                let src = &tag[src_val_start..src_val_start + src_end];
                // Handle file:/// URLs
                if src.starts_with("file:///") || src.starts_with("file://") {
                    let path_str = if src.starts_with("file:///") {
                        &src[8..]  // "file:///" -> 8 chars
                    } else {
                        &src[7..]  // "file://" -> 7 chars
                    };
                    // Normalize: replace URL-encoded chars
                    let path_str = path_str.replace("%20", " ")
                        .replace("%3A", ":")
                        .replace("%5C", "\\")
                        .replace("%2F", "/");
                    // Convert forward slashes to backslashes on Windows
                    #[cfg(windows)]
                    let path_str = path_str.replace('/', "\\");
                    let path = std::path::PathBuf::from(&path_str);
                    if path.exists() && !paths.contains(&path_str) {
                        paths.push(path_str);
                    }
                }
            }
        }
        search_start = tag_end + 1;
        if search_start >= html.len() { break; }
    }
    paths
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

// ── Content item for compound detection ──

#[allow(dead_code)]
enum ContentItem {
    Text { text: String, content_type: String, hash: String, preview: String, size: i64 },
    Image { img: arboard::ImageData<'static>, hash: String },
    File { paths: Vec<PathBuf>, text: String, hash: String, first_path: String, total_size: i64 },
    RichHtml { html: String, hash: String, size: i64 },
    ImageFile { path: String, hash: String },
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
    last_hash: Arc<Mutex<String>>,
) {
    if MONITOR_STARTED.swap(true, std::sync::atomic::Ordering::SeqCst) {
        eprintln!("[monitor] ERROR: already running — refusing to spawn duplicate thread");
        return;
    }
    eprintln!("[monitor] starting (thread={:?})", std::thread::current().id());

    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(1));

        let mut tick: u64 = 0;

        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            tick += 1;

            // ── Debounce: skip if we just wrote to clipboard ourselves ──
            {
                let lw = last_written.lock().unwrap();
                if lw.1.elapsed().as_millis() < 500 && !lw.0.is_empty() {
                    eprintln!("[monitor t={}] debounce skip (last_written < 500ms)", tick);
                    if let Ok(mut lh) = last_hash.lock() {
                        *lh = lw.0.clone();
                    }
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

            // Load settings
            let settings = match db.lock() {
                Ok(conn) => db::get_settings(&conn).unwrap_or(db::Settings {
                    max_text_length: 10000,
                    max_image_size_mb: 10,
                    max_file_size_mb: 50,
                    total_storage_limit_mb: 500,
                    auto_clean_days: 30,
                    start_minimized: false,
                    storage_path: String::new(),
                    theme: "dark".into(),
                    auto_start: false,
                }),
                Err(_) => continue,
            };

            // ═══════════════════════════════════════════════════════
            // Collect all available content types in one pass
            // ═══════════════════════════════════════════════════════
            let mut clipboard = match arboard::Clipboard::new() {
                Ok(cb) => cb,
                Err(e) => {
                    eprintln!("[monitor t={}] clipboard open failed: {}", tick, e);
                    continue;
                }
            };

            let img_result = clipboard.get_image();
            let text_result = clipboard.get_text();
            let files_result = file_clipboard::read();

            eprintln!("[monitor t={}] image={} text={} files={}",
                tick,
                if img_result.is_ok() { "yes" } else { "no" },
                if text_result.as_ref().map_or(false, |t| !t.is_empty()) { "yes" } else { "no" },
                if files_result.as_ref().map_or(false, |f| !f.is_empty()) { "yes" } else { "no" },
            );

            let img_ok = img_result.ok();
            let text_ok = text_result.ok();
            let mut contents: Vec<ContentItem> = Vec::new();

            // Process image
            if let Some(ref img) = img_ok {
                let mut hasher = Sha256::new();
                hasher.update(&img.bytes);
                let hash = format!("{:x}", hasher.finalize());

                let size_mb = (img.width * img.height * 4) as f64 / (1024.0 * 1024.0);
                if size_mb <= settings.max_image_size_mb as f64 {
                    // Clone the image data into a static lifetime for later storage
                    let img_clone = arboard::ImageData {
                        width: img.width,
                        height: img.height,
                        bytes: std::borrow::Cow::Owned(img.bytes.to_vec()),
                    };
                    contents.push(ContentItem::Image { img: img_clone, hash });
                } else {
                    eprintln!("[monitor t={}] image: size {}MB > limit, skip", tick, size_mb);
                }
            }

            // Process files (only if no image covers it)
            if img_ok.is_none() {
                if let Some(ref files) = files_result {
                    if !files.is_empty() {
                        let file_text = files.iter()
                            .map(|p| p.to_string_lossy().to_string())
                            .collect::<Vec<_>>()
                            .join("\n");

                        let mut hasher = Sha256::new();
                        hasher.update(file_text.as_bytes());
                        let hash = format!("{:x}", hasher.finalize());

                        let first_path = files[0].to_string_lossy().to_string();
                        let total_size: i64 = files.iter()
                            .filter_map(|p| std::fs::metadata(p).ok())
                            .map(|m| m.len() as i64)
                            .sum();

                        if total_size <= settings.max_file_size_mb * 1024 * 1024 {
                            contents.push(ContentItem::File {
                                paths: files.clone(),
                                text: file_text,
                                hash,
                                first_path,
                                total_size,
                            });
                        }
                    }
                }
            }

            // Process text — segment by type so compounds detect link/code/text separately
            if let Some(ref text) = text_ok {
                if !text.is_empty() {
                    let max_len = settings.max_text_length as usize;
                    let text_trimmed: String = text.chars().take(max_len).collect();
                    let segments = segment_text(&text_trimmed);

                    for (content_type, seg_text) in &segments {
                        let mut hasher = Sha256::new();
                        hasher.update(seg_text.as_bytes());
                        let hash = format!("{:x}", hasher.finalize());
                        let size = seg_text.len() as i64;
                        let preview = seg_text.chars().take(300).collect::<String>();

                        contents.push(ContentItem::Text {
                            text: seg_text.clone(),
                            content_type: content_type.clone(),
                            hash,
                            preview,
                            size,
                        });
                    }

                    let seg_labels: Vec<&str> = segments.iter().map(|(t, _)| t.as_str()).collect();
                    eprintln!("[monitor t={}] text: {} segments [{}]", tick, segments.len(), seg_labels.join(", "));
                }
            }

            // ── Check HTML clipboard for rich content (images via <img> tags) ──
            if img_ok.is_none() && text_ok.is_some() && html_clipboard::available() {
                if let Some(html) = html_clipboard::read() {
                    let has_img = html.to_lowercase().contains("<img ");
                    eprintln!("[monitor t={}] html: len={} has_img={}", tick, html.len(), has_img);
                    if has_img {
                        // Try to extract local image files from <img src="file:///...">
                        let img_paths = extract_html_image_paths(&html);
                        if !img_paths.is_empty() {
                            eprintln!("[monitor t={}] html: found {} local image(s)", tick, img_paths.len());
                            for p in &img_paths {
                                let mut hasher = Sha256::new();
                                hasher.update(p.as_bytes());
                                let pf_hash = format!("{:x}", hasher.finalize());
                                contents.push(ContentItem::ImageFile { path: p.clone(), hash: pf_hash });
                            }
                        } else {
                            // No local files found — store as HTML code child
                            let mut hasher = Sha256::new();
                            hasher.update(html.as_bytes());
                            let html_hash = format!("{:x}", hasher.finalize());
                            let size = html.len() as i64;
                            contents.push(ContentItem::RichHtml { html, hash: html_hash, size });
                        }
                    }
                }
            }

            if contents.is_empty() {
                continue;
            }

            // ── Compute combined hash if compound ──
            let is_compound = contents.len() > 1;

            if is_compound {
                let mut combined_hasher = Sha256::new();
                let mut hashes: Vec<String> = Vec::new();
                for item in &contents {
                    let h = match item {
                        ContentItem::Text { hash, .. } => hash.clone(),
                        ContentItem::Image { hash, .. } => hash.clone(),
                        ContentItem::File { hash, .. } => hash.clone(),
                        ContentItem::RichHtml { hash, .. } => hash.clone(),
                        ContentItem::ImageFile { hash, .. } => hash.clone(),
                    };
                    hashes.push(h);
                }
                hashes.sort();
                for h in &hashes {
                    combined_hasher.update(h.as_bytes());
                }
                let combined_hash = format!("{:x}", combined_hasher.finalize());

                eprintln!("[monitor t={}] compound: {} types, combined_hash={:.12}", tick, contents.len(), combined_hash);

                // Check dedup
                {
                    let lh = last_hash.lock().unwrap();
                    if *lh == combined_hash {
                        eprintln!("[monitor t={}] compound: same combined_hash, skip", tick);
                        continue;
                    }
                }

                // Check DB for existing compound
                let existing = {
                    let conn = db.lock().unwrap();
                    db::find_compound_by_hash(&conn, &combined_hash).unwrap_or(None)
                };

                if let Some(parent_id) = existing {
                    let conn = db.lock().unwrap();
                    let _ = db::touch_compound(&conn, parent_id);
                    *last_hash.lock().unwrap() = combined_hash.clone();
                    eprintln!("[monitor t={}] compound: existing parent_id={}, timestamp updated", tick, parent_id);
                    // Emit event so frontend refreshes
                    let item = db::get_item_by_id(&conn, parent_id).unwrap_or(db::ClipboardItem {
                        id: parent_id,
                        parent_id: None,
                        content_type: "compound".into(),
                        content: "".into(),
                        thumbnail: None,
                        size: 0,
                        is_favorite: false,
                        is_cleared: false,
                        created_at: chrono::Utc::now().to_rfc3339(),
                        combined_hash: Some(combined_hash),
                        children: None,
                    });
                    let _ = handle.emit("clipboard-changed", ChangeEvent { old_id: None, item });
                    continue;
                }

                // Insert compound record
                let parent_id = {
                    let conn = db.lock().unwrap();
                    match db::insert_compound_parent(&conn, &combined_hash) {
                        Ok(id) => id,
                        Err(e) => { eprintln!("[monitor] compound insert failed: {}", e); continue; }
                    }
                };

                // Insert children
                let mut content_types: Vec<String> = Vec::new();
                let mut first_thumbnail: Option<String> = None;
                let mut primary_type = "text".to_string();
                let mut _primary_content = String::new();
                let mut total_size: i64 = 0;

                for item in &contents {
                    match item {
                        ContentItem::Image { img, hash } => {
                            let width = img.width as u32;
                            let height = img.height as u32;
                            let rgba = img.bytes.to_vec();

                            let thumb_b64 = generate_thumbnail_base64(&rgba, width, height);
                            if first_thumbnail.is_none() { first_thumbnail = thumb_b64.clone(); }

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
                            total_size += size;

                            let conn = db.lock().unwrap();
                            match db::insert_child(&conn, parent_id, "image", &path_str, hash, size, thumb_b64.as_deref()) {
                                Ok(cid) => eprintln!("[monitor t={}]   child: type=image(cf) id={} path={} size={} has_thumb={}", tick, cid, path_str, size, thumb_b64.is_some()),
                                Err(e) => eprintln!("[monitor t={}]   child: type=image(cf) INSERT ERROR: {}", tick, e),
                            }

                            if primary_type == "text" { primary_type = "image".into(); _primary_content = path_str.clone(); }
                            content_types.push("图片".to_string());
                        }
                        ContentItem::ImageFile { path, hash } => {
                            // Read local image file and generate thumbnail
                            let img = match image::open(path) {
                                Ok(img) => img,
                                Err(e) => { eprintln!("[monitor] ImageFile open failed: {}", e); continue; }
                            };
                            let rgba = img.to_rgba8();
                            let (w, h) = rgba.dimensions();
                            let thumb_b64 = generate_thumbnail_base64(&rgba.into_raw(), w, h);
                            if first_thumbnail.is_none() { first_thumbnail = thumb_b64.clone(); }

                            let file_size = std::fs::metadata(path).map(|m| m.len() as i64).unwrap_or(0);
                            total_size += file_size;

                            let conn = db.lock().unwrap();
                            match db::insert_child(&conn, parent_id, "image", path, hash, file_size, thumb_b64.as_deref()) {
                                Ok(cid) => eprintln!("[monitor t={}]   child: type=image id={} path={} size={} has_thumb={}", tick, cid, path, file_size, thumb_b64.is_some()),
                                Err(e) => eprintln!("[monitor t={}]   child: type=image INSERT ERROR: {}", tick, e),
                            }

                            if primary_type == "text" { primary_type = "image".into(); _primary_content = path.clone(); }
                            content_types.push("图片".to_string());
                        }
                        ContentItem::Text { text: content, content_type, hash, preview, size } => {
                            total_size += *size;
                            let conn = db.lock().unwrap();
                            match db::insert_child(&conn, parent_id, content_type, content, hash, *size, None) {
                                Ok(cid) => eprintln!("[monitor t={}]   child: type={} id={} size={} preview={:.40}", tick, cid, content_type, size, preview),
                                Err(e) => eprintln!("[monitor t={}]   child: type={} INSERT ERROR: {}", tick, e, content_type),
                            }
                            if primary_type == "text" { primary_type = content_type.clone(); _primary_content = preview.clone(); }
                            let label = match content_type.as_str() {
                                "link" => "链接", "code" => "代码", _ => "文本",
                            };
                            if !content_types.contains(&label.to_string()) {
                                content_types.push(label.to_string());
                            }
                        }
                        ContentItem::File { paths: _, text: _, hash, first_path, total_size: file_size } => {
                            total_size += *file_size;
                            let conn = db.lock().unwrap();
                            match db::insert_child(&conn, parent_id, "file", first_path, hash, *file_size, None) {
                                Ok(cid) => eprintln!("[monitor t={}]   child: type=file id={}", tick, cid),
                                Err(e) => eprintln!("[monitor t={}]   child: type=file INSERT ERROR: {}", tick, e),
                            }
                            content_types.push("文件".to_string());
                        }
                        ContentItem::RichHtml { html, hash, size } => {
                            total_size += *size;
                            let conn = db.lock().unwrap();
                            match db::insert_child(&conn, parent_id, "code", html, hash, *size, None) {
                                Ok(cid) => eprintln!("[monitor t={}]   child: type=html id={}", tick, cid),
                                Err(e) => eprintln!("[monitor t={}]   child: type=html INSERT ERROR: {}", tick, e),
                            }
                            content_types.push("网页".to_string());
                        }
                    }
                }

                // Update parent with summary info
                {
                    let conn = db.lock().unwrap();
                    let label = format!("混合内容（{}）", content_types.join(" + "));
                    let _ = conn.execute(
                        "UPDATE clipboard_items SET content = ?1, content_type = 'compound', size = ?2, thumbnail = ?3 WHERE id = ?4",
                        params![label, total_size, first_thumbnail, parent_id],
                    );
                }

                *last_hash.lock().unwrap() = combined_hash.clone();
                let summary_content = format!("混合内容（{}）", content_types.join(" + "));

                let _ = handle.emit("clipboard-changed", ChangeEvent {
                    old_id: None,
                    item: db::ClipboardItem {
                        id: parent_id,
                        parent_id: None,
                        content_type: "compound".into(),
                        content: summary_content,
                        thumbnail: first_thumbnail,
                        size: total_size,
                        is_favorite: false,
                        is_cleared: false,
                        created_at: chrono::Utc::now().to_rfc3339(),
                        combined_hash: Some(combined_hash),
                        children: None,
                    },
                });
                eprintln!("[monitor t={}] compound: saved parent_id={}", tick, parent_id);
            } else {
                // ── Single-type record (existing logic) ──
                let item = contents.into_iter().next().unwrap();
                match item {
                    ContentItem::Image { img, hash } => {
                        if hash == *last_hash.lock().unwrap() {
                            eprintln!("[monitor t={}] image: same hash, skip", tick);
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
                        let (new_id, old_id, _old_content) = match db.lock() {
                            Ok(conn) => match db::insert_item(&conn, "image", &path_str, &hash, size, thumb_ref) {
                                Ok(r) => r,
                                Err(e) => { eprintln!("[monitor t={}] image: insert_item error: {}", tick, e); (0, None, None) }
                            },
                            Err(e) => { eprintln!("[monitor t={}] image: db lock error: {}", tick, e); (0, None, None) }
                        };

                        if new_id > 0 {
                            *last_hash.lock().unwrap() = hash;
                            eprintln!("[monitor t={}] image: saved id={}", tick, new_id);
                            let _ = handle.emit("clipboard-changed", ChangeEvent {
                                old_id,
                                item: db::ClipboardItem {
                                    id: new_id,
                                    parent_id: None,
                                    content_type: "image".to_string(),
                                    content: path_str,
                                    thumbnail: thumb_b64,
                                    size,
                                    is_favorite: false,
                                    is_cleared: false,
                                    created_at: chrono::Utc::now().to_rfc3339(),
                                    combined_hash: None,
                                    children: None,
                                },
                            });
                        } else {
                            let _ = std::fs::remove_file(&filepath);
                        }
                    }
                    ContentItem::File { paths: _, text: _, hash, first_path, total_size } => {
                        if hash == *last_hash.lock().unwrap() {
                            eprintln!("[monitor t={}] file: same hash, skip", tick);
                            continue;
                        }

                        let (new_id, old_id, _old_content) = match db.lock() {
                            Ok(conn) => db::insert_item(&conn, "file", &first_path, &hash, total_size, None)
                                .unwrap_or((0, None, None)),
                            Err(_) => (0, None, None),
                        };

                        if new_id > 0 {
                            *last_hash.lock().unwrap() = hash;
                            eprintln!("[monitor t={}] file: saved id={}", tick, new_id);
                            let _ = handle.emit("clipboard-changed", ChangeEvent {
                                old_id,
                                item: db::ClipboardItem {
                                    id: new_id,
                                    parent_id: None,
                                    content_type: "file".to_string(),
                                    content: first_path,
                                    thumbnail: None,
                                    size: total_size,
                                    is_favorite: false,
                                    is_cleared: false,
                                    created_at: chrono::Utc::now().to_rfc3339(),
                                    combined_hash: None,
                                    children: None,
                                },
                            });
                        }
                    }
                    ContentItem::ImageFile { path, hash } => {
                        if hash == *last_hash.lock().unwrap() {
                            eprintln!("[monitor t={}] imagefile: same hash, skip", tick);
                            continue;
                        }
                        let img = match image::open(&path) {
                            Ok(img) => img,
                            Err(e) => { eprintln!("[monitor] ImageFile open failed: {}", e); continue; }
                        };
                        let rgba = img.to_rgba8();
                        let (w, h) = rgba.dimensions();
                        let thumb_b64 = generate_thumbnail_base64(&rgba.into_raw(), w, h);
                        let file_size = std::fs::metadata(&path).map(|m| m.len() as i64).unwrap_or(0);
                        let thumb_ref = thumb_b64.as_deref();
                        let (new_id, old_id, _old_content) = match db.lock() {
                            Ok(conn) => db::insert_item(&conn, "image", &path, &hash, file_size, thumb_ref)
                                .unwrap_or((0, None, None)),
                            Err(_) => (0, None, None),
                        };
                        if new_id > 0 {
                            *last_hash.lock().unwrap() = hash;
                            eprintln!("[monitor t={}] imagefile: saved id={}", tick, new_id);
                            let _ = handle.emit("clipboard-changed", ChangeEvent {
                                old_id,
                                item: db::ClipboardItem {
                                    id: new_id,
                                    parent_id: None,
                                    content_type: "image".to_string(),
                                    content: path.clone(),
                                    thumbnail: thumb_b64,
                                    size: file_size,
                                    is_favorite: false,
                                    is_cleared: false,
                                    created_at: chrono::Utc::now().to_rfc3339(),
                                    combined_hash: None,
                                    children: None,
                                },
                            });
                        }
                    }
                    ContentItem::RichHtml { html, hash, size } => {
                        if hash == *last_hash.lock().unwrap() {
                            eprintln!("[monitor t={}] html: same hash, skip", tick);
                            continue;
                        }
                        // Take a preview of the HTML (first 300 chars)
                        let preview = html.chars().take(300).collect::<String>();
                        let (new_id, old_id, _old_content) = match db.lock() {
                            Ok(conn) => db::insert_item(&conn, "code", &preview, &hash, size, None)
                                .unwrap_or((0, None, None)),
                            Err(_) => (0, None, None),
                        };
                        if new_id > 0 {
                            *last_hash.lock().unwrap() = hash;
                            eprintln!("[monitor t={}] html: saved id={}", tick, new_id);
                            let _ = handle.emit("clipboard-changed", ChangeEvent {
                                old_id,
                                item: db::ClipboardItem {
                                    id: new_id,
                                    parent_id: None,
                                    content_type: "code".to_string(),
                                    content: preview,
                                    thumbnail: None,
                                    size,
                                    is_favorite: false,
                                    is_cleared: false,
                                    created_at: chrono::Utc::now().to_rfc3339(),
                                    combined_hash: None,
                                    children: None,
                                },
                            });
                        }
                    }
                    ContentItem::Text { text, content_type, hash, preview: _, size } => {
                        if hash == *last_hash.lock().unwrap() {
                            eprintln!("[monitor t={}] text: same hash, skip", tick);
                            continue;
                        }

                        let (new_id, old_id, _old_content) = match db.lock() {
                            Ok(conn) => match db::insert_item(&conn, &content_type, &text, &hash, size, None) {
                                Ok(r) => r,
                                Err(e) => { eprintln!("[monitor t={}] text: insert_item error: {}", tick, e); (0, None, None) }
                            },
                            Err(e) => { eprintln!("[monitor t={}] text: db lock error: {}", tick, e); (0, None, None) }
                        };

                        if new_id > 0 {
                            eprintln!("[monitor t={}] text: saved id={} type={} hash={}", tick, new_id, content_type, hash);
                            *last_hash.lock().unwrap() = hash;
                            let _ = handle.emit("clipboard-changed", ChangeEvent {
                                old_id,
                                item: db::ClipboardItem {
                                    id: new_id,
                                    parent_id: None,
                                    content_type: content_type.to_string(),
                                    content: text,
                                    thumbnail: None,
                                    size,
                                    is_favorite: false,
                                    is_cleared: false,
                                    created_at: chrono::Utc::now().to_rfc3339(),
                                    combined_hash: None,
                                    children: None,
                                },
                            });
                        } else {
                            eprintln!("[monitor t={}] text: BUG — insert_item returned new_id=0 with no error (type={} hash={})", tick, content_type, hash);
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

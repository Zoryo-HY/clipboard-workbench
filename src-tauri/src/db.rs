use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClipboardItem {
    pub id: i64,
    pub content_type: String,
    pub content: String,
    #[serde(default)]
    pub thumbnail: Option<String>,
    pub size: i64,
    pub is_favorite: bool,
    pub is_cleared: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShortcutConfig {
    pub modifiers: String,
    pub key: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub max_text_length: i64,
    pub max_image_size_mb: i64,
    pub max_file_size_mb: i64,
    pub total_storage_limit_mb: i64,
    pub auto_clean_days: i64,
    #[serde(default)]
    pub start_minimized: bool,
    #[serde(default)]
    pub storage_path: String,
}

pub fn init(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS clipboard_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content_type TEXT NOT NULL,
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL UNIQUE,
            thumbnail TEXT,
            size INTEGER DEFAULT 0,
            is_favorite INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        INSERT OR IGNORE INTO settings (key, value) VALUES ('max_text_length', '10000');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('max_image_size_mb', '10');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('max_file_size_mb', '50');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('total_storage_limit_mb', '500');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_clean_days', '30');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('start_minimized', 'false');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('storage_path', '');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('shortcut_modifiers', 'Control');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('shortcut_key', 'Space');"
    )?;
    // Migration: add thumbnail column for existing databases
    let _ = conn.execute_batch("ALTER TABLE clipboard_items ADD COLUMN thumbnail TEXT;");
    // Migration: add is_cleared column
    let _ = conn.execute_batch("ALTER TABLE clipboard_items ADD COLUMN is_cleared INTEGER DEFAULT 0;");
    Ok(())
}

/// Insert or replace a clipboard item keyed by content_hash.
/// Returns (new_id, old_id, old_content) — old_id/old_content come from
/// the previous record if one was replaced (for cleanup + frontend sync).
pub fn insert_item(conn: &Connection, content_type: &str, content: &str, hash: &str, size: i64, thumbnail: Option<&str>) -> Result<(i64, Option<i64>, Option<String>), rusqlite::Error> {
    let old = conn.query_row(
        "SELECT id, content, is_cleared FROM clipboard_items WHERE content_hash = ?1",
        params![hash],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)? != 0)),
    ).ok();

    // If old item was cleared, re-insert as cleared (no thumbnail/preview)
    let (effective_thumb, effective_cleared) = if old.as_ref().map(|o| o.2).unwrap_or(false) {
        (None, true)
    } else {
        (thumbnail, false)
    };

    conn.execute(
        "INSERT OR REPLACE INTO clipboard_items (content_type, content, content_hash, thumbnail, size, is_cleared, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![content_type, content, hash, effective_thumb, size, effective_cleared as i64, chrono::Utc::now().to_rfc3339()],
    )?;

    let new_id = conn.last_insert_rowid();
    Ok((new_id, old.as_ref().map(|o| o.0), old.map(|o| o.1)))
}

pub fn get_history(conn: &Connection, limit: u32, offset: u32) -> Result<Vec<ClipboardItem>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, content_type, content, thumbnail, size, is_favorite, is_cleared, created_at
         FROM clipboard_items ORDER BY id DESC LIMIT ?1 OFFSET ?2"
    )?;
    let items = stmt.query_map(params![limit, offset], |row| {
        Ok(ClipboardItem {
            id: row.get(0)?,
            content_type: row.get(1)?,
            content: row.get(2)?,
            thumbnail: row.get(3)?,
            size: row.get(4)?,
            is_favorite: row.get::<_, i64>(5)? != 0,
            is_cleared: row.get::<_, i64>(6)? != 0,
            created_at: row.get(7)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(items)
}

pub fn get_item_content(conn: &Connection, id: i64) -> Result<String, rusqlite::Error> {
    conn.query_row(
        "SELECT content FROM clipboard_items WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )
}

pub fn get_item_type(conn: &Connection, id: i64) -> Result<String, rusqlite::Error> {
    conn.query_row(
        "SELECT content_type FROM clipboard_items WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )
}

pub fn get_item_by_id(conn: &Connection, id: i64) -> Result<ClipboardItem, rusqlite::Error> {
    conn.query_row(
        "SELECT id, content_type, content, thumbnail, size, is_favorite, is_cleared, created_at FROM clipboard_items WHERE id = ?1",
        params![id],
        |row| {
            Ok(ClipboardItem {
                id: row.get(0)?,
                content_type: row.get(1)?,
                content: row.get(2)?,
                thumbnail: row.get(3)?,
                size: row.get(4)?,
                is_favorite: row.get::<_, i64>(5)? != 0,
                is_cleared: row.get::<_, i64>(6)? != 0,
                created_at: row.get(7)?,
            })
        },
    )
}

pub fn toggle_favorite(conn: &Connection, id: i64) -> Result<bool, rusqlite::Error> {
    conn.execute(
        "UPDATE clipboard_items SET is_favorite = CASE WHEN is_favorite = 0 THEN 1 ELSE 0 END WHERE id = ?1",
        params![id],
    )?;
    let fav: i64 = conn.query_row(
        "SELECT is_favorite FROM clipboard_items WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    Ok(fav != 0)
}

pub fn delete_item(conn: &Connection, id: i64) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])?;
    Ok(())
}

/// Soft-clear: delete cached image file, mark is_cleared=1, clear thumbnail.
/// Returns the content (file path) if it was an image (for file deletion).
pub fn clear_item(conn: &Connection, id: i64) -> Result<Option<String>, rusqlite::Error> {
    let content_type: String = conn.query_row(
        "SELECT content_type FROM clipboard_items WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    let content: String = conn.query_row(
        "SELECT content FROM clipboard_items WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    conn.execute(
        "UPDATE clipboard_items SET is_cleared = 1, thumbnail = NULL WHERE id = ?1",
        params![id],
    )?;
    if content_type == "image" {
        Ok(Some(content))
    } else {
        Ok(None)
    }
}

pub fn get_shortcut_config(conn: &Connection) -> Result<ShortcutConfig, rusqlite::Error> {
    let get_val = |key: &str, default: &str| -> String {
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        ).unwrap_or_else(|_| default.to_string())
    };
    Ok(ShortcutConfig {
        modifiers: get_val("shortcut_modifiers", "Control"),
        key: get_val("shortcut_key", "Space"),
    })
}

pub fn update_shortcut_config(conn: &Connection, config: &ShortcutConfig) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('shortcut_modifiers', ?1)",
        params![config.modifiers],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('shortcut_key', ?1)",
        params![config.key],
    )?;
    Ok(())
}

pub fn clear_history(conn: &Connection) -> Result<Vec<String>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT content FROM clipboard_items WHERE is_favorite = 0 AND content_type = 'image'"
    )?;
    let paths: Vec<String> = stmt.query_map([], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    conn.execute("DELETE FROM clipboard_items WHERE is_favorite = 0", [])?;
    Ok(paths)
}

pub fn cleanup_old_items(conn: &Connection, days: i64) -> Result<usize, rusqlite::Error> {
    let cutoff = chrono::Utc::now() - chrono::Duration::days(days);
    let deleted = conn.execute(
        "DELETE FROM clipboard_items WHERE is_favorite = 0 AND created_at < ?1",
        params![cutoff.to_rfc3339()],
    )?;
    Ok(deleted)
}

pub fn enforce_storage_limit(conn: &Connection, max_mb: i64) -> Result<usize, rusqlite::Error> {
    let max_bytes = max_mb * 1024 * 1024;
    let total: i64 = conn.query_row(
        "SELECT COALESCE(SUM(size), 0) FROM clipboard_items",
        [],
        |row| row.get(0),
    )?;
    if total <= max_bytes {
        return Ok(0);
    }
    // Delete oldest non-favorite items until under limit
    let to_free = total - max_bytes + (10 * 1024 * 1024); // 10MB buffer
    let mut freed: i64 = 0;
    let mut deleted = 0;
    let mut stmt = conn.prepare(
        "SELECT id, size FROM clipboard_items WHERE is_favorite = 0 ORDER BY id ASC"
    )?;
    let rows: Vec<(i64, i64)> = stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?))
    })?.collect::<Result<Vec<_>, _>>()?;
    for (id, size) in rows {
        if freed >= to_free {
            break;
        }
        conn.execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])?;
        freed += size;
        deleted += 1;
    }
    Ok(deleted)
}

pub fn get_settings(conn: &Connection) -> Result<Settings, rusqlite::Error> {
    let get_val = |key: &str, default: &str| -> String {
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        ).unwrap_or_else(|_| default.to_string())
    };
    Ok(Settings {
        max_text_length: get_val("max_text_length", "10000").parse().unwrap_or(10000),
        max_image_size_mb: get_val("max_image_size_mb", "10").parse().unwrap_or(10),
        max_file_size_mb: get_val("max_file_size_mb", "50").parse().unwrap_or(50),
        total_storage_limit_mb: get_val("total_storage_limit_mb", "500").parse().unwrap_or(500),
        auto_clean_days: get_val("auto_clean_days", "30").parse().unwrap_or(30),
        start_minimized: get_val("start_minimized", "false") == "true",
        storage_path: get_val("storage_path", ""),
    })
}

pub fn update_settings(conn: &Connection, settings: &Settings) -> Result<(), rusqlite::Error> {
    let set = |key: &str, val: &str| -> Result<(), rusqlite::Error> {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, val],
        )?;
        Ok(())
    };
    set("max_text_length", &settings.max_text_length.to_string())?;
    set("max_image_size_mb", &settings.max_image_size_mb.to_string())?;
    set("max_file_size_mb", &settings.max_file_size_mb.to_string())?;
    set("total_storage_limit_mb", &settings.total_storage_limit_mb.to_string())?;
    set("auto_clean_days", &settings.auto_clean_days.to_string())?;
    set("start_minimized", if settings.start_minimized { "true" } else { "false" })?;
    set("storage_path", &settings.storage_path)?;
    Ok(())
}

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClipboardItem {
    pub id: i64,
    pub content_type: String,
    pub content: String,
    pub size: i64,
    pub is_favorite: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub max_text_length: i64,
    pub max_image_size_mb: i64,
    pub max_file_size_mb: i64,
    pub total_storage_limit_mb: i64,
    pub auto_clean_days: i64,
}

pub fn init(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS clipboard_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content_type TEXT NOT NULL,
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL UNIQUE,
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
        INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_clean_days', '30');"
    )?;
    Ok(())
}

pub fn insert_item(conn: &Connection, content_type: &str, content: &str, hash: &str, size: i64) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT OR IGNORE INTO clipboard_items (content_type, content, content_hash, size, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![content_type, content, hash, size, chrono::Utc::now().to_rfc3339()],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_history(conn: &Connection, limit: u32, offset: u32) -> Result<Vec<ClipboardItem>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, content_type, content, size, is_favorite, created_at
         FROM clipboard_items ORDER BY id DESC LIMIT ?1 OFFSET ?2"
    )?;
    let items = stmt.query_map(params![limit, offset], |row| {
        Ok(ClipboardItem {
            id: row.get(0)?,
            content_type: row.get(1)?,
            content: row.get(2)?,
            size: row.get(3)?,
            is_favorite: row.get::<_, i64>(4)? != 0,
            created_at: row.get(5)?,
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

pub fn clear_history(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM clipboard_items WHERE is_favorite = 0", [])?;
    Ok(())
}

pub fn get_settings(conn: &Connection) -> Result<Settings, rusqlite::Error> {
    let max_text: String = conn
        .query_row("SELECT value FROM settings WHERE key = 'max_text_length'", [], |row| row.get(0))
        .unwrap_or_else(|_| "10000".to_string());
    let max_img: String = conn
        .query_row("SELECT value FROM settings WHERE key = 'max_image_size_mb'", [], |row| row.get(0))
        .unwrap_or_else(|_| "10".to_string());
    let max_file: String = conn
        .query_row("SELECT value FROM settings WHERE key = 'max_file_size_mb'", [], |row| row.get(0))
        .unwrap_or_else(|_| "50".to_string());
    let storage: String = conn
        .query_row("SELECT value FROM settings WHERE key = 'total_storage_limit_mb'", [], |row| row.get(0))
        .unwrap_or_else(|_| "500".to_string());
    let clean: String = conn
        .query_row("SELECT value FROM settings WHERE key = 'auto_clean_days'", [], |row| row.get(0))
        .unwrap_or_else(|_| "30".to_string());
    Ok(Settings {
        max_text_length: max_text.parse().unwrap_or(10000),
        max_image_size_mb: max_img.parse().unwrap_or(10),
        max_file_size_mb: max_file.parse().unwrap_or(50),
        total_storage_limit_mb: storage.parse().unwrap_or(500),
        auto_clean_days: clean.parse().unwrap_or(30),
    })
}

pub fn update_settings(conn: &Connection, settings: &Settings) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('max_text_length', ?1)",
        params![settings.max_text_length.to_string()],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('max_image_size_mb', ?1)",
        params![settings.max_image_size_mb.to_string()],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('max_file_size_mb', ?1)",
        params![settings.max_file_size_mb.to_string()],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('total_storage_limit_mb', ?1)",
        params![settings.total_storage_limit_mb.to_string()],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_clean_days', ?1)",
        params![settings.auto_clean_days.to_string()],
    )?;
    Ok(())
}

use rusqlite::{Connection, params, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClipboardItem {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub content_type: String,
    pub content: String,
    #[serde(default)]
    pub thumbnail: Option<String>,
    pub size: i64,
    pub is_favorite: bool,
    pub is_cleared: bool,
    pub created_at: String,
    #[serde(default)]
    pub combined_hash: Option<String>,
    #[serde(default)]
    pub children: Option<Vec<ClipboardItem>>,
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
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub auto_start: bool,
}

fn default_theme() -> String { "dark".into() }

pub fn init(conn: &Connection) -> Result<(), rusqlite::Error> {
    // Create table if not exists (fresh install)
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS clipboard_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id INTEGER,
            content_type TEXT NOT NULL DEFAULT 'text',
            content TEXT NOT NULL DEFAULT '',
            content_hash TEXT NOT NULL DEFAULT '',
            combined_hash TEXT,
            thumbnail TEXT,
            size INTEGER DEFAULT 0,
            is_favorite INTEGER DEFAULT 0,
            is_cleared INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT ''
        );"
    )?;

    // Migrate from old schema: add missing columns
    let _ = conn.execute_batch("ALTER TABLE clipboard_items ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';");
    let _ = conn.execute_batch("ALTER TABLE clipboard_items ADD COLUMN parent_id INTEGER;");
    let _ = conn.execute_batch("ALTER TABLE clipboard_items ADD COLUMN combined_hash TEXT;");
    let _ = conn.execute_batch("ALTER TABLE clipboard_items ADD COLUMN is_cleared INTEGER DEFAULT 0;");
    let _ = conn.execute_batch("ALTER TABLE clipboard_items ADD COLUMN thumbnail TEXT;");

    // Remove UNIQUE constraint on content_hash from old schemas.
    // Old DBs had content_hash TEXT NOT NULL UNIQUE; new DBs don't need it
    // because dedup is handled by combined_hash + last_hash.
    let schema_ver: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'schema_version'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "1".into());

    // Check if content_hash still has a UNIQUE constraint (broken migration, legacy DB)
    let has_unique_on_content_hash: bool = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='clipboard_items'",
            [],
            |row| {
                let sql: String = row.get(0)?;
                Ok(sql.to_lowercase().contains("content_hash") && sql.to_lowercase().contains("unique"))
            },
        )
        .unwrap_or(false);

    if schema_ver == "1" || has_unique_on_content_hash {
        eprintln!("[db] schema_ver={} has_unique={} — rebuilding table to remove UNIQUE on content_hash", schema_ver, has_unique_on_content_hash);
        // Rebuild table without UNIQUE on content_hash, wrapped in a transaction
        let result = conn.execute_batch("BEGIN;")
            .and_then(|_| conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS clipboard_items_v2 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    parent_id INTEGER,
                    content_type TEXT NOT NULL DEFAULT 'text',
                    content TEXT NOT NULL DEFAULT '',
                    content_hash TEXT NOT NULL DEFAULT '',
                    combined_hash TEXT,
                    thumbnail TEXT,
                    size INTEGER DEFAULT 0,
                    is_favorite INTEGER DEFAULT 0,
                    is_cleared INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT ''
                );"
            ))
            .and_then(|_| conn.execute_batch(
                "INSERT INTO clipboard_items_v2 (id, parent_id, content_type, content, content_hash, combined_hash, thumbnail, size, is_favorite, is_cleared, created_at)
                 SELECT id, parent_id, content_type, content, COALESCE(content_hash, ''), combined_hash, thumbnail, COALESCE(size, 0), COALESCE(is_favorite, 0), COALESCE(is_cleared, 0), COALESCE(created_at, '')
                 FROM clipboard_items;"
            ))
            .and_then(|_| conn.execute_batch("DROP TABLE clipboard_items;"))
            .and_then(|_| conn.execute_batch("ALTER TABLE clipboard_items_v2 RENAME TO clipboard_items;"))
            .and_then(|_| conn.execute_batch("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', '2');"))
            .and_then(|_| conn.execute_batch("COMMIT;"));
        if let Err(e) = result {
            eprintln!("[db] rebuild failed: {} — rolling back", e);
            let _ = conn.execute_batch("ROLLBACK;");
        } else {
            eprintln!("[db] rebuild succeeded, UNIQUE constraint removed");
        }
    }

    // Create indexes
    let _ = conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_parent_id ON clipboard_items(parent_id);");
    let _ = conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_combined_hash ON clipboard_items(combined_hash);");
    let _ = conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_content_hash ON clipboard_items(content_hash);");

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS settings (
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
        INSERT OR IGNORE INTO settings (key, value) VALUES ('shortcut_key', 'Space');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'dark');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_start', 'false');"
    )?;

    Ok(())
}

/// Insert a standalone (single-type) item. Returns (new_id, old_id, old_content).
pub fn insert_item(conn: &Connection, content_type: &str, content: &str, hash: &str, size: i64, thumbnail: Option<&str>) -> Result<(i64, Option<i64>, Option<String>), rusqlite::Error> {
    // Find the most recent non-cleared record with this hash, or any record if all are cleared
    let old = conn.query_row(
        "SELECT id, content, is_cleared FROM clipboard_items WHERE content_hash = ?1 AND parent_id IS NULL ORDER BY is_cleared ASC, id DESC LIMIT 1",
        params![hash],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)? != 0)),
    ).ok();

    if let Some((old_id, _, _)) = old {
        conn.execute(
            "UPDATE clipboard_items SET created_at = ?1, is_cleared = 0 WHERE id = ?2",
            params![chrono::Utc::now().to_rfc3339(), old_id],
        )?;
        // Return old_id so frontend can deduplicate (remove old entry, prepend updated one)
        Ok((old_id, Some(old_id), None))
    } else {
        conn.execute(
            "INSERT INTO clipboard_items (parent_id, content_type, content, content_hash, thumbnail, size, is_cleared, created_at)
             VALUES (NULL, ?1, ?2, ?3, ?4, ?5, 0, ?6)",
            params![content_type, content, hash, thumbnail, size, chrono::Utc::now().to_rfc3339()],
        )?;
        let new_id = conn.last_insert_rowid();
        Ok((new_id, None, None))
    }
}

/// Find existing compound record by combined_hash. Returns parent_id or None.
pub fn find_compound_by_hash(conn: &Connection, combined_hash: &str) -> Result<Option<i64>, rusqlite::Error> {
    conn.query_row(
        "SELECT id FROM clipboard_items WHERE combined_hash = ?1 AND parent_id IS NULL",
        params![combined_hash],
        |row| row.get(0),
    ).optional().map(|r| r.flatten())
}

/// Update timestamp on existing compound record.
pub fn touch_compound(conn: &Connection, parent_id: i64) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE clipboard_items SET created_at = ?1, is_cleared = 0 WHERE id = ?2",
        params![chrono::Utc::now().to_rfc3339(), parent_id],
    )?;
    Ok(())
}

/// Insert a compound parent record. Returns parent_id.
pub fn insert_compound_parent(conn: &Connection, combined_hash: &str) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT INTO clipboard_items (parent_id, content_type, content, content_hash, combined_hash, size, created_at)
         VALUES (NULL, 'compound', '', ?1, ?1, 0, ?2)",
        params![combined_hash, chrono::Utc::now().to_rfc3339()],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Insert a child record under a compound parent.
pub fn insert_child(conn: &Connection, parent_id: i64, content_type: &str, content: &str, hash: &str, size: i64, thumbnail: Option<&str>) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT INTO clipboard_items (parent_id, content_type, content, content_hash, thumbnail, size, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![parent_id, content_type, content, hash, thumbnail, size, chrono::Utc::now().to_rfc3339()],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Get child records for a compound parent.
pub fn get_children(conn: &Connection, parent_id: i64) -> Result<Vec<ClipboardItem>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, parent_id, content_type, content, thumbnail, size, is_favorite, is_cleared, created_at, combined_hash
         FROM clipboard_items WHERE parent_id = ?1 ORDER BY id ASC"
    )?;
    let items = stmt.query_map(params![parent_id], |row| {
        let ct: String = row.get(2)?;
        let thumb: Option<String> = row.get(4)?;
        let id: i64 = row.get(0)?;
        eprintln!("[get_children] child id={} type={} has_thumb={}", id, ct, thumb.is_some());
        Ok(ClipboardItem {
            id,
            parent_id: row.get(1)?,
            content_type: ct,
            content: row.get(3)?,
            thumbnail: thumb,
            size: row.get(5)?,
            is_favorite: row.get::<_, i64>(6)? != 0,
            is_cleared: row.get::<_, i64>(7)? != 0,
            created_at: row.get(8)?,
            combined_hash: row.get(9)?,
            children: None,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(items)
}

/// Get history — only parent records (standalone + compound parents).
pub fn get_history(conn: &Connection, limit: u32, offset: u32) -> Result<Vec<ClipboardItem>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, parent_id, content_type, content, thumbnail, size, is_favorite, is_cleared, created_at, combined_hash
         FROM clipboard_items WHERE parent_id IS NULL ORDER BY id DESC LIMIT ?1 OFFSET ?2"
    )?;
    let items = stmt.query_map(params![limit, offset], |row| {
        Ok(ClipboardItem {
            id: row.get(0)?,
            parent_id: row.get(1)?,
            content_type: row.get(2)?,
            content: row.get(3)?,
            thumbnail: row.get(4)?,
            size: row.get(5)?,
            is_favorite: row.get::<_, i64>(6)? != 0,
            is_cleared: row.get::<_, i64>(7)? != 0,
            created_at: row.get(8)?,
            combined_hash: row.get(9)?,
            children: None,
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
        "SELECT id, parent_id, content_type, content, thumbnail, size, is_favorite, is_cleared, created_at, combined_hash
         FROM clipboard_items WHERE id = ?1",
        params![id],
        |row| {
            Ok(ClipboardItem {
                id: row.get(0)?,
                parent_id: row.get(1)?,
                content_type: row.get(2)?,
                content: row.get(3)?,
                thumbnail: row.get(4)?,
                size: row.get(5)?,
                is_favorite: row.get::<_, i64>(6)? != 0,
                is_cleared: row.get::<_, i64>(7)? != 0,
                created_at: row.get(8)?,
                combined_hash: row.get(9)?,
                children: None,
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

/// Delete an item. For compound parents, cascade deletes all children.
/// Returns list of image file paths to delete.
pub fn delete_item(conn: &Connection, id: i64) -> Result<Vec<String>, rusqlite::Error> {
    // Collect image file paths from children (if compound) or from self
    let mut paths: Vec<String> = Vec::new();

    // Check if compound parent
    let parent_id: Option<i64> = conn.query_row(
        "SELECT parent_id FROM clipboard_items WHERE id = ?1",
        params![id],
        |row| row.get(0),
    ).unwrap_or(None);

    if parent_id.is_none() {
        // Might be compound parent — collect image children paths
        let mut stmt = conn.prepare(
            "SELECT content FROM clipboard_items WHERE parent_id = ?1 AND content_type = 'image'"
        )?;
        let child_paths: Vec<String> = stmt.query_map(params![id], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        paths.extend(child_paths);

        // Delete children
        conn.execute("DELETE FROM clipboard_items WHERE parent_id = ?1", params![id])?;
    } else {
        // Is child — collect image path
        let ct: String = conn.query_row("SELECT content_type FROM clipboard_items WHERE id = ?1", params![id], |row| row.get(0))?;
        if ct == "image" {
            let c: String = conn.query_row("SELECT content FROM clipboard_items WHERE id = ?1", params![id], |row| row.get(0))?;
            paths.push(c);
        }
    }

    // Delete the record itself
    conn.execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])?;
    Ok(paths)
}

/// Soft-clear an item. For compound parents, clear all children too.
/// Returns list of image file paths to delete.
pub fn clear_item(conn: &Connection, id: i64) -> Result<(Vec<String>, Option<ClipboardItem>), rusqlite::Error> {
    let mut paths: Vec<String> = Vec::new();

    // Check if compound parent
    let (content_type, parent_id_check): (String, Option<i64>) = conn.query_row(
        "SELECT content_type, parent_id FROM clipboard_items WHERE id = ?1",
        params![id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    if content_type == "compound" || parent_id_check.is_none() {
        // Compound parent or standalone — get children image paths
        let mut stmt = conn.prepare(
            "SELECT content FROM clipboard_items WHERE parent_id = ?1 AND content_type = 'image'"
        )?;
        let child_paths: Vec<String> = stmt.query_map(params![id], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        paths.extend(child_paths);

        // Clear parent
        conn.execute(
            "UPDATE clipboard_items SET is_cleared = 1, thumbnail = NULL WHERE id = ?1",
            params![id],
        )?;
        // Clear children
        conn.execute(
            "UPDATE clipboard_items SET is_cleared = 1, thumbnail = NULL WHERE parent_id = ?1",
            params![id],
        )?;
    } else {
        // Standalone child / leaf
        if content_type == "image" {
            let c: String = conn.query_row("SELECT content FROM clipboard_items WHERE id = ?1", params![id], |row| row.get(0))?;
            paths.push(c);
        }
        conn.execute(
            "UPDATE clipboard_items SET is_cleared = 1, thumbnail = NULL WHERE id = ?1",
            params![id],
        )?;
    }

    let item = get_item_by_id(conn, id).ok();
    Ok((paths, item))
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
    // Get all image paths from children and standalone image records (non-favorite)
    let mut paths: Vec<String> = Vec::new();

    // Image children of non-favorite compound parents
    let mut stmt = conn.prepare(
        "SELECT c.content FROM clipboard_items c
         JOIN clipboard_items p ON c.parent_id = p.id
         WHERE c.content_type = 'image' AND p.is_favorite = 0"
    )?;
    let child_paths: Vec<String> = stmt.query_map([], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    paths.extend(child_paths);

    // Standalone image records (non-favorite)
    let mut stmt2 = conn.prepare(
        "SELECT content FROM clipboard_items WHERE is_favorite = 0 AND content_type = 'image' AND parent_id IS NULL"
    )?;
    let standalone_paths: Vec<String> = stmt2.query_map([], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    paths.extend(standalone_paths);

    // Delete non-favorite records
    conn.execute("DELETE FROM clipboard_items WHERE is_favorite = 0 AND parent_id IS NULL", [])?;
    // Also delete orphan children
    conn.execute("DELETE FROM clipboard_items WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM clipboard_items WHERE parent_id IS NULL)", [])?;

    Ok(paths)
}

pub fn cleanup_old_items(conn: &Connection, days: i64) -> Result<usize, rusqlite::Error> {
    let cutoff = chrono::Utc::now() - chrono::Duration::days(days);
    // Delete non-favorite parent records older than cutoff
    let deleted = conn.execute(
        "DELETE FROM clipboard_items WHERE is_favorite = 0 AND parent_id IS NULL AND created_at < ?1",
        params![cutoff.to_rfc3339()],
    )?;
    // Clean up orphan children
    conn.execute(
        "DELETE FROM clipboard_items WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM clipboard_items WHERE parent_id IS NULL)",
        [],
    )?;
    Ok(deleted)
}

pub fn enforce_storage_limit(conn: &Connection, max_mb: i64) -> Result<usize, rusqlite::Error> {
    let max_bytes = max_mb * 1024 * 1024;
    let total: i64 = conn.query_row(
        "SELECT COALESCE(SUM(size), 0) FROM clipboard_items WHERE parent_id IS NULL",
        [],
        |row| row.get(0),
    )?;
    if total <= max_bytes {
        return Ok(0);
    }
    let to_free = total - max_bytes + (10 * 1024 * 1024);
    let mut freed: i64 = 0;
    let mut deleted = 0;
    let mut stmt = conn.prepare(
        "SELECT id, size FROM clipboard_items WHERE is_favorite = 0 AND parent_id IS NULL ORDER BY id ASC"
    )?;
    let rows: Vec<(i64, i64)> = stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?))
    })?.collect::<Result<Vec<_>, _>>()?;
    for (id, size) in rows {
        if freed >= to_free {
            break;
        }
        conn.execute("DELETE FROM clipboard_items WHERE id = ?1 OR parent_id = ?1", params![id])?;
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
        theme: get_val("theme", "dark"),
        auto_start: get_val("auto_start", "false") == "true",
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
    set("theme", &settings.theme)?;
    set("auto_start", if settings.auto_start { "true" } else { "false" })?;
    Ok(())
}

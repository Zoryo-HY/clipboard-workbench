// Delete clipboard.db to reset the database.
// Run from src-tauri/: cargo run --bin clean_db
use std::path::PathBuf;

fn main() {
    let app_data = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("USERPROFILE").unwrap_or_default();
            PathBuf::from(home).join("AppData").join("Roaming")
        });

    let db_path = app_data
        .join("com.copybox.app")
        .join("clipboard.db");

    match std::fs::remove_file(&db_path) {
        Ok(()) => println!("Deleted: {}", db_path.display()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            println!("DB not found at: {}", db_path.display());
        }
        Err(e) => {
            eprintln!("Failed to delete: {} ({})", db_path.display(), e);
        }
    }
}

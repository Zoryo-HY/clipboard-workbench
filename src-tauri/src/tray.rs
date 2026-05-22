use tauri::{
    tray::{TrayIconBuilder, MouseButton, TrayIconEvent},
    menu::{MenuBuilder, MenuItemBuilder},
    image::Image,
    App, Manager, Emitter,
};

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItemBuilder::with_id("show", "Show / Hide").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "设置").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .item(&settings)
        .separator()
        .item(&quit)
        .build()?;

    let icon = tray_icon();

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("Clipboard Workbench — 双击切换窗口")
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "show" => {
                    let state = app.state::<crate::AppState>();
                    let label = state.last_active_label.lock()
                        .map(|l| l.clone())
                        .unwrap_or_else(|_| "main".to_string());
                    let label = if label.is_empty() { "main" } else { &label };
                    if let Some(w) = app.get_webview_window(label) {
                        let visible = *state.window_visible.lock().unwrap_or_else(|e| e.into_inner());
                        if visible {
                            let _ = w.hide();
                            if let Ok(mut v) = state.window_visible.lock() { *v = false; }
                        } else {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                            if let Ok(mut v) = state.window_visible.lock() { *v = true; }
                        }
                    }
                }
                "settings" => {
                    let _ = app.emit("navigate", "settings");
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } = event {
                let app = tray.app_handle();
                let state = app.state::<crate::AppState>();
                let label = state.last_active_label.lock()
                    .map(|l| l.clone())
                    .unwrap_or_else(|_| "main".to_string());
                let label = if label.is_empty() { "main" } else { &label };
                eprintln!("[tray] double-click → toggle '{}'", label);
                if let Some(w) = app.get_webview_window(label) {
                    let visible = *state.window_visible.lock().unwrap_or_else(|e| e.into_inner());
                    if visible {
                        let _ = w.hide();
                        if let Ok(mut v) = state.window_visible.lock() { *v = false; }
                    } else {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                        if let Ok(mut v) = state.window_visible.lock() { *v = true; }
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn tray_icon() -> Image<'static> {
    let w = 32;
    let h = 32;
    let mut rgba = Vec::with_capacity(w * h * 4);
    for y in 0..h {
        for x in 0..w {
            let inside = x >= 6 && x < 26 && y >= 4 && y < 28;
            let border_h = (y == 4 || y == 27) && x >= 6 && x < 26;
            let border_v = (x == 6 || x == 25) && y >= 4 && y < 28;
            let top_bar = y >= 2 && y <= 4 && x >= 10 && x < 22;
            let top_ends = (x == 10 || x == 21) && y >= 2 && y <= 4;

            if inside || border_h || border_v || top_bar || top_ends {
                rgba.extend_from_slice(&[59, 130, 246, 255]);
            } else {
                rgba.extend_from_slice(&[0, 0, 0, 0]);
            }
        }
    }
    Image::new_owned(rgba, w as u32, h as u32)
}

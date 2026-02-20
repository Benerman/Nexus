use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Auto-grant media permissions on Linux (WebKit2GTK)
            #[cfg(target_os = "linux")]
            {
                let main_window = app.get_webview_window("main").unwrap();
                main_window.with_webview(|webview| {
                    use webkit2gtk::{PermissionRequestExt, SettingsExt, WebViewExt};

                    let wv = webview.inner();

                    if let Some(settings) = WebViewExt::settings(&wv) {
                        settings.set_enable_media_stream(true);
                        settings.set_enable_mediasource(true);
                        settings.set_media_playback_requires_user_gesture(false);
                    }

                    wv.connect_permission_request(|_wv, request| {
                        PermissionRequestExt::allow(request);
                        true
                    });
                })?;
            }

            // ── Build Application Menu ──────────────────────────────

            // File menu
            let file_menu = SubmenuBuilder::new(app, "File")
                .quit()
                .build()?;

            // Edit menu
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .separator()
                .select_all()
                .build()?;

            // View menu — custom items handled in on_menu_event
            let reload_item = MenuItemBuilder::new("Reload")
                .id("reload")
                .accelerator("CmdOrCtrl+R")
                .build(app)?;

            let devtools_item = MenuItemBuilder::new("Toggle Developer Tools")
                .id("toggle_devtools")
                .accelerator("CmdOrCtrl+Shift+I")
                .build(app)?;

            let zoom_in_item = MenuItemBuilder::new("Zoom In")
                .id("zoom_in")
                .accelerator("CmdOrCtrl+=")
                .build(app)?;

            let zoom_out_item = MenuItemBuilder::new("Zoom Out")
                .id("zoom_out")
                .accelerator("CmdOrCtrl+-")
                .build(app)?;

            let zoom_reset_item = MenuItemBuilder::new("Reset Zoom")
                .id("zoom_reset")
                .accelerator("CmdOrCtrl+0")
                .build(app)?;

            let fullscreen_item = MenuItemBuilder::new("Toggle Fullscreen")
                .id("toggle_fullscreen")
                .accelerator("F11")
                .build(app)?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&reload_item)
                .item(&devtools_item)
                .separator()
                .item(&zoom_in_item)
                .item(&zoom_out_item)
                .item(&zoom_reset_item)
                .separator()
                .item(&fullscreen_item)
                .build()?;

            // Help menu
            let check_updates_item = MenuItemBuilder::new("Check for Updates...")
                .id("check_updates")
                .build(app)?;

            let help_menu = SubmenuBuilder::new(app, "Help")
                .item(&check_updates_item)
                .separator()
                .about(Some(AboutMetadata {
                    name: Some("Nexus".into()),
                    version: Some(app.package_info().version.to_string()),
                    authors: Some(vec!["Nexus Team".into()]),
                    comments: Some("A modern chat and voice communication platform".into()),
                    ..Default::default()
                }))
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&file_menu, &edit_menu, &view_menu, &help_menu])
                .build()?;

            app.set_menu(menu)?;

            // ── Menu Event Handler ──────────────────────────────────

            let zoom_level = Arc::new(Mutex::new(1.0_f64));

            app.on_menu_event(move |app_handle, event| {
                let id = event.id().as_ref();
                if let Some(window) = app_handle.get_webview_window("main") {
                    match id {
                        "reload" => {
                            let _ = window.eval("window.location.reload()");
                        }
                        "toggle_devtools" => {
                            if window.is_devtools_open() {
                                window.close_devtools();
                            } else {
                                window.open_devtools();
                            }
                        }
                        "zoom_in" => {
                            let mut level = zoom_level.lock().unwrap();
                            *level = (*level + 0.1).min(3.0);
                            let _ = window.set_zoom(*level);
                        }
                        "zoom_out" => {
                            let mut level = zoom_level.lock().unwrap();
                            *level = (*level - 0.1).max(0.5);
                            let _ = window.set_zoom(*level);
                        }
                        "zoom_reset" => {
                            let mut level = zoom_level.lock().unwrap();
                            *level = 1.0;
                            let _ = window.set_zoom(1.0);
                        }
                        "toggle_fullscreen" => {
                            let is_fs = window.is_fullscreen().unwrap_or(false);
                            let _ = window.set_fullscreen(!is_fs);
                        }
                        "check_updates" => {
                            // Emit event to frontend to trigger update check
                            let _ = window.eval("window.__NEXUS_CHECK_UPDATES && window.__NEXUS_CHECK_UPDATES()");
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

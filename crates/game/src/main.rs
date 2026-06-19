mod agent;
mod animation;
mod camera;
mod lighting;
mod manifest;
mod movement;
mod plugin;
mod room;
mod state;
mod station;
mod world;

use bevy::app::PluginGroupBuilder;
use bevy::asset::AssetMetaCheck;
use bevy::prelude::*;

use plugin::GamePlugin;

fn main() {
    #[cfg(target_arch = "wasm32")]
    {
        console_error_panic_hook::set_once();
        console_log::init_with_level(log::Level::Warn).expect("initialize console_log");
    }

    App::new()
        .insert_resource(ClearColor(Color::srgb(0.05, 0.05, 0.1)))
        .add_plugins(wasm_safe_default_plugins())
        .add_plugins(GamePlugin)
        .run();
}

/// DefaultPlugins subset safe for WASM (WebGL2) and native dev.
fn wasm_safe_default_plugins() -> PluginGroupBuilder {
    DefaultPlugins
        .set(WindowPlugin {
            primary_window: Some(Window {
                title: "Agent Space".into(),
                #[cfg(target_arch = "wasm32")]
                canvas: Some("#bevy-canvas".into()),
                #[cfg(target_arch = "wasm32")]
                fit_canvas_to_parent: true,
                #[cfg(target_arch = "wasm32")]
                prevent_default_event_handling: true,
                ..default()
            }),
            ..default()
        })
        .set(AssetPlugin {
            meta_check: AssetMetaCheck::Never,
            ..default()
        })
}

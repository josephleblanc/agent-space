//! JS ↔ Bevy WASM bridge (Track A17).

use std::sync::{Mutex, OnceLock};

use bevy::prelude::*;
use protocol::RoomSnapshot;
use wasm_bindgen::prelude::*;

static INBOUND: OnceLock<Mutex<InboundBridge>> = OnceLock::new();

#[derive(Default)]
struct InboundBridge {
    room_states: Vec<String>,
    speeches: Vec<AgentSpeechInbound>,
}

#[derive(Clone)]
struct AgentSpeechInbound {
    agent_id: String,
    text: String,
}

#[derive(Resource, Default, Debug, Clone, Copy)]
pub struct BridgeSyncActive(pub bool);

#[derive(Resource, Default, Debug, Clone)]
pub struct LatestRoomSnapshot(pub Option<RoomSnapshot>);

#[derive(Message, Debug, Clone)]
pub struct AgentSpeechEvent {
    pub agent_id: String,
    pub text: String,
}

#[derive(SystemSet, Debug, Hash, PartialEq, Eq, Clone)]
pub struct BridgeSet;

pub struct BridgePlugin;

impl Plugin for BridgePlugin {
    fn build(&self, app: &mut App) {
        INBOUND.get_or_init(|| Mutex::new(InboundBridge::default()));
        app.init_resource::<LatestRoomSnapshot>()
            .init_resource::<BridgeSyncActive>()
            .add_message::<AgentSpeechEvent>()
            .configure_sets(Update, BridgeSet)
            .add_systems(Update, drain_inbound_bridge.in_set(BridgeSet));
    }
}

pub fn drain_inbound_bridge(
    mut latest: ResMut<LatestRoomSnapshot>,
    mut speech_events: MessageWriter<AgentSpeechEvent>,
) {
    let Ok(mut inbound) = INBOUND.get_or_init(Default::default).lock() else {
        return;
    };
    for json in inbound.room_states.drain(..) {
        match serde_json::from_str::<RoomSnapshot>(&json) {
            Ok(snapshot) => {
                log::info!("room-state sync: {} agents", snapshot.agents.len());
                latest.0 = Some(snapshot);
            }
            Err(error) => log::warn!("room-state sync parse error: {error}"),
        }
    }
    for speech in inbound.speeches.drain(..) {
        speech_events.write(AgentSpeechEvent {
            agent_id: speech.agent_id,
            text: speech.text,
        });
    }
}

#[wasm_bindgen(js_name = on_room_state_sync)]
pub fn on_room_state_sync(json: &str) {
    if let Ok(mut inbound) = INBOUND.get_or_init(Default::default).lock() {
        inbound.room_states.push(json.to_owned());
    }
}

#[wasm_bindgen(js_name = on_agent_speech)]
pub fn on_agent_speech(agent_id: &str, text: &str) {
    if let Ok(mut inbound) = INBOUND.get_or_init(Default::default).lock() {
        inbound.speeches.push(AgentSpeechInbound {
            agent_id: agent_id.to_owned(),
            text: text.to_owned(),
        });
    }
}

#[wasm_bindgen(js_name = bridge_ping)]
pub fn bridge_ping() -> bool {
    true
}

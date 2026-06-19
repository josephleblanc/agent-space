//! glTF animation clips driven by manifest + AgentState (A15).

use std::time::Duration;

use bevy::prelude::*;
use protocol::AgentState;

use crate::agent::Agent;
use crate::assets_util::game_asset;
use crate::manifest::{animation_index, AgentManifestEntry};

#[derive(Component)]
pub struct AgentAnimationBundle {
    pub agent_key: String,
    pub clips: AgentAnimationClips,
}

#[derive(Clone)]
pub struct AgentAnimationClips {
    pub gltf_path: String,
    pub idle: usize,
    pub walking: usize,
    pub working: usize,
    pub talking: usize,
}

impl AgentAnimationClips {
    pub fn index_for_state(&self, state: AgentState) -> usize {
        match state {
            AgentState::Idle => self.idle,
            AgentState::Walking => self.walking,
            AgentState::Working => self.working,
            AgentState::Talking => self.talking,
        }
    }
}

impl AgentAnimationBundle {
    pub fn new(agent_key: &str, entry: &AgentManifestEntry) -> Self {
        let clip_index = |name: &str| animation_index(name).unwrap_or(1);
        Self {
            agent_key: agent_key.to_string(),
            clips: AgentAnimationClips {
                gltf_path: game_asset(&entry.gltf),
                idle: clip_index(&entry.animations.idle),
                walking: clip_index(&entry.animations.walking),
                working: clip_index(&entry.animations.working),
                talking: clip_index(&entry.animations.talking),
            },
        }
    }
}

#[derive(Component)]
struct AgentAnimationPlayer {
    nodes: [AnimationNodeIndex; 4],
    current: Option<usize>,
}

pub struct AnimationPlugin;

impl Plugin for AnimationPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, (bind_animation_players, sync_agent_animations).chain());
    }
}

fn bind_animation_players(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
    agents: Query<(Entity, &AgentAnimationBundle), Without<AgentAnimationPlayer>>,
    mut players: Query<(Entity, &mut AnimationPlayer), Added<AnimationPlayer>>,
    children: Query<&ChildOf>,
) {
    for (player_entity, mut player) in &mut players {
        let Some(agent_entity) =
            find_agent_ancestor(player_entity, &children, &agents)
        else {
            continue;
        };
        let Ok((_, bundle)) = agents.get(agent_entity) else {
            continue;
        };
        let clips = &bundle.clips;
        let clip_handles = [
            asset_server.load(GltfAssetLabel::Animation(clips.idle).from_asset(clips.gltf_path.clone())),
            asset_server.load(GltfAssetLabel::Animation(clips.walking).from_asset(clips.gltf_path.clone())),
            asset_server.load(GltfAssetLabel::Animation(clips.working).from_asset(clips.gltf_path.clone())),
            asset_server.load(GltfAssetLabel::Animation(clips.talking).from_asset(clips.gltf_path.clone())),
        ];
        let (graph, node_indices) = AnimationGraph::from_clips(clip_handles);
        let graph_handle = graphs.add(graph);
        let nodes = [
            node_indices[0],
            node_indices[1],
            node_indices[2],
            node_indices[3],
        ];
        let mut transitions = AnimationTransitions::new();
        transitions
            .play(&mut player, nodes[0], Duration::ZERO)
            .repeat();
        commands.entity(player_entity).insert((
            AnimationGraphHandle(graph_handle),
            transitions,
            AgentAnimationPlayer {
                nodes,
                current: Some(clips.idle),
            },
        ));
    }
}

fn sync_agent_animations(
    agents: Query<(&Agent, &AgentAnimationBundle, &Children), Changed<Agent>>,
    mut players: Query<(
        &mut AnimationPlayer,
        &mut AnimationTransitions,
        &mut AgentAnimationPlayer,
    )>,
) {
    for (agent, bundle, children) in &agents {
        let clip_index = bundle.clips.index_for_state(agent.state);
        let node = match agent.state {
            AgentState::Idle => 0,
            AgentState::Walking => 1,
            AgentState::Working => 2,
            AgentState::Talking => 3,
        };
        for child in children.iter() {
            let Ok((mut player, mut transitions, mut anim)) = players.get_mut(child) else {
                continue;
            };
            if anim.current == Some(clip_index) {
                continue;
            }
            transitions
                .play(&mut player, anim.nodes[node], Duration::from_millis(200))
                .repeat();
            anim.current = Some(clip_index);
        }
    }
}

fn find_agent_ancestor(
    mut entity: Entity,
    children: &Query<&ChildOf>,
    agents: &Query<(Entity, &AgentAnimationBundle), Without<AgentAnimationPlayer>>,
) -> Option<Entity> {
    loop {
        if agents.get(entity).is_ok() {
            return Some(entity);
        }
        let Ok(parent) = children.get(entity) else {
            return None;
        };
        entity = parent.parent();
    }
}

//! Station markers at research / code / meet / lounge anchors (A9).

use bevy::prelude::*;
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StationId {
    Research,
    Code,
    Meet,
    Lounge,
}

impl StationId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Research => "research",
            Self::Code => "code",
            Self::Meet => "meet",
            Self::Lounge => "lounge",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "research" => Some(Self::Research),
            "code" => Some(Self::Code),
            "meet" => Some(Self::Meet),
            "lounge" => Some(Self::Lounge),
            _ => None,
        }
    }

    pub fn home_for_role(role: &str) -> Self {
        match role {
            "researcher" => Self::Research,
            "coder" => Self::Code,
            "planner" => Self::Meet,
            "social" => Self::Lounge,
            _ => Self::Lounge,
        }
    }
}

#[derive(Component, Debug, Clone)]
pub struct StationMarker {
    pub id: StationId,
    pub label: String,
}

#[derive(Resource, Clone, Debug)]
pub struct StationLayout {
    pub positions: HashMap<StationId, Vec3>,
}

impl StationLayout {
    pub fn position(&self, id: StationId) -> Vec3 {
        *self.positions.get(&id).unwrap_or(&Vec3::ZERO)
    }
}

pub fn spawn_stations(mut commands: Commands) {
    let stations = [
        (
            StationId::Research,
            "Research Bench",
            Vec3::new(-4.5, 0.0, -3.5),
        ),
        (StationId::Code, "Coding Desk", Vec3::new(4.5, 0.0, -3.5)),
        (StationId::Meet, "Meeting Table", Vec3::new(0.0, 0.0, 3.5)),
        (StationId::Lounge, "Lounge Area", Vec3::new(-4.0, 0.0, 3.0)),
    ];

    let mut positions = HashMap::new();

    for (id, label, position) in stations {
        positions.insert(id, position);
        commands.spawn((
            StationMarker {
                id,
                label: label.into(),
            },
            Transform::from_translation(position),
        ));
    }

    commands.insert_resource(StationLayout { positions });
}

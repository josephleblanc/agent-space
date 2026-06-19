//! Wavefront OBJ loader for Kenney environment props (WASM + native).

use std::io::Cursor;

use bevy::asset::{io::Reader, AssetApp, AssetLoader, LoadContext};
use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, Mesh, PrimitiveTopology};
use bevy::prelude::*;
use thiserror::Error;

#[derive(Asset, TypePath, Debug, Clone)]
pub struct ObjMesh(pub Mesh);

#[derive(Component)]
pub struct ObjPropHandle(pub Handle<ObjMesh>);

#[derive(Default, TypePath)]
pub struct ObjMeshLoader;

#[derive(Error, Debug)]
#[error("failed to load OBJ: {0}")]
pub struct ObjMeshLoaderError(String);

impl AssetLoader for ObjMeshLoader {
    type Asset = ObjMesh;
    type Settings = ();
    type Error = ObjMeshLoaderError;

    async fn load(
        &self,
        reader: &mut dyn Reader,
        _settings: &(),
        _load_context: &mut LoadContext<'_>,
    ) -> Result<Self::Asset, Self::Error> {
        let mut bytes = Vec::new();
        reader
            .read_to_end(&mut bytes)
            .await
            .map_err(|error| ObjMeshLoaderError(error.to_string()))?;
        let mesh = parse_obj(&bytes).map_err(ObjMeshLoaderError)?;
        Ok(ObjMesh(mesh))
    }

    fn extensions(&self) -> &[&str] {
        &["obj"]
    }
}

pub struct ObjLoaderPlugin;

impl Plugin for ObjLoaderPlugin {
    fn build(&self, app: &mut App) {
        app.init_asset::<ObjMesh>()
            .init_asset_loader::<ObjMeshLoader>();
    }
}

fn parse_obj(bytes: &[u8]) -> Result<Mesh, String> {
    let load_options = tobj::LoadOptions {
        triangulate: true,
        single_index: true,
        ..Default::default()
    };
    let mut reader = Cursor::new(bytes);
    let (models, _materials) = tobj::load_obj_buf(
        &mut reader,
        &load_options,
        |_| Err(tobj::LoadError::OpenFileFailed),
    )
    .map_err(|error| format!("{error:?}"))?;

    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut uvs = Vec::new();
    let mut indices = Vec::new();

    for model in models {
        let mesh = &model.mesh;
        let base = positions.len() as u32;

        for chunk in mesh.positions.chunks_exact(3) {
            positions.push([chunk[0], chunk[1], chunk[2]]);
        }
        if mesh.normals.len() == mesh.positions.len() {
            for chunk in mesh.normals.chunks_exact(3) {
                normals.push([chunk[0], chunk[1], chunk[2]]);
            }
        }
        if mesh.texcoords.len() == mesh.positions.len() / 3 * 2 {
            for chunk in mesh.texcoords.chunks_exact(2) {
                uvs.push([chunk[0], chunk[1]]);
            }
        }

        for face in &mesh.indices {
            indices.push(base + face);
        }
    }

    if positions.is_empty() {
        return Err("OBJ contained no geometry".into());
    }

    center_and_normalize(&mut positions, 1.0);

    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    if normals.len() == mesh.count_vertices() {
        mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
    } else {
        mesh.compute_smooth_normals();
    }
    if uvs.len() == mesh.count_vertices() {
        mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, uvs);
    }
    mesh.insert_indices(Indices::U32(indices));
    Ok(mesh)
}

fn center_and_normalize(positions: &mut [[f32; 3]], target_size: f32) {
    let mut min = Vec3::splat(f32::INFINITY);
    let mut max = Vec3::splat(f32::NEG_INFINITY);
    for pos in positions.iter() {
        let v = Vec3::from_array(*pos);
        min = min.min(v);
        max = max.max(v);
    }
    let center = (min + max) * 0.5;
    let extent = (max - min).max_element().max(0.001);
    let scale = target_size / extent;

    for pos in positions.iter_mut() {
        let v = (Vec3::from_array(*pos) - center) * scale;
        *pos = v.to_array();
    }
}

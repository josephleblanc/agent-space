# Asset Licenses

All game assets in this directory are **CC0 (Creative Commons Zero / public domain)**.
They may be used freely for any purpose without attribution (credit is appreciated but not required).

## Character avatars

| Asset | Source | License | Download |
|-------|--------|---------|----------|
| Kenney Blocky Characters 2.0 | [Kenney.nl](https://kenney.nl/assets/blocky-characters) | CC0 | [OpenGameArt mirror](https://opengameart.org/content/blocky-characters) |

**Files used:** `characters/researcher.glb`, `coder.glb`, `planner.glb`, `social.glb`

- Derived from Kenney `character-a` through `character-d` skins (18 skins, 27 animation clips per model).
- Rigged low-poly humanoids with embedded textures; GLB format for Bevy WASM loading.

## Environment / furniture props

| Asset | Source | License | Download |
|-------|--------|---------|----------|
| Kenney Furniture Kit | [Kenney.nl](https://kenney.nl/assets/furniture-kit) | CC0 | [OpenGameArt mirror](https://opengameart.org/content/furniture-kit) |

**Station props:**

| Station | Models |
|---------|--------|
| `environment/research_bench/` | desk, bookcaseOpen, pottedPlant |
| `environment/coding_desk/` | deskCorner, computerScreen, laptop, chairDesk |
| `environment/meeting_table/` | tableRound, chairRounded |
| `environment/lounge_area/` | loungeSofa, loungeChair, sideTable |

OBJ + MTL format with solid-color materials (no external texture dependencies).

## Alternative source (not used)

[Quaternius Ultimate Modular Office](https://quaternius.com/packs/ultimatemodularoffice.html) — CC0 workplace props, suitable fallback if Kenney furniture is unavailable.

## Procedural fallback (Bevy client)

If glTF/OBJ assets fail to load in WASM, Track A renders colored capsule meshes + floating name labels instead. See `manifest.json` for intended asset paths.

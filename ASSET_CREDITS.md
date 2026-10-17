# Asset credits

All assets below are **CC0** (public domain) from [Poly Haven](https://polyhaven.com). No attribution is
required; we list them anyway. Downloaded by `npm run assets:fetch`, compressed by `npm run assets:compress`.

| Asset                                                                                                     | Type    | Used for                      |
| --------------------------------------------------------------------------------------------------------- | ------- | ----------------------------- |
| kloofendal_48d_partly_cloudy_puresky                                                                      | HDRI    | Sky, image-based lighting     |
| asphalt_02                                                                                                | Texture | Roads, roofs                  |
| concrete_pavement                                                                                         | Texture | Ground plane                  |
| concrete_floor_worn_001                                                                                   | Texture | Sidewalk slabs                |
| concrete                                                                                                  | Texture | Curbs, tree pits              |
| brick_wall_02, dark_brick_wall, white_stucco                                                              | Texture | Building facades, party walls |
| granite_tile                                                                                              | Texture | (reserved: storefront bases)  |
| metal_plate                                                                                               | Texture | Street light and signal poles |
| modular_urban_apartments_facade                                                                           | Model   | Building facades              |
| fire_hydrant, metal_trash_can, modular_street_seating, utility_box_01, water_manhole_cover, tree_small_02 | Model   | Street props                  |
| modular_fire_escape, exterior_aircon_unit                                                                 | Model   | (downloaded, not placed yet)  |

## Mixamo (Adobe) — royalty-free for use in games

| Asset | Source | Used for |
|---|---|---|
| Michelle (Ch03) | [three.js examples](https://github.com/mrdoob/three.js/tree/r172/examples/models/gltf), originally [Mixamo](https://www.mixamo.com) | Player character stand-in |
| Soldier — Idle, Walk, Run clips | same | Player animations (retargeted onto Michelle at load) |

Swap in your own Mixamo character + clips by exporting them as GLB and listing the clip names in
`PLAYER_ANIMATIONS` (src/game/config.ts). Jump, fall and turn clips will be used automatically once present.

## CC-BY 4.0 (attribution required)

| Asset                             | Author / owner                                                                               | Source                                                                                                                                                                        | Changes                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Car Concept (our "Flying Car" EV) | Eric Chadwick, Darmstadt Graphics Group GmbH (2024), from a public-domain model by Unity Fan | [KhronosGroup/glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Khronos logo texture replaced with our fictional "Flying Car" badge; meshopt + WebP compression; glass simplified at runtime |

Any other CC-BY asset (e.g. from Sketchfab) must be added here with author and link before it ships.

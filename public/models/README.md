# Global Conquer unit models

`units.json` enables the prepared GLB files. Unmodified user downloads are preserved
in `assets/model-sources/`, outside public assets so the full trench pack and duplicate
source models are not copied into production builds.

Recreate the prepared models from the project root:

```
node scripts/prepare-unit-models.mjs
```

The script uses existing Three.js and Sharp dependencies. It keeps original asset
credits in GLB metadata, combines the infantry's solid material palette using vertex
colors, extracts only the landing craft, removes the frigate's helicopter, repacks
accessors so unused pack geometry is removed, and reduces textures to 512px.

| Unit | Prepared triangles | Material draws | GLB size (approx.) |
| --- | ---: | ---: | ---: |
| Infantry + rifle silhouette | 11,128 | 2 | 793 KiB |
| Tiger tank | 15,237 | 6 | 2,039 KiB |
| Frigate | 4,650 | 6 | 1,076 KiB |
| Landing craft | 926 | 3 | 92 KiB |

The supplied files contained no animation clips. The preparation script restores the
soldier's upright bind pose and authors lightweight in-place GC_Idle, GC_Walk,
GC_Fire and GC_WalkFire skeletal clips. These are simple authored motions, not
motion-captured animations. A small rifle silhouette is attached to the hand bone.
Vehicles use their real meshes and the game's existing combat effects.

Runtime: only visible stack representatives on screen at zoom >= 4 use detail,
capped at 24 models and 12 animation mixers, sampled at 20 Hz. Mesh assets are shared;
independent skeletons are released when detail leaves view. At most two detailed
instances are allocated per frame. Model shaders and textures are prepared behind
the deployment loading bar to reduce first-use stalls. No model shadow passes.
Far-away models use existing lightweight silhouettes. Fog of war stays enforced.
Motion remains simulation-driven; skeletal clips never translate units across the map.

Intake limits: infantry 12k triangles, armor 30k, frigate 10k, transport 15k;
8 material draws per model; textures <= 1024px per dimension, <= 4 million combined
texture pixels per model. Missing/oversized assets retain the procedural fallback.
Diagnostics expose `modelAssets` through the existing development debug snapshot.
Performance caps are guardrails; full-scale battle performance depends on hardware.

## Source attribution

Source GLBs list Creative Commons Attribution 4.0 (CC BY 4.0):
https://creativecommons.org/licenses/by/4.0/

- **FREE [Military Soldier] RIGGED**, BAMEN:
  https://sketchfab.com/3d-models/free-military-soldier-rigged-e9c56308a67d4a3db62e914fafa4d198
  Modified: combined materials, corrected pose, authored animations, added rifle.
- **RTCW tiger**, photon (that one larry) / Professor_E12:
  https://sketchfab.com/3d-models/rtcw-tiger-a10ed2eaf5ad466b80ea619bed9f920f
  Modified: reduced textures, opaque RTS materials, removed specular extension.
- **Low Poly Frigate Ship with Helicopter**, Duane's Mind:
  https://sketchfab.com/3d-models/low-poly-frigate-ship-with-helicopter-e35dab813fe34035b66ac15989b1e2be
  Modified: removed helicopter, reduced textures, repacked retained geometry.
- **3D trench system pack free**, Nuclearwinter94:
  https://sketchfab.com/3d-models/3d-trench-system-pack-free-2abd39ba7ee84dabb28c484a3b09810c
  Modified: extracted landing craft only, reduced textures, repacked geometry.

# Flight asset intake

Prepared on the current `main` baseline (`6395a09`) from the supplied helicopter, jet, and drone files. Blender 4.3.2 is required for import/export.

## Prepared assets

| Model | Prepared detail | Notes |
| --- | --- | --- |
| AH-64 Apache FBX | LOD0 143k, LOD1 64k, LOD2 23k triangles | 91 mesh objects. Two helper planes were removed. Most object names are generic, so rotor parts still need identification before animation. |
| High-poly helicopter GLB | LOD0 39k, LOD1 17k, LOD2 6k triangles | Reduced from 1.93m triangles. One mesh only, so the rotor cannot animate independently yet. |
| F-16 | LOD0 30k, LOD1 14k, LOD2 5k triangles | 9 named meshes; packed 4K textures were reduced to 2K. |
| Dassault Rafale | LOD0 41k, LOD1 18k, LOD2 6k triangles | 10 named meshes; packed 4K textures were reduced to 2K. |
| Su-47 Berkut | LOD0 13k, LOD1 6k, LOD2 2k triangles | 55 named meshes, including separate wings, flaps, slats, wheels, canopy, and engine parts. MTL image maps were not supplied. |
| TU-222 | LOD0 13k, LOD1 6k, LOD2 2k triangles | 62 named meshes, including separate control surfaces, wheels, and landing gear. MTL image maps were not supplied. |
| Granad BA1000T quadcopter | LOD0 3.9k triangles | Separate named hull, rotors, and blades. MTL image maps were not supplied. |
| Hornet quadcopter | LOD0 2.8k triangles | Separate named hull, rotors, and blades. MTL image maps were not supplied. |

`PerunF_Quadcopter.obj` was rejected: Blender found no mesh data and reported an overlong malformed OBJ line. Its supplied file also contains unrelated filter-list text. It needs a clean re-export before it can be prepared.

## New jet files

Both newly supplied files are jets. The new `tu222.glb` has 62 named mesh nodes, separate control surfaces and landing-gear pieces, and embedded texture images. It uses required `KHR_draco_mesh_compression`; this Blender 4.3.2 build has no Draco decoder, so the source GLB is preserved as `tu222-draco-source.glb` and structurally validated. It has not been geometry-decoded or given LODs yet. Its nodes make it a stronger TU-222 candidate than the earlier untextured OBJ conversion.

The new `su47berkut.blend` is a Blender 5.0-format Zstandard-compressed file. The available Blender exporter is 4.3.2 and cannot open it. The earlier 55-part OBJ conversion remains available as a fallback; the new blend was recorded as a rejected jet source so it is not mistaken for a non-aircraft asset.

## Validation and use

The 20 generated GLB LOD files were re-imported with Blender 4.3.2. Each contained non-empty mesh geometry, a nonzero triangle count, and finite, nondegenerate bounds. The new compressed TU-222 candidate passed GLB container, embedded-buffer, extension, node, and mesh-reference checks, but its Draco geometry was not decoded. Detailed source/output counts and part names are in [`frontend/public/models/vehicles/flying/manifest.json`](../frontend/public/models/vehicles/flying/manifest.json).

The source axes and scales are preserved. The F-16 and Rafale source bounds are roughly 150 Blender units long, while the high-poly helicopter is under one unit across; calibrate scale and forward/up axes against the server collider profiles before gameplay integration. The high-poly helicopter also needs a rotor hierarchy. No flight physics or vehicle-selection entries were added by this asset-preparation patch.

To regenerate the assets, provide the original source files in a directory and run:

```sh
blender -b --python scripts/prepare-flight-models.py -- \
  --source-dir /path/to/source-assets \
  --output-dir frontend/public/models/aircraft
blender -b --python scripts/validate-flight-models.py -- \
  --manifest frontend/public/models/vehicles/flying/manifest.json
```

The naval Rapier API fix in `avenlab-server/src/naval.rs` uses `add_force` and `add_torque`, the continuous-force methods exposed by the project's Rapier 0.22 API.

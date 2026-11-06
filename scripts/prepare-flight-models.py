"""Import supplied flight models in Blender and export mobile-oriented GLB LODs.

Run with Blender 4.3+: blender -b --python scripts/prepare-flight-models.py -- \
  --source-dir /path/to/source-assets --output-dir frontend/public/models/vehicles/flying
"""

import argparse
import json
import os
from pathlib import Path
import shutil
import struct
import sys

import bpy
from mathutils import Vector


MODELS = [
    {"id": "apache-ah64", "file": "AH-64.fbx", "class": "helicopter", "lod0_ratio": 0.65},
    # A single source mesh has no separate rotor hierarchy, so retain it as a
    # static preview model and keep the triangle budget mobile-friendly.
    {"id": "military-helicopter-highpoly", "file": "military helicopter (highpoly)(1).glb", "class": "helicopter", "lod0_ratio": 0.02},
    {"id": "f16", "file": "F-16.blend", "class": "jet", "lod0_ratio": 1.0},
    {"id": "rafale", "file": "Dassault-Rafale.blend", "class": "jet", "lod0_ratio": 1.0},
    {"id": "su47-berkut", "file": "Su47Berkut_Fighter.obj", "class": "jet", "lod0_ratio": 1.0},
    {"id": "tu222", "file": "TU222_Fighter.obj", "class": "jet", "lod0_ratio": 1.0},
    # New uploaded blend is Blender 5.0-format and may not open on older exporters;
    # keep the known-good OBJ conversion while recording the new source result.
    {"id": "su47-berkut-new-source", "file": "su47berkut.blend", "class": "jet", "lod0_ratio": 1.0},
    {"id": "granad-ba1000t", "file": "GranadBA1000T_Quadcopter.obj", "class": "drone", "lod0_ratio": 1.0},
    {"id": "hornet-quadcopter", "file": "Hornet_Quadcopter.obj", "class": "drone", "lod0_ratio": 1.0},
    {"id": "perunf-quadcopter", "file": "PerunF_Quadcopter.obj", "class": "drone", "lod0_ratio": 1.0},
]

GLB_CANDIDATES = [
    {"id": "tu222-draco-source", "file": "tu222.glb", "class": "jet"},
]


def import_source(path: Path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    suffix = path.suffix.lower()
    if suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path), use_anim=True)
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path), forward_axis="NEGATIVE_Z", up_axis="Y")
    elif suffix == ".blend":
        bpy.ops.wm.open_mainfile(filepath=str(path))
    elif suffix == ".glb":
        bpy.ops.import_scene.gltf(filepath=str(path))
    else:
        raise ValueError(f"Unsupported source format: {suffix}")


def bounds_and_counts():
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        return meshes, None, 0, 0
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    tris = 0
    verts = 0
    for obj in meshes:
        verts += len(obj.data.vertices)
        tris += sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                lo[axis] = min(lo[axis], point[axis])
                hi[axis] = max(hi[axis], point[axis])
    return meshes, {"min": [round(v, 5) for v in lo], "max": [round(v, 5) for v in hi]}, verts, tris


def missing_images():
    missing = []
    for image in bpy.data.images:
        if image.source != "FILE" or image.packed_file:
            continue
        absolute = bpy.path.abspath(image.filepath)
        if not absolute or not os.path.exists(absolute):
            missing.append(image.filepath)
    return sorted(set(missing))


def downscale_packed_images(max_dimension=2048):
    changed = []
    for image in bpy.data.images:
        if image.source != "FILE" or not image.packed_file:
            continue
        width, height = image.size
        largest = max(width, height)
        if largest <= max_dimension:
            continue
        ratio = max_dimension / largest
        image.scale(max(1, round(width * ratio)), max(1, round(height * ratio)))
        image.pack()
        changed.append({"name": image.name, "from": [width, height], "to": [image.size[0], image.size[1]]})
    return changed


def simplify(meshes, ratio):
    if ratio >= 0.999:
        return
    for obj in meshes:
        if obj.type != "MESH" or len(obj.data.polygons) < 8:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        decimate = obj.modifiers.new(name="AvenLab_Flight_LOD", type="DECIMATE")
        decimate.decimate_type = "COLLAPSE"
        decimate.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=decimate.name)


def export_glb(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_animations=True,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
    )


def inspect_glb_container(path: Path):
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError("file is too short to be a GLB")
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(data):
        raise ValueError("invalid GLB header or declared length")
    json_length, json_type = struct.unpack_from("<I4s", data, 12)
    if json_type != b"JSON" or 20 + json_length > len(data):
        raise ValueError("invalid GLB JSON chunk")
    gltf = json.loads(data[20 : 20 + json_length].decode("utf-8").rstrip(" \t\r\n\0"))
    nodes = gltf.get("nodes", [])
    meshes = gltf.get("meshes", [])
    names = [node.get("name", "") for node in nodes if node.get("mesh") is not None]
    bounds = []
    triangles = 0
    for mesh in meshes:
        for primitive in mesh.get("primitives", []):
            position_accessor = gltf.get("accessors", [])[primitive.get("attributes", {}).get("POSITION", -1)]
            if "min" in position_accessor and "max" in position_accessor:
                bounds.append((position_accessor["min"], position_accessor["max"]))
            index = primitive.get("indices")
            if index is not None:
                triangles += gltf["accessors"][index].get("count", 0) // 3
    if not meshes or not names:
        raise ValueError("GLB has no mesh nodes")
    return {
        "nodes": len(nodes),
        "meshes": len(meshes),
        "meshNames": names,
        "triangles": triangles,
        "extensionsRequired": gltf.get("extensionsRequired", []),
        "extensionsUsed": gltf.get("extensionsUsed", []),
        "materials": [item.get("name", "") for item in gltf.get("materials", [])],
        "embeddedImages": len(gltf.get("images", [])),
    }


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])
    source_dir = Path(args.source_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = {"format": 1, "coordinate_note": "Source axes and scale are preserved; orient and size against flight collider profiles before gameplay use.", "models": [], "candidates": [], "rejected": []}

    for spec in MODELS:
        source = source_dir / spec["file"]
        if not source.is_file():
            manifest["rejected"].append({"file": spec["file"], "reason": "source file not found"})
            continue
        try:
            import_source(source)
            # The AH-64 FBX includes two non-aircraft helper planes, one of them
            # almost 40 units across. They skew bounds and should not ship.
            if spec["id"] == "apache-ah64":
                for obj in list(bpy.context.scene.objects):
                    if obj.type == "MESH" and obj.name in {"Plane", "Plane.001"}:
                        bpy.data.objects.remove(obj, do_unlink=True)

            meshes, bounds, vertices, triangles = bounds_and_counts()
            if not meshes:
                manifest["rejected"].append({"id": spec["id"], "class": spec["class"], "file": spec["file"], "reason": "import succeeded but produced no mesh objects"})
                continue
            missing = missing_images()
            scaled = downscale_packed_images()
            camera_light_count = sum(1 for obj in bpy.context.scene.objects if obj.type in {"CAMERA", "LIGHT"})
            for obj in list(bpy.context.scene.objects):
                if obj.type in {"CAMERA", "LIGHT"}:
                    bpy.data.objects.remove(obj, do_unlink=True)

            # Large sources receive a capped near LOD, followed by cumulative
            # decimation. Smaller models stay at full detail for LOD0.
            near_ratio = spec["lod0_ratio"]
            export_rows = []
            ratios = [("lod0", near_ratio)]
            if triangles >= 12000:
                ratios += [("lod1", near_ratio * 0.45), ("lod2", near_ratio * 0.16)]
            current_ratio = 1.0
            for level, target_ratio in ratios:
                relative = target_ratio / current_ratio
                simplify(meshes, relative)
                current_ratio = target_ratio
                subgroup = {"helicopter": "helicopters", "jet": "jets", "drone": "drones"}[spec["class"]]
                filename = {"lod0": "model.glb", "lod1": "lod-medium.glb", "lod2": "lod-far.glb"}[level]
                out_path = output_dir / subgroup / spec['id'] / filename
                out_path.parent.mkdir(parents=True, exist_ok=True)
                export_glb(out_path)
                _, lod_bounds, lod_vertices, lod_tris = bounds_and_counts()
                export_rows.append({"level": level, "path": f"/models/vehicles/flying/{out_path.relative_to(output_dir).as_posix()}", "bytes": out_path.stat().st_size, "vertices": lod_vertices, "triangles": lod_tris, "bounds": lod_bounds})

            manifest["models"].append({
                "id": spec["id"],
                "class": spec["class"],
                "source": spec["file"],
                "sourceBytes": source.stat().st_size,
                "sourceMeshes": len(meshes),
                "sourceVertices": vertices,
                "sourceTriangles": triangles,
                "sourceBounds": bounds,
                "sourceMaterials": sorted({m.name for m in bpy.data.materials}),
                # Keep the generated manifest portable; source upload paths are
                # local to the Blender machine and should never enter the repo.
                "missingExternalTextures": [Path(path).name for path in missing],
                "packedTexturesDownscaled": scaled,
                "discardedCameraOrLightObjects": camera_light_count,
                "meshObjects": [obj.name for obj in meshes],
                "lods": export_rows,
            })
        except Exception as exc:
            message = str(exc).replace(str(source), source.name).replace(str(source_dir), "<source-dir>")
            manifest["rejected"].append({"id": spec["id"], "class": spec["class"], "file": spec["file"], "reason": f"{type(exc).__name__}: {message}"})

    # Preserve the newer TU-222 GLB when it is Draco-compressed and this
    # Blender build has no Draco decoder. Its GLB container and object metadata
    # are checked, while mesh re-import remains a runtime/decoder follow-up.
    for spec in GLB_CANDIDATES:
        source = source_dir / spec["file"]
        if not source.is_file():
            continue
        try:
            details = inspect_glb_container(source)
            # Keep the compressed source alongside this vehicle's exported LODs.
            asset_id = spec['id'].removesuffix('-draco-source')
            subgroup = {"helicopter": "helicopters", "jet": "jets", "drone": "drones"}[spec["class"]]
            output = output_dir / subgroup / asset_id / 'source-draco.glb'
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, output)
            manifest["candidates"].append({
                "id": spec["id"], "class": spec["class"], "source": spec["file"],
                "path": f"/models/vehicles/flying/{output.relative_to(output_dir).as_posix()}", "bytes": output.stat().st_size,
                "validation": "GLB structure and object metadata valid; Draco geometry not decoded by Blender",
                **details,
            })
        except Exception as exc:
            manifest["rejected"].append({"id": spec["id"], "class": spec["class"], "file": spec["file"], "reason": f"{type(exc).__name__}: {exc}"})

    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"models": len(manifest["models"]), "rejected": manifest["rejected"], "manifest": str(output_dir / "manifest.json")}))


if __name__ == "__main__":
    run()

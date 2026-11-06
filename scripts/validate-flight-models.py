"""Re-import every prepared aircraft GLB and check its mesh data.

Run with Blender 4.3+: blender -b --python scripts/validate-flight-models.py -- \
  --manifest frontend/public/models/vehicles/flying/manifest.json
"""

import json
import math
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector


def inspect(path: Path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise ValueError("no mesh objects after GLB re-import")
    triangles = sum(sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons) for obj in meshes)
    vertices = sum(len(obj.data.vertices) for obj in meshes)
    if not triangles or not vertices:
        raise ValueError(f"empty geometry: {vertices} vertices, {triangles} triangles")
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    if not all(math.isfinite(float(value)) for point in points for value in point):
        raise ValueError("non-finite vertex bounds")
    extents = [max(point[i] for point in points) - min(point[i] for point in points) for i in range(3)]
    if not all(math.isfinite(value) and value > 1e-6 for value in extents):
        raise ValueError(f"degenerate bounds: {extents}")
    return {"meshObjects": len(meshes), "vertices": vertices, "triangles": triangles, "extents": [round(value, 5) for value in extents]}


def inspect_compressed_glb(path: Path, expected_meshes: int):
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError("GLB is too short")
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(data):
        raise ValueError("invalid GLB header or declared length")
    json_length, json_type = struct.unpack_from("<I4s", data, 12)
    if json_type != b"JSON" or 20 + json_length > len(data):
        raise ValueError("invalid GLB JSON chunk")
    gltf = json.loads(data[20 : 20 + json_length].decode("utf-8").rstrip(" \t\r\n\0"))
    if "KHR_draco_mesh_compression" not in gltf.get("extensionsRequired", []):
        raise ValueError("expected required Draco compression extension")
    meshes = gltf.get("meshes", [])
    nodes = gltf.get("nodes", [])
    mesh_nodes = [node for node in nodes if node.get("mesh") is not None]
    if len(meshes) != expected_meshes or not mesh_nodes:
        raise ValueError(f"mesh metadata mismatch: {len(meshes)} meshes, {len(mesh_nodes)} mesh nodes")
    if any(node["mesh"] >= len(meshes) for node in mesh_nodes):
        raise ValueError("node references a missing mesh")
    bin_offset = 20 + json_length
    bin_data = b""
    if bin_offset < len(data):
        if bin_offset + 8 > len(data):
            raise ValueError("truncated GLB binary chunk header")
        bin_length, bin_type = struct.unpack_from("<I4s", data, bin_offset)
        if bin_type != b"BIN\0" or bin_offset + 8 + bin_length > len(data):
            raise ValueError("invalid GLB binary chunk")
        bin_data = data[bin_offset + 8 : bin_offset + 8 + bin_length]
    for view in gltf.get("bufferViews", []):
        if view.get("buffer", 0) != 0:
            raise ValueError("unexpected external buffer")
        start = view.get("byteOffset", 0)
        if start < 0 or start + view["byteLength"] > len(bin_data):
            raise ValueError("buffer view points outside the embedded binary chunk")
    return {"meshObjects": len(mesh_nodes), "meshes": len(meshes), "requiredExtensions": gltf["extensionsRequired"]}


def main():
    manifest_path = Path(sys.argv[sys.argv.index("--") + 2]).resolve()
    output_dir = manifest_path.parent
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    checked = []
    for model in manifest["models"]:
        for lod in model["lods"]:
            path = output_dir / lod["path"].removeprefix("/models/vehicles/flying/")
            if not path.is_file() or path.stat().st_size < 20:
                raise FileNotFoundError(f"missing or empty GLB: {path}")
            checked.append({"model": model["id"], "lod": lod["level"], **inspect(path)})
    candidates = []
    for model in manifest.get("candidates", []):
        path = output_dir / model["path"].removeprefix("/models/vehicles/flying/")
        if not path.is_file() or path.stat().st_size < 20:
            raise FileNotFoundError(f"missing or empty candidate GLB: {path}")
        candidates.append({"model": model["id"], **inspect_compressed_glb(path, model["meshes"])})
    print(json.dumps({"validated": len(checked), "compressedCandidates": len(candidates), "results": checked, "candidates": candidates}, separators=(",", ":")))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build the World Builder commercial-building placement catalog from GLBs.

Uses only Python's standard library. GLB mesh positions are transformed through
the glTF node hierarchy, anchored to a center-bottom pivot, and split into
floor/wall/roof triangle groups for the existing placement renderer and server.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import struct
from pathlib import Path
from typing import Any


COMPONENTS = {
    5120: ("b", 1),
    5121: ("B", 1),
    5122: ("h", 2),
    5123: ("H", 2),
    5125: ("I", 4),
    5126: ("f", 4),
}
TYPE_WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def label_from_name(name: str) -> str:
    value = Path(name).stem.replace("_", " ").replace("-", " ")
    value = re.sub(r"\b(glb|level)\b", lambda m: "Level" if m.group(0).lower() == "level" else "", value, flags=re.I)
    value = re.sub(r"\b(\d+)x(\d+)\b", r"\1×\2", value, flags=re.I)
    return re.sub(r"\s+", " ", value).strip().title()


def collection_for_name(name: str) -> tuple[str, str]:
    key = Path(name).stem.lower().replace("_", "-")
    if any(tag in key for tag in ("bowling", "comedy", "arcade", "karaoke", "skybar")):
        return "entertainment", "Entertainment & nightlife"
    if any(tag in key for tag in ("burger", "cafe", "fry-guys", "shake-it")):
        return "dining", "Dining & food"
    if any(tag in key for tag in ("laundry", "laundromat")):
        return "services", "Local services"
    if any(tag in key for tag in ("shop", "retail", "bookstore", "souvenir")):
        return "retail", "Retail & storefronts"
    if any(tag in key for tag in ("commercial", "com-", "mcw", "rci", "terrace")):
        return "modular", "Commercial modules"
    return "local-business", "Local businesses"


def read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    raw = path.read_bytes()
    if len(raw) < 20 or raw[:4] != b"glTF":
        raise ValueError(f"{path.name}: not a GLB file")
    version, total_length = struct.unpack_from("<II", raw, 4)
    if version != 2 or total_length != len(raw):
        raise ValueError(f"{path.name}: unsupported or truncated GLB")
    offset = 12
    document = None
    binary = b""
    while offset < len(raw):
        length, kind = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunk = raw[offset : offset + length]
        offset += length
        if kind == 0x4E4F534A:
            document = json.loads(chunk.decode("utf-8"))
        elif kind == 0x004E4942:
            binary = chunk
    if document is None:
        raise ValueError(f"{path.name}: missing JSON chunk")
    return document, binary


def accessor_values(doc: dict[str, Any], binary: bytes, index: int) -> list[Any]:
    accessor = doc["accessors"][index]
    if "sparse" in accessor:
        raise ValueError("sparse glTF accessors are not supported by this generator")
    view = doc["bufferViews"][accessor["bufferView"]]
    code, component_bytes = COMPONENTS[accessor["componentType"]]
    width = TYPE_WIDTH.get(accessor["type"], 1)
    item_bytes = component_bytes * width
    stride = view.get("byteStride", item_bytes)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    output = []
    for item in range(accessor["count"]):
        values = struct.unpack_from("<" + code * width, binary, start + item * stride)
        output.append(values[0] if width == 1 else values)
    return output


def multiply(a: list[list[float]], b: list[list[float]]) -> list[list[float]]:
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def node_matrix(node: dict[str, Any]) -> list[list[float]]:
    if "matrix" in node:
        source = node["matrix"]
        return [[source[c * 4 + r] for c in range(4)] for r in range(4)]
    tx, ty, tz = node.get("translation", [0, 0, 0])
    sx, sy, sz = node.get("scale", [1, 1, 1])
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    rotation = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]
    return [
        [rotation[0][0] * sx, rotation[0][1] * sy, rotation[0][2] * sz, tx],
        [rotation[1][0] * sx, rotation[1][1] * sy, rotation[1][2] * sz, ty],
        [rotation[2][0] * sx, rotation[2][1] * sy, rotation[2][2] * sz, tz],
        [0, 0, 0, 1],
    ]


def transform_point(matrix: list[list[float]], point: tuple[float, float, float]) -> tuple[float, float, float]:
    x, y, z = point
    return (
        matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z + matrix[0][3],
        matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z + matrix[1][3],
        matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z + matrix[2][3],
    )


def primitives(doc: dict[str, Any], binary: bytes):
    nodes = doc.get("nodes", [])
    meshes = doc.get("meshes", [])
    scenes = doc.get("scenes", [])
    roots = scenes[doc.get("scene", 0)].get("nodes", []) if scenes else [i for i, n in enumerate(nodes) if not any(i in p.get("children", []) for p in nodes)]

    def visit(node_index: int, parent: list[list[float]]):
        node = nodes[node_index]
        world = multiply(parent, node_matrix(node))
        mesh_index = node.get("mesh")
        if mesh_index is not None:
            for primitive in meshes[mesh_index].get("primitives", []):
                if primitive.get("mode", 4) not in (4, 5, 6):
                    continue
                positions = accessor_values(doc, binary, primitive["attributes"]["POSITION"])
                points = [transform_point(world, tuple(map(float, p[:3]))) for p in positions]
                index_id = primitive.get("indices")
                indices = accessor_values(doc, binary, index_id) if index_id is not None else list(range(len(points)))
                indices = [int(i) for i in indices]
                mode = primitive.get("mode", 4)
                if mode == 5:
                    triangles = [(indices[i], indices[i + 1], indices[i + 2]) if i % 2 == 0 else (indices[i + 1], indices[i], indices[i + 2]) for i in range(len(indices) - 2)]
                elif mode == 6:
                    triangles = [(indices[0], indices[i], indices[i + 1]) for i in range(1, len(indices) - 1)]
                else:
                    triangles = [tuple(indices[i : i + 3]) for i in range(0, len(indices) - 2, 3)]
                yield points, triangles
        for child in node.get("children", []):
            yield from visit(child, world)

    identity = [[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0], [0.0, 0.0, 1.0, 0.0], [0.0, 0.0, 0.0, 1.0]]
    for root in roots:
        yield from visit(root, identity)


def build_asset(path: Path, asset_root: Path, public_base: str) -> dict[str, Any]:
    doc, binary = read_glb(path)
    chunks = list(primitives(doc, binary))
    points = [point for mesh_points, _ in chunks for point in mesh_points]
    if not points:
        raise ValueError(f"{path.name}: contains no triangle meshes")
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    origin = [(low[0] + high[0]) / 2, low[1], (low[2] + high[2]) / 2]
    size = [high[i] - low[i] for i in range(3)]
    height = max(size[1], 1e-6)
    groups: dict[str, dict[str, Any]] = {role: {"role": role, "vertices": [], "indices": [], "lookup": {}} for role in ("floor", "walls", "roof")}

    def vertex_id(group: dict[str, Any], point: tuple[float, float, float]) -> int:
        local = tuple(round(point[i] - origin[i], 6) for i in range(3))
        key = tuple(round(n * 1_000_000) for n in local)
        if key not in group["lookup"]:
            group["lookup"][key] = len(group["vertices"])
            group["vertices"].append(local)
        return group["lookup"][key]

    for mesh_points, triangles in chunks:
        for ia, ib, ic in triangles:
            if max(ia, ib, ic) >= len(mesh_points):
                continue
            a, b, c = mesh_points[ia], mesh_points[ib], mesh_points[ic]
            ab = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
            ac = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
            normal = (
                ab[1] * ac[2] - ab[2] * ac[1],
                ab[2] * ac[0] - ab[0] * ac[2],
                ab[0] * ac[1] - ab[1] * ac[0],
            )
            length = math.sqrt(sum(n * n for n in normal))
            if length < 1e-10:
                continue
            vertical = abs(normal[1] / length)
            center_y = (a[1] + b[1] + c[1]) / 3
            role = "roof" if vertical > 0.72 and center_y >= low[1] + height * 0.78 else "floor" if vertical > 0.72 else "walls"
            group = groups[role]
            group["indices"].append([vertex_id(group, v) for v in (a, b, c)])

    colliders = []
    for role, group in groups.items():
        if not group["indices"]:
            continue
        colliders.append({"role": role, "vertices": group["vertices"], "indices": group["indices"]})

    identity = slug(path.stem)
    collection_id, collection_label = collection_for_name(path.name)
    relative_url = path.relative_to(asset_root).as_posix()
    return {
        "id": f"commercial-{identity}",
        "label": label_from_name(path.name),
        "category": "buildings",
        "collection": collection_label,
        "description": f"{collection_label} · measured GLB · structural collision surfaces",
        "lods": [{"lod": 0, "url": f"{public_base.rstrip('/')}/{relative_url}", "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}],
        "source_scale": 1,
        "origin": [round(v, 6) for v in origin],
        "size": [round(v, 6) for v in size],
        "bounds": {
            "min": [round(low[i] - origin[i], 6) for i in range(3)],
            "max": [round(high[i] - origin[i], 6) for i in range(3)],
        },
        "colliders": colliders,
    }


def main() -> None:
    script_path = Path(__file__).resolve()
    root = script_path.parent.parent if script_path.parent.name == "scripts" else script_path.parent
    source = Path(__import__("sys").argv[1]).resolve() if len(__import__("sys").argv) > 1 else root / "frontend/public/models/buildings/commercial"
    output = Path(__import__("sys").argv[2]).resolve() if len(__import__("sys").argv) > 2 else root / "avenlab-server/src/assets/models/commercial-buildings.json"
    assets = [build_asset(path, source, "/models/buildings/commercial") for path in sorted(source.rglob("*.glb"))]
    if not assets:
        raise SystemExit(f"No GLBs found in {source}")
    ids = [asset["id"] for asset in assets]
    if len(ids) != len(set(ids)):
        raise SystemExit("Model filename collision: duplicate catalog ID")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"format": "avenlab-placement-catalog", "version": 1, "assets": assets}, separators=(",", ":")) + "\n", encoding="utf-8")
    total_triangles = sum(sum(len(mesh["indices"]) for mesh in asset["colliders"]) for asset in assets)
    print(f"Wrote {len(assets)} assets, {total_triangles} structural triangles to {output}")


if __name__ == "__main__":
    main()

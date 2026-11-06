"""Build the playable Hawaii ship GLB and its selection portrait.

Run from the repository root:
    blender -b -noaudio --python scripts/prepare-hawaii-rescue.py -- <source.fbx>

The source FBX is deliberately external to Git. The two generated artifacts are
all that the frontend needs; preserve named weapon/radar meshes for later rigs.
"""

import math
import pathlib
import sys

import bpy
from mathutils import Vector


def look_at(obj, point):
    direction = Vector(point) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


root_dir = pathlib.Path(__file__).resolve().parent.parent
arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if not arguments:
    raise SystemExit("Pass the original USS Hawaii FBX after --")
source = pathlib.Path(arguments[0]).resolve()
if not source.is_file():
    raise SystemExit(f"Missing original Hawaii FBX: {source}")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=str(source))
objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if not objects:
    raise SystemExit("The FBX contains no renderable ship meshes")

# The original has several pure-white, almost-mirror hull materials. Retain
# authored metal/rust accents while shifting main naval surfaces to muted PBR.
paint = {
    "Hull": ((0.31, 0.37, 0.42, 1.0), 0.74, 0.18),
    "Hull.001": ((0.28, 0.34, 0.39, 1.0), 0.76, 0.16),
    "Hull.005": ((0.36, 0.41, 0.46, 1.0), 0.70, 0.14),
    "Hull_Dark": ((0.17, 0.23, 0.29, 1.0), 0.80, 0.16),
    "Hull_Light": ((0.43, 0.50, 0.55, 1.0), 0.77, 0.08),
    "Glass": ((0.045, 0.10, 0.14, 1.0), 0.18, 0.24),
}
for material in bpy.data.materials:
    if material.name not in paint:
        continue
    color, roughness, metallic = paint[material.name]
    material.diffuse_color = color
    material.roughness = roughness
    material.metallic = metallic
    if material.use_nodes:
        for node in material.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Base Color"].default_value = color
                node.inputs["Roughness"].default_value = roughness
                node.inputs["Metallic"].default_value = metallic

# The FBX is modeled along Blender +X. Convert it to glTF +Z-forward while
# keeping its original per-part object names (radar, mounts, guns, and deck).
center = Vector((0.0, 0.0, 0.0))
root = bpy.data.objects.new("HAWAII_RESCUE_ROOT", None)
bpy.context.scene.collection.objects.link(root)
for obj in objects:
    matrix = obj.matrix_world.copy()
    obj.parent = root
    obj.matrix_world = matrix
root.rotation_euler.z = -math.pi / 2

model_path = root_dir / "frontend/public/models/vehicles/fleet/destroyers/hawaii-rescue/model.glb"
model_path.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(model_path), export_format="GLB", use_selection=False,
    export_apply=True, export_cameras=False, export_lights=False,
)
print(f"HAWAII exported {model_path} with {len(objects)} mesh parts")

# Make an asset-derived portrait instead of relying on an unrelated photo.
# Render from the source coordinates, before conversion, for a clear silhouette.
root.rotation_euler.z = 0.0
world = bpy.context.scene.world
world.color = (0.045, 0.065, 0.095)
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.075, 0.11, 0.17, 1.0)
background.inputs["Strength"].default_value = 0.85

for location, power, size in [((1.2, -5.0, 8.0), 570, 5.0), ((-4, 2.5, 4.0), 300, 4.0)]:
    data = bpy.data.lights.new("Hawaii studio light", "AREA")
    data.energy = power
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(data.name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    look_at(obj, center)

camera_data = bpy.data.cameras.new("Hawaii portrait camera")
camera = bpy.data.objects.new("Hawaii portrait camera", camera_data)
bpy.context.scene.collection.objects.link(camera)
camera.location = (6.6, -8.7, 5.4)
look_at(camera, center)
camera_data.type = "ORTHO"
camera_data.ortho_scale = 8.6
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 1000
scene.render.resolution_y = 600
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "Medium High Contrast"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
portrait = root_dir / "frontend/public/portraits/boats/hawaii-rescue.png"
portrait.parent.mkdir(parents=True, exist_ok=True)
scene.render.filepath = str(portrait)
bpy.ops.render.render(write_still=True)
print(f"HAWAII portrait {portrait}")

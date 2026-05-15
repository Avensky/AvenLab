# AvenLab

AvenLab is a real-time vehicle simulation and ML engine powered by a Rust/Rappier physics core and a React Three Fiber frontend. It supports deterministic backend physics, multiplayer networking, dataset recording, and tools for autonomous control, reinforcement learning, and CAN-bus modeling.

# AvenLab

### Real-Time Vehicle Simulation, Machine Learning, and Autonomous Systems Research Platform

AvenLab is a next-generation vehicle simulation and machine-learning engine designed for real-time physics, autonomous control, and multiplayer environments. Built with a modern architecture using a Rust-powered physics backend (Rappier), a React Three Fiber visualization frontend, and a modular networking layer, AvenLab enables high-performance experimentation across robotics, vehicle dynamics, and AI-driven behavior learning.

---

## 🔥 Core Features

- **Real-Time Physics Engine** powered by Rappier
- **Backend-Driven Simulation** for deterministic multiplayer
- **Neural & ML Integration** for vehicle control, CAN-signal interpretation, and reinforcement learning
- **Modular Architecture** supporting multiple vehicle types (cars, tanks, multi-axle platforms)
- **High-Performance Visualization** using React Three Fiber
- **Socket-Based Networking** for live state syncing
- **Recording & Replay System** for dataset generation and training
- **Self-Driving Research Tools** (future)

---

## 🎯 Project Goals

- Develop a research-grade environment for vehicle dynamics
- Explore adversarial ML for CAN bus interpretation and autonomous driving
- Provide a flexible platform for physics-based multiplayer games
- Support ML-based controllers and reinforcement learning
- Build a translatable sim-to-real pipeline

---

## 🗂 Tech Stack

- **Backend Physics:** Rust + Rappier
- **Frontend Visualization:** React Three Fiber
- **Networking:** Socket.IO (with optional WebRTC)
- **ML Pipeline:** Python, PyTorch, custom datasets
- **Deployment:** Node.js, Vite, Nginx, Docker

---

## 🌐 Demo

Coming soon at **<https://avensky.com/avenlab>**

---

## 📄 License

MIT License

## Installation

install nvm 20

install cargo based on your architecture

cargo install cargo-watch

## export via scripts

import bpy
import os

SOURCE_COLLECTION = "Block_01"
OUTPUT_PATH = r"C:\Users\uriel\Projects\AvenLab\client\public\models\blocks\block_01\block_01.glb"

EXPORT_COLLECTION = "BLOCK_01_JOINED"
JOINED_NAME = "block_01_joined"

def mesh_objects_recursive(collection):
objs = []
for obj in collection.objects:
if obj.type == "MESH" and not obj.hide_get() and not obj.hide_viewport:
objs.append(obj)
for child in collection.children:
objs.extend(mesh_objects_recursive(child))
return objs

# Get source collection

src_col = bpy.data.collections.get(SOURCE_COLLECTION)
if not src_col:
raise Exception(f"Missing collection: {SOURCE_COLLECTION}")

src_objs = mesh_objects_recursive(src_col)
if not src_objs:
raise Exception(f"No visible mesh objects found in {SOURCE_COLLECTION}")

print("Source mesh count:", len(src_objs))

# Ensure object mode

if bpy.context.object and bpy.context.object.mode != "OBJECT":
bpy.ops.object.mode_set(mode="OBJECT")

# Remove old temp collection if it exists

old = bpy.data.collections.get(EXPORT_COLLECTION)
if old:
for obj in list(old.objects):
bpy.data.objects.remove(obj, do_unlink=True)
bpy.data.collections.remove(old)

# Create temp collection

export_col = bpy.data.collections.new(EXPORT_COLLECTION)
bpy.context.scene.collection.children.link(export_col)

# Duplicate objects WITHOUT changing originals

dupes = []

for obj in src_objs:
dup = obj.copy()
dup.data = obj.data.copy()

    # Preserve world transform
    dup.matrix_world = obj.matrix_world.copy()

    export_col.objects.link(dup)
    dupes.append(dup)

print("Duplicated mesh count:", len(dupes))

# Select only duplicates

bpy.ops.object.select_all(action="DESELECT")

for obj in dupes:
obj.select_set(True)

bpy.context.view_layer.objects.active = dupes[0]

# Join duplicates

bpy.ops.object.join()

joined = bpy.context.object
joined.name = JOINED_NAME
joined.data.name = f"{JOINED_NAME}\_mesh"

# Apply rotation/scale only on duplicate joined mesh

bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

print("Joined object:", joined.name)
print("Polygons:", len(joined.data.polygons))
print("Material slots:", len(joined.material_slots))

# Select only joined object for export

bpy.ops.object.select_all(action="DESELECT")
joined.select_set(True)
bpy.context.view_layer.objects.active = joined

# Make sure output folder exists

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

# Export selected joined object

bpy.ops.export_scene.gltf(
filepath=OUTPUT_PATH,
export_format="GLB",
use_selection=True,
export_apply=True,

    # Materials/textures
    export_materials="EXPORT",

    # Texture compression
    export_image_format="WEBP",
    export_image_quality=75,

    # Turn off unused extras
    export_lights=False,
    export_cameras=False,
    export_skins=False,
    export_animations=False,
    export_morph=False,

    # Draco compression
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14,
    export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=12,
    export_draco_color_quantization=10,
    export_draco_generic_quantization=12,

)

print("Exported:", OUTPUT_PATH)

# Clean up temp joined object + collection

bpy.data.objects.remove(joined, do_unlink=True)

if export_col.name in bpy.data.collections:
bpy.data.collections.remove(export_col)

print("Cleaned temp export objects. Original Blender file unchanged.")

AVENLAB BLACK AND GOLD BAG PROP

Contents
- bag-black-gold-mobile.glb: 1024 x 1024 textures, about 2.9 MB.
- bag-black-gold-garage.glb: 2048 x 2048 textures, about 10.0 MB.
- bag-black-gold-master.blend: editable static mesh with packed 2K textures.
- bag-prop.json: dimensions, source details, and integration notes.
- bag-preview.png: studio render of the exported 2K GLB after reimport.

Source and appearance
Uses the supplied SM_Bag.fbx and all five TGA maps from Textures(2).zip.
The Maya binary Bag(2).mb was not opened; it is not needed for this conversion.
The supplied appearance is black leather with gold detailing.
The original uploads have not been changed.

Geometry and scale
10,932 triangles; one mesh and one opaque, double-sided PBR material.
UVs and source geometry are retained. No decimation was performed.
The bag was normalized to 0.30 m wide for a handheld prop. This is an adjustable
working assumption, not a verified real-world dimension. Overall dimensions are
approximately 0.30 m wide, 0.233 m high, and 0.122 m deep.
Root origin: bottom center. GLB uses the standard Y-up coordinate system.
The bag front faces positive Z in the GLB. Blender source uses Z up.

Attachment helpers
Bag_Prop is the root; Bag_Mesh is the visible geometry.
Grip_Handle marks an approximate grip location at the center of the handle.
Rest_Base marks the bottom-center placement reference.
The grip requires fitting to the actual character hand, pose, and outfit.
To align an attachment, use the inverse of the grip anchor transform relative
to the prop root, then tune hand rotation and contact clearance.

Materials
Base color is sRGB; normal and packed ORM are data textures.
ORM channels: red = ambient occlusion, green = roughness, blue = metallic.
All GLB textures are embedded; no external texture files are needed.
The normal map retains the source channel orientation. No green-channel flip
was applied; confirm microdetail orientation under the target game's lighting.
1K and 2K versions use identical geometry. The 1K version is a smaller-texture
candidate for mobile scenes, not a measured mobile performance guarantee.
Material mapping reference:
https://docs.blender.org/manual/en/3.6/addons/import_export/scene_gltf2.html

Emote scope
This is a static prop preparation, with no character animation clips, skins,
flap rig, cloth simulation, collision hull, or game integration included.
It can be attached for carrying, hugging, lifting, showing, and placement.
Opening the flap and rummaging require additional mesh/rig work.
Keep props optional, and skip bag-dependent motions when the bag is unequipped.

Verification
Both GLBs were parsed for geometry, material references, embedded image
resolutions, and absence of external dependencies. The 2K GLB was reimported
and rendered in Blender. In-game hand contact, garment clearance, and target
device performance remain to be checked during emote integration.

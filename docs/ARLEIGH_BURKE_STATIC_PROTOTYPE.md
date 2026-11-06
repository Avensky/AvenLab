# Arleigh Burke · first AvenLab fleet prototype

The supplied Arleigh Burke destroyer is now available as a placeable World
Builder prop (`arleigh-burke-docked`) and as a **static harbor escort** next to
each active docked Big E. This stage validates ship proportions, deck collision
and carrier-to-escort boarding before attempting moving platforms or buoyancy.

## What is implemented

- `public/models/fleet/burke-lod0.glb`: 80,609 triangles, self-contained gray
  PBR materials. The source Blender model's 22 missing textures are not needed.
- `public/models/fleet/burke-lod1.glb`: 47,381 triangles; swap at approximately
  220 m through a shared R3F detail component.
- 154 m length and 21.3 m beam; exported GLB is Y-up and its bow is rotated to
  AvenLab's usual local **-Z** forward in the renderer.
- Ten conservative Rapier box colliders: underwater hull, foredeck, side
  passages, raised aft platform, helicopter landing zone and bridgehouse.
- A walkable sloping gangway between the carrier and the destroyer's aft
  landing area. This stays separate from the existing shore-to-carrier ramp.
- A selectable 3D preview and deck panorama in World Builder.

Both harbor teams receive one static escort in `harbor_canal_fleet`; the red
and blue harbor variants receive an escort for their active carrier.

## Where to find it

In World Builder, open **Props** and select **Arleigh Burke · escort destroyer**.
The prefab's editable origin is at its keel. For the harbor whose surface is
`y=-8`, place the keel at approximately `y=-17.5`. The harbor preset already
places it there, with a rigid deck approximately `y=-4` at the stern and a
raised foredeck toward the bow.

The collision boxes were measured from the uploaded model's horizontal faces,
but they intentionally simplify curved surfaces, railings, stairways and
turret clearances. They are suitable for prototype driving/standing tests,
not final character navigation or weapons collision.

## Rebuilding preset maps

After a code update, run:

```bat
node scripts\build-harbor-canals.mjs
```

The installer included in the downloadable patch does this automatically.
The same generated authored layout feeds the frontend and the server's
Rapier colliders; an unrebuilt server map will not have the new ship deck.

## Next milestone (not included)

1. Author server-controlled rigid-body ship movement and buoyancy, using the
   `EntityType::Ship` classification and a new ship-control profile.
2. Move/rotate the deck as a network-authoritative kinematic platform, and
   carry vehicles/players without teleporting or losing contact.
3. Add separate gun/radar pivots, naval ballistics, VLS/AA abilities, and
   hull damage zones with suitable mass and recoil.
4. Add enter/exit and faction ownership controls with minimap contacts and
   damage/repair behavior.

This is not presented as a drivable ship until those systems exist. The
converted originals remain untouched.

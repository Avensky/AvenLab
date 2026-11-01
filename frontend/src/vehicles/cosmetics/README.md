# Coordinated appearance foundation

Settings → Appearance owns the app palette, showroom bundle preview, shared body finish and cockpit accent matching. The editor consumes that same preferencesStore.theme; old editor theme payloads are ignored. Hacker Blue and Forest are now in the shared theme catalog.

Bundles reference stable individual cosmetic IDs. Base UI themes remain free and independent of cosmetics. All cosmetic records here are preview-only. For live commerce, implement a server entitlement/equip endpoint and replicate validated slot IDs; do not trust localStorage, prices or client-owned booleans. No checkout, inventory, ownership grant or network cosmetic replication is implemented in this patch.

| Slot | Current implementation | Remaining asset work |
| --- | --- | --- |
| Body | AE86 Primary, BRZ body, Camaro ext.001 atlas tint, Supra PaintTNR | White Camaro retains atlas shading/details |
| Camaro stripes | Reserved individual item and white/red bundle | Exterior UV stripe mask/decal, authored with atlas alignment |
| FR-S seats | Reserved black-seat item | Confirm mesh/material assignment before tinting; never guess generic Color_* materials |
| FR-S stitching | Reserved red-stitch item | Stitch mask or dedicated material/geometry |
| Steering | HUD wheel stitching and cockpit accent CSS variable | Physical GLB wheel material mapping per car |

The FR-S reference uses BRZ body roughness 0.20529644 and clearcoat roughness 0.04. Shared finish is a showroom body-material adjustment, not a particle emitter. Factory restores prepared authored roughness (including the Supra safety repair); Soft uses Appearance's custom softness value. Lighting, UVs and geometry still affect highlight shape. Garage bloom remains separately adjustable.

Local preview colors/finishes do not change physics, cached GLBs, other players, or live vehicle paint. Hook future validated appearance into instance-owned gameplay material clones, never cached useGLTF materials. Keep unreadable cosmetic accents out of normal UI text.

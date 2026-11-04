# Tank hatch and roof gun alignment

Hatch_Hull was a visible sibling of the body instead of part of Tank_TurretYaw. It is now attached with its existing world transform preserved, alongside the turret and its other hatches. The chassis Hull stays separate.

The machine gun is already baked into the Turret mesh, opposite Hatch_Hull. The previous extra coax barrel is removed. Its muzzle flash is now anchored on the model's right side (-X for +Z-forward), measured from the uploaded gun tip at approximately (-0.505, 2.2, 1.406) model metres. The effect adds 0.035 m of forward clearance. Relative to the yaw pivot this is (-0.505, 0.90, 1.341).

The flash follows the roof gun's yaw, without being pulled away when the separate cannon elevates or recoils. The existing baked gun geometry is not split into a new elevation rig in this patch; aiming controls and damage/reload balance remain as before.

Rust uses the same roof mounting point for machine-gun ray origin and near-barrel obstruction checks. Confirmed shot_origin is an optional server-generated snapshot field; client input cannot override it. If a model anchor is not mounted on a client, effects can use this authoritative origin. No GLB edits or replacement assets are needed.

## Validation

168 Rust tests pass, including a narrow right-side target and rejection of client-forged origins. TypeScript and lint pass. Uploaded-model browser checks verify hatch/gun parenting, alignment at three yaw headings, a stationary chassis while the turret rotates, and a stable MG exit during cannon elevation. Installer and bundle results are recorded in validation.json.

## Player feedback

Verify the hatch and firing flash with your installed GLB, especially from cockpit/scope and while driving over uneven ground. An independently elevating roof-gun mesh remains separate future rig work.

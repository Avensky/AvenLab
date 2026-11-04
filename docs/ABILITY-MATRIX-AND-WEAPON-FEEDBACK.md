# Ability matrix and confirmed weapon feedback

Built on ee0885f. Includes the preceding scope-lock return and direct weapon-face firing changes.

- Abilities sit right of the normal-size aim joystick in two columns; FIRE is bottom right. Free Aim/Angle Lock and Reset are separate circular rim utilities, like the minimized cabin widgets. They retain keyboard/controller shortcuts.
- Ability cooldowns use a smaller white inner border, a thick glowing inner arc filling in the opposite direction to the outer arc, and full glow when ready. Progress follows the server timer. The Hero X footer layout is unchanged.
- Ignition and pedals share height and bottom alignment, including compact landscape. Engine-on dimming remains.
- LT already provides the service brake, followed by reverse at low speed in automatic Drive with RT released. B is the e-brake. Both remain available; the controller guide distinguishes them.
- Cannon flashes use the uploaded Cannon mesh's measured front edge, attached to the recoil pivot. No GLB replacement is required.
- The uploaded roof machine gun is baked into Turret. Its smaller muzzle flash now follows that existing right-side gun; the earlier placeholder barrel has been removed.
- The server publishes the actual fired weapon, confirmed impact position, surface normal and whether the hit was static. Changing selected weapon cannot relabel the last shot. Both local and remote tank snapshots drive effects. Clients joining late do not replay old shots.
- Static wall/floor hits leave surface-aligned marks for 12 seconds. Dynamic vehicles receive a brief impact flash; marks are not left floating in world space. A shared pool caps marks at 64 and active bursts at 48, using two instanced draws. Marks are cosmetic, client-local and disappear on world change; they are not permanent damage or a persistent multiplayer decal history.
- Existing damage still resolves immediately on the Rust gravity arc. Effects indicate that result; this update does not add travelling shell simulation or change reload/damage balance. Coax origin now uses its shorter offset rather than the cannon muzzle.
- Removes the obsolete WorldPortrait.tsx that can shadow the renamed portrait component. Keeps the existing WorldPortraitCard implementation.

## Feedback / pending

- Test the cannon tip and roof MG mount under extreme elevation and hull roll with your own model/settings. Separating the baked roof gun for independent visual elevation remains future rig work.
- Check the new white border and opposing glow at your preferred HUD scale and theme; real mobile thumb reach and controller feel need player feedback.
- The service-brake/e-brake mapping is clarified, not remapped. A dedicated drift physics update is still separate work.

## Validation

See validation.json in the ZIP for current checks. Source compilation/bundle tests and real uploaded tank-model effect checks are included. The full npm prebuild asset check needs your Git LFS road/garage assets; the isolated checkout contains road LFS pointers. Original GLBs are not shipped or overwritten by this update.

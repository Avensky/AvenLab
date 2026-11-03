# Original Hero fill, shared HUD and retained practice sessions

## Hero confirmation and ability faces

The reference is the first `AvenLab-hero-selection-and-hold-X-update.zip`, recovered and compared with later releases. Its original geometry is restored in `ProgressOrbit`: a single r=27 arc on a 64-unit SVG, plus the 50px rotating blue trail, original 5% / 45% / 100% conic stops, 6px source blur, and full blue ready glow. The later mirrored second arc/halo is removed. The entire source artwork is scaled together inside a fixed 28px Hero slot (34px for abilities). This preserves the arc/trail relationship while the footer remains 32px high.

Hold-X is available in both the Hero collection and styling view. A remains available in both: Customize opens styling, Edit Style focuses its controls. Preview/edit changes do not choose a main; a complete 1.2-second hold still does. Saved main selection, cancellation on blur/release and per-player ordered saving remain unchanged. Ability refill uses the identical component with progress derived from the server cooldown rather than held time.

## Shared driving HUD and cockpit

The aim/actions deck no longer has tank-specific layout selectors. `VehicleAbilityActions` supplies a vehicle's current loadout to the common deck; `VehicleAimControls` owns the shared pointer input. The tank currently supplies cannon/coax/lock/reset/scope/Ram, while other enabled editor mounts reuse the fire/lock controls. Future abilities and mounts should extend this composition rather than add separate floating overlays. Free placement of HUD items is not implemented yet.

Ignition uses the same footprint for every vehicle, left of assists. Both its wrapper and actual artwork are constrained to 48px, lifted clear of the viewport edge, and dimmed while the engine runs. Portrait steering clearance is shared across cars and tanks.

Each cockpit Column page retains its wheel selector and adds the selected large working lever on the right (stacked on narrow portrait screens). The large lever uses the same command wiring, direction mapping, momentary release, washer/high-beam holds and cruise actions as the driving stalk. It is not a disconnected illustration. Enlarged faces have separated hit targets.

Vehicles start with angle lock on. Entering tank scope releases it and scope prevents re-locking; leaving scope leaves free aim until the player enables lock again. This avoids a hidden lock fighting scope aiming. Cars without live mounts do not gain fictional working weapons.

## Ram logistics and temperature

Timing stays 3 seconds charge + 4 seconds reduced boost, 60-second cooldown, one-second enemy contact stun once per activation. Ram now draws from the real NOS gauge: the tank carries 21 seconds of reserve and needs about 7 seconds available to start. Reserve is consumed while the effect runs; cancellation saves the unspent remainder. A tank cannot stack ordinary NOS power on top of Ram.

Fuel/service stations refill NOS at 1.5 reserve seconds per second while stopped; a repair-only shop repairs condition. Destroyed bays provide no service. There is no passive nitrous refill and reset does not refill it.

Active Ram uses a 0.02 thermal multiplier and a maximum positive heat rate of 0.2°C/s. Tank heat gain outside Ram is bounded at 0.3°C/s; normal cooling still applies. The deferred heat cost is reduced from 6°C to 2°C. The 10-liter activation cost, 4-percentage-point condition cost, reserve consumption and cooldown remain strategic costs. These values are alpha balance settings, not real tank specifications.

## Overheating: weak, still drivable

Overheating now enters a limp-home debuff at the existing danger temperature instead of shutting the engine off. The separate heat-lock/restart latch is removed. A hot engine can be started normally, including above the old critical threshold, provided it still has fuel and mechanical condition.

Limp mode limits power to 30% of the normal heat/condition-adjusted output, governs the drive-speed target to at most 8 m/s (about 29 km/h), disables boost/Ram and reduces heat production. Temperature falls by at least 0.6°C/s while driving; stopping the engine cools at least 2°C/s. Steering and braking remain available and existing momentum is not teleported away. Normal performance returns once temperature is within 10°C of the vehicle's normal starting temperature, or sooner through repair/service cooling. Repair/service bays cool at 3°C/s while stopped.

Heat still causes condition wear, but thermal wear alone cannot reduce condition below 10% and permanently strand the player. Existing weapon/collision damage and fuel depletion retain their consequences. The dashboard shows LIMP HOME, COOLING or RESTART READY; radio status also reports limp mode. This is an arcade balance model, not real engine thermodynamics.

## Retaining practice physics

The socket previously stopped reading after 30 seconds of silence, and disconnect immediately called the body-destruction path. The read deadline is now 120 seconds. Authenticated sandbox/editor deployments receive a ten-minute retained-body lease on unexpected disconnect, including custom worlds. The body, current position, map/destruction state, resources and configuration remain in the same runtime. An otherwise empty practice runtime pauses; held inputs are cleared. If other clients remain in a shared custom world, physics continues normally.

The same authenticated profile can reclaim its original body under the new connection ID. Server maps/configs arrive before recovery completes; the client never creates a replacement body as a recovery shortcut. Reassignment transfers all per-player physics state. Reconnect ownership/capacity checks still apply. An explicit Leave destroys the body and releases the slot. Expired leases remove the body and release capacity. Retained slots still count toward world/player limits.

Quickplay/competitive keep their existing short seat reservations; bodies are not retained there. If a body/world cannot be recovered, or recovery times out, the client posts a local SYSTEM chat notice and returns to Play with the previous mode selected. It does not silently respawn or choose a different main. A lost body in an otherwise live connection and stopped physics updates have separate detection paths. Returning to a tab gives queued frames a short grace period before reconnecting, avoiding unnecessary reconnects caused by timer throttling.

A browser reload or server restart does not reconstruct unsaved physics. Save/export editor documents as before. Real browser suspension/GPU behavior still needs testing on the user's devices.

## World portraits and barrier impacts

Play's environment selector now has a large portrait above its existing selection bar. The preview is generated from the same installed Rust map document and follows map changes. It depicts map geometry, including a single correct conversion of legacy Blender collider coordinates. It is explicitly labeled MAP GEOMETRY PREVIEW: final GLB photography/landmark thumbnails remain a future visual upgrade. Cache/work are bounded; unavailable sources show PREVIEW PENDING rather than a broken image.

Authored destructible road barriers now take mass/speed-based contact damage without requiring Ram. A heavy tank can break an edge rail at a speed where a light car does much less damage. Resting contact does not damage it, repeated contacts are rate limited, destroyed collision is disabled, and health replicates through the existing snapshot. Indestructible barriers and permanent land/land bridges stay protected. The impact uses authored `barrier` pieces; arbitrary decorative GLB rails need a matching authored collider/destruction setting.

Cannon shot counters and impact positions are replicated to other players. Each visible tank renders its own muzzle/impact flash from that data. An observer joining after a shot does not replay old flashes. Camera recoil stays local.

## Alpha feedback checklist

- Confirm the recovered Hold-X trail matches the intended older effect at the smaller size.
- Test both Hero footers and ability ready/refill states on the real controller/mobile device.
- Background sandbox/editor, return within ten minutes, and confirm the same vehicle resources, map edits and position survive.
- Test Ram reserve/refill, heat, repair cost and bridge-rail impacts with teammates.
- Original GLB visuals and physical mobile reach remain feedback items; automated browser checks use a diagnostic scene.
- Drift/counter-steering, movable HUD layouts and independently aimed secondary weapon mounts remain future work.

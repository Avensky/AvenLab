# Assisted healing, guarded boost and Tank barrier

This cumulative patch preserves the existing 3v3, CTF, recovery, career, HUD and Tank work. It adds three first playable kit actions and fixes the Windows flag-module startup failure. All tuning below is an alpha starting point.

## Live actions

| Hero | Action and controls | Server tuning |
| --- | --- | --- |
| Mechanic | Primary FIRE / RB / primary-fire binding launches assisted health packs; manual aim is unnecessary | Nearest eligible injured living ally within 30m and clear path; 75 HP per arrival, 1.25s cooldown, 0.25L fuel; approximately 35m/s flight, up to 1.1s |
| Mechanic | U / LB uses the separate recovery action | Existing nearby downed-vehicle recovery; health packs do not revive |
| BRZ DPS | Guard Boost: Shift / LB / on-screen action | 200 frontal shield HP, ±60° cone, 4s duration, 20s cooldown; 3L fuel and four seconds of NOS; requires ground contact |
| Tank | Frontal Barrier: remappable P / D-pad Left / Barrier action | 500 shield HP, 10 m wide × 3.4 m high, 5.4 m along turret yaw, lasts until broken, 15s cast cooldown; 1L fuel; requires running engine |
| CX-30 Support | Dive Shield (P, D-pad Left in combat, or HUD) | 2 s of all-angle damage protection, 18 s cooldown. The CX-30 can continue firing its close-range spray. |

The BRZ Guard improves high-speed stability and controlled turning while retaining steering and e-brake control. Actual guarded frontal contact above 6m/s closing speed with at least two grounded wheels can add 60 damage once per opponent per activation. It does not stun or add forced knockback. Directional impact mitigation reduces damage and condition wear; side/rear hits remain exposed. A broken shield leaves stability active for the remaining duration. The BRZ retains one gun; the Mechanic sharing its chassis cannot use this DPS kit.

The Tank's blue barrier rotates with cannon yaw. Incoming fire must cross its face to spend shield HP. The crew can cover the length of the hull by traversing the gun broadside, and allied weapons can fire through from behind. Ram still uses its own action and resources.

The Tank's matrix remains two columns by three rows:

| Left | Right |
| --- | --- |
| Scope | Ram |
| Cycle secondary machine gun | Frontal Barrier |
| Cannon fire | Selected secondary fire |

Weapon cycling remains available on the existing controller/keyboard bindings. The primary cannon remains independent. D-pad Left keeps its blinker behavior on other vehicles; the Tank can still use cockpit blinker controls. Angle Lock and Reset remain on the aim joystick.

## Multiplayer and authority

The Rust server authenticates the assigned hero, room, team, target, resources, damage direction, flight, cooldown and healing. Client-supplied hero roles, healing targets or HP amounts do not grant authority. Actual Mechanic primary damage is suppressed server-side. Repeated requests, vehicle resets and authenticated reconnects cannot erase ability cooldowns.

Health packs, shield HP/breaks and active effects replicate to observers. Only actual HP restored earns healing credit and ultimate charge. Healthy or invalid targets do not consume a pack; a launched pack can miss if its target becomes invalid. Defeated vehicles cannot launch packs. Revive remains separate.

The existing center resource dock now observes support controls mounted alongside the driving HUD, reserving space on small screens rather than covering action labels. The same shared theme, ability rings and buff display are used.

## Flag startup fix

Windows could resolve extensionless `FlagCloth` imports to the case-colliding helper `flagCloth.ts` instead of the component `FlagCloth.tsx`. The component is now `CtfFlagCloth.tsx` with a matching named export, and the helper is `flagClothMotion.ts`. The installer backs up and removes the two old files. A portable-module test checks case-folded extensionless basename collisions throughout frontend source and loads the new exports through Vite.

Stop and rebuild/restart both Rust and frontend after applying, then hard-refresh the Vite URL. Dependencies and assets are unchanged. Do not paste the new component into the old filename.

## Planned concepts

Heroes → Abilities → Concepts contains the remaining proposed vehicles. The CX-30 is selectable as a Support SUV, with a working short-range spray and Dive Shield.

Area repair, a team-immunity ultimate, engine-disruption hacker and offensive interceptor are also marked PLANNED. Concepts cannot select a main hero, equip skins, queue, spawn or change the playable roster. Usable ultimate actions remain planned even though charge accumulation exists. See `HERO-CONCEPTS-AND-FIRST-KITS.md`.

## Acceptance and remaining work

Focused Rust tests exercise delayed positive healing, invalid/dead/obstructed targets, overheal credit, physical guarded Tank collisions, exposed hits, resource costs and reconnects. Socket regressions exercise real authenticated roles, six-player deployment, rejected/no-need packs, replicated shots/shields and cooldown persistence. The new socket fixture does not demonstrate positive healing at the distant production spawns; that path is covered by Rust tests.

Browser checks cover Navy/White themes at phone portrait, phone landscape and desktop sizes, input routing, downed readiness, concepts, world effects and resource-dock spacing. Full GLB scene acceptance, physical controller/mobile input, multiplayer combat feel and damage/heat/economy balance still need player feedback. Shield durability and cooldown numbers can be tuned after those sessions.

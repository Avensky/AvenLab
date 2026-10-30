# Universal world editor

Base commit: `2cff03091b8779b4e6520a7ca3073ac7c40ef18c` (the installed Road & Jump Lab update).

## Header and world switching

The header identifies **Editing world** and offers every world in the shared game map catalog: Streaming Endless City, Road & Jump Lab, Workshop Yard and Road Precision Test. The same catalog feeds Sandbox selection, so adding another world updates both lists. A loaded custom map also appears while it is being edited.

**Editor style** and **Detail / LOD** live in the header. Dark navy remains the default; Hacker blue and Forest are saved alternatives. Theme/detail preferences survive reloads without changing map data. The editor uses the main/pause menus' shared square controls and tab styling, with compact panels and no promotional introduction.

Switching worlds saves the current layout and retains each world's draft and undo history for the session. Layout storage remains keyed by map ID. The old world stays visible while its replacement loads, with authoring disabled; only the latest successful request can replace it. A failed request leaves the current world available. Switching or editing a draft does not change the running multiplayer map or Sandbox's selected map.

Endless City starts as an **overlay** of the installed shared city tile. Its existing collider template provides a lightweight, noninteractive reference in Perspective and Plan. **Full world GLB reference** loads the source city assets when enabled; Auto uses the existing 512-pixel texture variant and High uses the original. Low keeps the reference lightweight. This edits the shared tile used by the city map; it does not create independent per-coordinate chunks. New layout still creates an explicit standalone layout.

## Prefab tabs

| Tab | Contents |
| --- | --- |
| All | Searchable complete library |
| 2×2 chunks | A 160 m starter containing four courtyard blocks and explicit shared roads |
| 3×3 chunks | A 240 m starter containing nine courtyard blocks and explicit shared roads |
| Blocks | Courtyard block, wall panel and floor slab |
| Buildings | Building mass, tower and an open-front warehouse |
| Garages / small | Actual selection-screen garage, procedural open garage and small workshop |
| Roads | Existing measured GLB road kit and starter road/sidewalk pieces |
| Jumps | Vehicle ramp, low jump ramp, roof access ramp and landing deck |
| Objectives | Route arrow, blocking arrow, blocking wall, checkered finish line, red/blue CTF areas, payload escort area and payload prop |
| Vehicles | AE86, BRZ, Camaro, Supra and Tank background placements |
| Props | Existing barriers, crates, bollards and street lights |

The 38-piece library keeps one real 3D preview on demand. The palette uses inexpensive SVG thumbnails; browsing tabs does not instantiate every GLB. Keyboard Left/Right and Home/End navigate the prefab tabs. Existing controller navigation, numeric placement, duplication and history remain available.

Chunk starters are reusable compound pieces with explicit geometry, open courtyards and instanced rendering. They are new modular starters, not decompositions of the old merged city GLBs. Each is one placement and one undo step. Their dimensions are shown on the cards; neither the 200 m guide nor the old map's cell is used to rescale source road GLBs.

Objective pieces are placeable layout geometry. CTF/payload areas and finish/route markers are decorative, with no hidden solid floor or trigger logic. Blocking walls/arrows and the payload prop have explicit physical shapes. Match scoring, flag behavior, payload movement and race completion remain separate server gameplay work. Piece IDs, positions, names and colors survive map export and snapshots for that future integration.

## Background vehicles and the special garage

Place a vehicle through **Vehicles**, or use its 3D preview's **Place this piece**. Edit position, yaw, full dimensions and preferred detail through the normal inspector. These are static traffic/background props. They do not receive player input, animate against a live player's pose, consume fuel, play audio or create Rapier vehicle bodies. The physics checkbox is disabled for them. Autonomous traffic and drivable NPCs are separate work.

The renderer preserves the complete imported static vehicle pose, including wheels and mirrored source transforms. It shares prepared geometry/materials between placements and retains the existing Camaro/Supra glass repairs. Default authoring dimensions are representative display sizes; the imported visual is normalized to those editable bounds. They are not measured chassis colliders.

The vehicle reference is a separate optional field:

```json
{
  "piece": "vehicle-brz",
  "solid": false,
  "parts": [],
  "vehicle": {"asset": "brz", "lod": "auto"}
}
```

Both parsers require approved vehicle IDs, empty explicit shapes and decorative status; a piece cannot simultaneously reference a road, garage and vehicle. Rust preserves the reference in snapshots and creates no physics body for it. Apply the frontend and Rust portions together before installing an export containing vehicle props.

**Selection-screen garage** remains under **Garages / small** and uses `garage_special.glb`, its real 414 structural collision triangles, surface masks and open interior. Lights, signs and other fixtures remain decorative. Its exact physics is unchanged by visual detail settings.

## Detail and loading budget

| Header setting | Rendering behavior |
| --- | --- |
| Auto | Existing distance-based road LOD; nearby full vehicle models within a bounded budget; distant vehicles use a single instanced proxy batch. Nearby garages show full detail and others use their structural proxy. |
| Low | Road LOD2, instanced vehicle proxies and structural garage proxies; no full legacy city reference |
| High | Road LOD0 and larger bounded full-model ranges/budgets for vehicles and garages |

Auto normally allows six nearby full background vehicles, reduced to two with the existing Fast city setting; High allows twelve. Garages use a separate budget: two on Auto, one with Fast, or six on High. Selected objects/source previews can show their source model independently. Hysteresis avoids rapid switching at distance thresholds. A vehicle's **Prefer full** still obeys the shared budget; **Proxy** prevents loading that full visual.

Full geometry and textures are cached once per source asset. Proxies remain visible rather than deleting background traffic in the distance. Physics always uses the same approved road/garage geometry and explicit primitive shapes. Visual detail settings do not dirty exports or introduce substitute physics boxes.

## Install and review

From the repository root, apply `universal-world-editor.patch` from the ZIP:

```sh
git apply --check /absolute/path/to/universal-world-editor.patch
git apply /absolute/path/to/universal-world-editor.patch
git lfs pull --include="frontend/public/models/vehicles/*.glb,frontend/public/models/world/garage_special.glb,frontend/public/models/roads/**"
npm ci --prefix frontend
npm --prefix frontend run lint
npm --prefix frontend run build
cargo test --manifest-path avenlab-server/Cargo.toml --locked
```

Use the ZIP's `files/` overlay instead when manually merging local changes. Use one installation method. Rebuild/restart Rust and the frontend with the normal project workflow; then start a new Sandbox session. **Export map** still produces the installable JSON for `avenlab-server/src/assets/blocks/`. Local edits do not hot-replace server physics.

For a local authoring review, start the frontend and open `/previews/universal-editor.html`. It uses the real installed world fixtures, the actual editor and local GLB assets, without a Rust connection. Real driving still runs in the game.

Frontend tests run from `frontend`:

```sh
node --test --test-concurrency=1 tests/*.test.mjs
```

Before later edits, `git apply --reverse --check /absolute/path/to/universal-world-editor.patch` verifies a clean rollback; `git apply --reverse` performs it. Rebuild both services after rollback and use maps compatible with the installed loader.

## Verification

Frontend lint, typecheck/production build and all **253 frontend tests** passed, with no skipped tests. All **98 Rust tests** passed, including the existing Jump Lab and garage driving checks and the new decorative-vehicle snapshot/physics test.

Browser checks cover header world/style/detail controls, independent drafts, stale-load rejection, garage preview/cutaway, all five vehicle GLBs, vehicle proxy switching, chunk placement, map export, controller adjustment, preference persistence and 390-pixel mobile layout. Decoder requests stay local. The release ZIP is checked by applying it against clean base files and comparing every output with its SHA-256 manifest.

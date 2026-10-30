# AvenLab — cockpit controls and organization update

The reverse, brake and gas pedal borders now clear after release, even while the
cursor stays over them. Assist switches share temporary contact feedback, with
silver FR-S-inspired faces and black text/icons for contrast.

This cumulative package includes the earlier organization/world-editor patch
and the latest cockpit changes. It works on GitHub commit
`fc9e460a63430198a4c53e9278b3e9a54050d801` or a copy-applied version of the earlier
update. You can use the included updater without knowing Git patch commands.

## Install

1. Extract this entire ZIP into a separate folder, such as Downloads. Keep
   `apply-update.mjs`, `manifest.json` and `files/` together.
2. Stop the running development servers. Open a terminal in the extracted folder.
3. Preview with the command below, replacing the quoted path with your AvenLab
   repository folder (the folder containing `frontend`, `avenlab-server` and
   `data-server`). Preview changes no files.

```sh
node apply-update.mjs --repo "C:\path\to\AvenLab"
```

4. Apply using the same command with `--apply`:

```sh
node apply-update.mjs --repo "C:\path\to\AvenLab" --apply
```

Use your actual directory on macOS/Linux as well, for example
`--repo "/Users/you/AvenLab"`. Node 24 is recommended; the updater needs no npm
packages. If it reports a missing repository marker, correct the repository path.

The updater verifies the payload, backs up every affected original outside the
repository, copies the replacements, then removes the exact 123 obsolete paths.
Existing local edits in affected files are included in that backup. Unrelated
files stay in place. The backup and undo command are printed when it finishes.
Repeated application is a no-op once the files are current.

**Do not batch-delete folders.** Some old filenames were replaced by folders
with a similar name. Use the updater's exact-file cleanup instead. It also
handles the old `SandBox.tsx` shadowing problem; `GameUI.tsx` uses the explicit
`modes/sandbox/index` entry.

5. From your AvenLab repository folder, install the matching frontend lockfile
   and rebuild:

```sh
npm --prefix frontend ci
npm --prefix frontend run build
```

Rebuild/restart the Rust server with this cumulative source too:

```sh
cargo run --release --manifest-path avenlab-server/Cargo.toml
```

Restart the data server if it is running, since its CAN modules were organized
into packages by the earlier update. The server README explains its usual setup.

## Undo

Use the exact backup folder printed by the updater:

```sh
node apply-update.mjs --restore "C:\path\to\AvenLab-update-backups\printed-folder"
```

Undo restores the original bytes and old files and removes newly added files.
It preflights all entries and stops if an affected file has newer edits. An
ordinary install write error attempts rollback automatically. The backup's
`restore.json` records recovery information if the process is interrupted.

## New cockpit settings and controls

| Location | What changed |
| --- | --- |
| Driving pedals | Borders follow physical contact and clear on release/cancel/blur/pause; hover and retained focus cannot select a pedal |
| Assist bank | Three columns × two rows; roughly half-pedal-sized silver switches with black text/icons; same temporary contact styling |
| Cockpit → Drive | Realistic parking lever or simple P button; optional crystals, off by default |
| Driving parking brake | Immediate pull while held; releasing touch preserves another device's hold and intentional parking tension; separate 0/1/2/3 latch targets |
| Cockpit → Climate | Three cabin HVAC knobs, compact/full driving widget choice and visibility switch; no expand/collapse arrows |
| Cockpit → Research | Saved HUD visibility for climate, emergency lights, wheel levers, ignition, GPS and mechanical groups |
| Emergency lights | Optional centered triangular button with a triangular hit area; header duplicate removed |
| Wheel levers | Cap and both adjacent buttons follow one wheel radius; hold the lights cap for temporary high beams and release to restore the chosen mode |
| Lights / Cruise pages | Vertical turn arrows; mirrored right-mounted cruise diagram |
| Ignition | Outer light and held sweep surround OFF/ACC/ON/START labels; confirmed cranking drives flicker and relay clicks |

The cockpit keeps the shared main/pause-menu themes, including navy, hacker
green, black, deep purple, pastel purple, strawberry and white.

## Finding what to edit

Start with `docs/PROJECT_GUIDE.md` and `docs/COCKPIT_REFACTOR_UPDATE.md` in the
installed repository. Cockpit `stalks/`, `mechanical/`, `ignition/` and `panels/`
each have an `index.ts` and README explaining functions, state ownership and
editing recipes. `styles/index.css` composes readable style sections;
`styles/switches.css` owns the shared pedal/assist faces.

Local appearance/visibility belongs to `store/preferences`; tab selection belongs
to `store/menus`; requests/source merging belong to `store/input`; telemetry and
Rust own accepted vehicle behavior. The existing compatibility entry files
remain available to older imports.

## Validation

- 281 frontend tests, ESLint and the production TypeScript/Vite build passed.
- Chromium checks passed on desktop (1440 × 900) and mobile (390 × 844), including
  pedal release while still hovered/focused and silver/black contrast in all
  seven themes. No browser JavaScript errors were observed.
- 14 updater tests passed: preview, backup, exact-file cleanup, idempotence,
  undo, edited-file protection, symlink/junction refusal and write-error rollback.
- Installation and byte-exact undo were checked against both the GitHub base
  and the earlier copy-applied update with all 123 stale files still present.
  The Git patch also matches the complete payload.
- The unchanged Rust/Python portions retain the earlier 101 Rust / 4 Python test
  validation. This iteration uses the same cockpit v6 protocol.

The build retains its large main-chunk warning (about 2.17 MB before gzip).
Browser checks use labeled sample telemetry; gameplay FPS, physical phones and a
new mechanical wear/failure model are outside these UI checks.

## Package contents

- `files/`: 489 replacement/new source, test and documentation files.
- `apply-update.mjs`: backed-up installer and undo helper.
- `manifest.json`: expected file hashes and exact obsolete paths.
- `deleted-paths.txt`: the same 123 paths for reference.
- `tests/update-helper.test.mjs`: updater tests (`node --test tests/update-helper.test.mjs`).
- `update.patch`: cumulative Git patch for a clean base checkout. If you use the
  updater, you do not also apply this patch. On a clean base branch, Git users
  can run `git apply --check update.patch` followed by `git apply update.patch`.

This package supplies source changes; it does not include node_modules, build
outputs, GLB assets, research PDFs or internal QA screenshots. Keep your existing
repository assets in place.

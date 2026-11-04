# Match formats and shared menu chrome

## Play flow

The Play screen separates queue category from match size. Its top tabs select Quickplay or Competitive. The two portrait cards select only 3v3 or 5v5; selecting a card does not change the category or enter matchmaking. Continue joins the selected combination, then server admission opens hero selection.

| Category tab | Size card | Team format |
| --- | --- | --- |
| Quickplay | 3v3 | Three per team; one Tank, DPS and Support |
| Quickplay | 5v5 | Five per team; existing alpha role limits |
| Competitive | 3v3 | Three per team; one Tank, DPS and Support |
| Competitive | 5v5 | Five per team; existing alpha role limits |

Competitive remains a distinct queue; ranked MMR is still pending. CTF rules remain first to three captures within fifteen minutes. Legacy `skirmish` requests remain compatible but are not a separate Play tab.

Explore & Build on the main menu preserves Sandbox, World Editor, Signal Recon and planned Swarm access through their existing configuration flow. Their tools do not become matchmaking sizes.

## Concurrent rooms

The server validates `mode_join` with `mode` and `team_size` independently. It fills an eligible waiting room with the same category and size before creating another. Unrelated formats never share a room. Running or ended rounds accept their reserved reconnects rather than absorbing new players into the existing match.

Room creation remains bounded by the shared server budgets. Defaults are three active worlds and twenty-four active players, configurable with `AVENLAB_MAX_ACTIVE_WORLDS` and `AVENLAB_MAX_PLAYERS`. These budgets also cover practice/editor worlds. For example, two full 5v5 matches fit within the defaults; all four category/size combinations need at least four available world slots to run simultaneously.

When capacity is unavailable the player queues for the requested combination. Admission, team, role limits, recovery, match results and rematch choices use the server-confirmed format. Match size is retained for new career records; older records keep their historical mode defaults.

## Common presentation

Play, pre-match hero selection and the Hero workshop reuse the header/footer architecture used by Career, Worlds & Social and Settings. Text, header spacing, controller actions and safe-area sizing match while the selection scenes retain their themed translucent surfaces and visible garage backdrop. Hero hold-X selection keeps its existing orbit effect within the fixed footer footprint.

Worlds & Social uses the shared Xbox X action for Refresh. A click, controller X or keyboard X inside the menu performs the same request. Busy/offline/loading states disable it; holding X does not repeatedly refresh, and text entry keeps the key.

The player's chosen app theme owns HUD surfaces, text and control accents throughout a match. Any available theme can be used on either team and changed during play. Team identity uses selective glows, semantic Red/Blue labels, temporary steering-wheel stitching and a small glowing Your team marker on the matching top-score label. Red uses warm red/crimson; Strawberry remains the separate pink app palette. Leaving the match clears the transient team treatment. Saved paint and the selected app theme remain intact; light-theme contrast and high-contrast behavior remain supported.

The existing center resource display receives a wider responsive frame, clearer bars and themed decorative edges following the HUD mockups. It expands into the free space between the steering and console controls and continues using the shared obstacle-based docking. HP, fuel and nitrous retain their semantic colors. HUD component visibility choices and input behavior are preserved.

## Installation and feedback

Apply the cumulative patch with both servers stopped. The installer recognizes previous patch versions, backs up changed/deleted files and refuses unknown local edits. Restart both Rust and frontend, then hard-refresh the Vite URL.

See `validation.json` in the update package for checks and remaining acceptance. Test the new category/size combinations with separate tab profiles, then physical controllers/mobile devices. Default world/player budgets are capacity limits rather than a claim that every full-asset map sustains the target frame rate on every server.

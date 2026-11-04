# Frontend menu and HUD reuse audit

## Changes in this patch

Selection, Career, Settings and Worlds & Social already shared `MenuFrameHeader` and `MenuFrameFooter`. Their vertical density now comes from one token set in `components/menus/menuFrame.css`: header/footer padding, action height and category-tab height. Play/Hero scene variants use the same geometry without adding an opaque full-screen shell. Hero's Hold-X orbit stays 28px and cannot enlarge the footer as its progress changes.

Header/footer surfaces now mix the selected palette's background and panel colors. Navy becomes a deeper blue; White, Strawberry and the other palettes retain their own paired surfaces and readable text. This does not add a separate menu theme or affect team-glow ownership.

The new `MenuTabButton` centralizes the repeated native tab surface for Settings, Career, Worlds & Social, Play/Explore mode tabs and Hero role filters. It supplies `type="button"`, `role="tab"`, `aria-selected`, a forwarded native ref and the base control class. Each owner keeps its existing focus/roving rules, explicit click behavior, controller input and disabled state. Hover cannot silently commit a selection through the shared component.

| Density | Header padding, vertical | Footer padding, vertical | Action height | Category tab height |
| --- | --- | --- | --- | --- |
| Desktop | 6px | 4px | 32px | 35px |
| Phone portrait | 4px | 3px | 32px | 32px |
| Short landscape | 3px | 3px | 28px | 28px |

Selection mode/role tabs use the same action-height token and less vertical padding. Header title sizes remain readable. Safe areas and hidden scrollbars remain supported.

## Shared boundaries checked

| Repeated UI need | Existing shared owner | Audit decision |
| --- | --- | --- |
| Screen headers/footers and safe areas | `MenuFrame`, `SelectionChrome` presets | One geometry/surface contract; avoid new page-specific header/footer height rules |
| Xbox clickable actions | `ControllerAction`, `ControllerButton` | Keep press actions shared; Hold-X adds only its intentional hold latch/progress |
| Native tab semantics | `MenuTabButton` | Reused across five menu families; navigation remains with each owner |
| Portraits and selected player styles | `HeroPortrait` | Preserve shared artwork/cache behavior; live HUD remains cache-only |
| Team cards and match tables | `MatchTeamComposition`, `MatchStatsTable` | Preserve shared rendering with separate viewer/privacy projection |
| Ability progress rings | `ProgressOrbit`, `CooldownDial` | Shared artwork; readiness/cooldowns stay server-owned |
| HUD visibility and minimized controls | `HudGroup`, `UtilityToggle` | Keep existing common visibility controls and saved preference ownership |
| HUD obstacle measurement | `observeHudLayout`, `CenterCombatDock` | Layout changes measure geometry; telemetry does not create per-frame polling |
| Physical time readouts | `CabinClock`, shared cabin-time hook | Local time remains separate from the server-owned match clock |
| Interface colors and team hints | App palette tokens and `matchTeamTheme` | Main theme owns surfaces/text; team identity stays a selective transient glow |

## Intentional differences

Hero portrait choices are ordinary click-to-select buttons, not category tabs. The guide's hero preview controls use pressed-state semantics. Neither should inherit focus-to-commit behavior from a mode tab. Physical pedals, ignition, parking brake and steering stalks also retain their own input ownership and artwork: merging their press/release logic into a generic menu button would risk stuck or unintended vehicle inputs.

The audit consolidates repeated presentation where the semantics agree. It does not claim that every visually similar control should share gameplay behavior. New menu category rails should use `MenuTabButton`; new screens should use the common frame or scene presets rather than copy header/footer markup.

## Verification

Focused tests cover shared frame ownership, Settings and Social actions, Play/Explore routing, independent mode/size selection, Hero Hold-X and controller navigation. Browser QA measures the actual compact header/footer/tab geometry across portrait, landscape and desktop, checks deep Navy versus light palettes, and verifies that the Hold-X fill effect does not change footer height.

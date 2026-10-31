# Hero portraits, chat and parking controls

This cumulative follow-up preserves the alpha admission/queue, social-world,
mobile cockpit and HUD layout updates. Rebuild and restart **Rust and frontend**.

## Selection layout and input

- The mode row touches the header without a gutter. Five compact teammate cards
  sit directly below it, aligned left on phones and centered on wide desktops.
  The selected hero's large name and role sit at the upper left below those cards.
- The top-right grid displays all seven current portraits. Name bands and the
  enclosing box are removed, keeping the same image footprint in shorter cards.
  Names remain in accessible button labels and hover tooltips. The large selected
  name and teammate cards still identify each hero.
- Select a portrait directly, or use the restored translucent vehicle arrow bar.
  Both routes use the same server-validated hero action. Arrows respect the current
  role filter and preserve support identities when their chassis is shared.
- All/Tank/DPS/Support form one square, fully bordered rail with adjoining edges.
  It sits above the selector bar without the former folder cutouts or gaps.
- Keyboard/controller left/right changes a focused vehicle/environment strip;
  up/down leaves it. Inside the portrait grid directions move focus, with up/down
  jumping one row. Enter or controller A selects the focused portrait.
- Sandbox and World Editor use the same translucent styling for environment
  arrows beside the vehicle row. World admission still locks map changes.
- The vehicle bar remains flush against the existing controller footer, allowing
  the garage/player to show through. The existing one-canvas turntable continues
  rotating while waiting, unless reduced motion is enabled.
- Main keeps its left/right arrangement without the former divider.

See `HERO_SELECTION_POLISH.md` for the follow-up layout and chat fade behavior.

## Portrait assets and cost

`frontend/public/images/heroes/` contains five 320×216 WebP portraits exported
from the installed GLB chassis (39,788 bytes total). The two support heroes reuse
their actual BRZ/AE86 chassis with distinct role colors. Portraits do not start
WebGL renderers; the garage retains one canvas. There are no new dependencies.

To regenerate a portrait with materialized vehicle models, run the normal Vite
dev server and open `/previews/hero-portraits.html`. Generate and download the five
portraits, replacing the matching public images. `bakeHeroPortrait.ts` is a dev
preview helper, absent from the production entry bundle. Exported model artwork
uses the project's existing assets and licenses.

## Lobby and Team chat

Chat sits at the lower left and can be minimized. It fades when idle; a tap, focus
or keyboard interaction restores opacity for four seconds. Pointer hover on a
mouse device or the open assisted keyboard keeps it solid. Incoming messages do
not wake it. One owned timer is cleared on unmount; there is no idle polling.
T focuses the message field;
Enter sends. Native typing remains in the field instead of selecting heroes or
sending driving controls. The existing assisted keyboard is available, and its
hardware-keyboard detection/preferences remain in charge. Team becomes available
after world admission. No example messages or invented players are shipped.

`chat_send` and `chat_history` use the existing `social_request` socket. A send has
`channel: "lobby" | "team"` and `text`; a history request has only `channel`.
Rust derives the sender profile/name and current world/team from that socket.
Lobby goes to identified connected players, including queued players. Team goes
only to identified connections in the same current world and side. It cannot be
retargeted by passing a world ID, team, name or author ID.

A send returns `{message}` and broadcasts `{type:"chat_message",data:message}`.
History returns `{channel,context,messages}`. Messages contain `id`, `channel`,
`context`, `author_id`, `name`, `text`, and Unix-seconds `sent_at`. Context is
`lobby` or `team:<world-id>:<red|blue>`. Clients deduplicate event/ack IDs, ignore
late replies from former teams and clear team history on membership change.

Limits are 1–280 Unicode characters, at most 1,024 raw UTF-8 bytes, three messages
per profile per five seconds, and thirty server-wide per five seconds. Existing
social request throttling still applies. History holds fifty messages per context
and at most thirty-two recent contexts. Expiry is checked on requests, without a
new timer or polling loop. Chat is memory-only and clears on server restart; team
history clears when its runtime world unloads, after any reconnect grace ends.
No chat text is written to profiles or world saves. Rate errors keep the draft.

This is text chat only. It does not add voice, moderation/report tools or permanent
message archives. Those are separate product work before a public release.

## Parking brake and Reverse pedal

- The silver release cap sits at the actual end of the rendered lever and moves
  inward while the lever or cap is pressed. Both share the lever transform.
- A completed quick tap from an unlatched brake emits one 100 ms drifting pull,
  then releases its own momentary force. The synthesized click adds no second pull.
- A hold starts progressive parking pressure after the 180 ms tap threshold and
  retains it on release. It never starts with the automatic drift pulse. A drag
  adjusts the parking latch directly. A quick tap on an existing latch or the
  silver release cap releases that latch.
- Cancellation, lost focus, hiding and unmounting release only this control's
  momentary input. They preserve another input device's force and the parking latch.
- Reverse uses a tighter R/caption gap so both remain inside the pedal.

A clutch pedal has not been added. An optional manual-transmission control could
support clutch kicks, with the pedal hidden by default on mobile. That requires
an authoritative clutch input and drivetrain behavior, rather than a cosmetic
button that only changes RPM.

## Validation

`validation.json` in the update package records actual check results and scope.
Frontend tests cover direct selection, admitted-pick errors, chat acknowledgments,
bounded/late history and parking input ownership. Rust tests and
`scripts/test-hero-chat.mjs` cover authorization, team/world isolation, throttles,
world unload and persistence. Browser checks use disposable local profiles and
emulated viewport/controller input. They do not measure a physical phone's GPU or
claim a hosting capacity for the alpha worlds.

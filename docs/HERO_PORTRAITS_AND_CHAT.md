# Hero portraits, chat and parking controls

This cumulative follow-up preserves the alpha admission/queue, social-world,
mobile cockpit and HUD layout updates. Rebuild and restart **Rust and frontend**.

## Selection layout and input

- The top-right grid displays all seven current heroes with a portrait and name.
  Click a card, focus it and press Enter, or use controller directions and A.
  Up/down moves one grid row. Focusing a card does not select it.
- The same selected vehicle remains in the existing 3D garage and keeps rotating
  while waiting. Reduced-motion preference pauses the turntable as before.
- All/Tank/DPS/Support buttons protrude above the vehicle bar like folder tabs.
  Only the individual tabs have backgrounds; the full-width vehicle row is flush
  with the preserved controller footer. There is no match-rules strip below it.
- Sandbox and World Editor retain environment arrows in that same vehicle row.
  Admission locks environment changes. Confirmed server picks and denied role
  choices retain their previous behavior. Teammate seats show real portraits and
  player names; unoccupied seats remain marked waiting.
- Main keeps the wide-screen left/right arrangement, with the divider removed.

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

Chat sits at the lower left and can be minimized. T focuses the message field;
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

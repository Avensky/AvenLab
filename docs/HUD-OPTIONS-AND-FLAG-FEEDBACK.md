# Independent HUD options and flag feedback

This cumulative patch merges the futuristic resource/compact-console update with the team-menu and recovery update. The current controls, career records, cosmetics, app theme, camera dragging and recovery rules are preserved.

## HUD choices

Settings → HUD lists individual components. Cockpit pages expose the corresponding controls. Classic three gauges, futuristic resources, teammate portraits, steering, levers, pedals, ignition, shifter, aiming, parking brake, assists, map, chat, radio, Missions, climate, performance and emergency lights can be combined. Layout and master switches are bulk shortcuts; individual visibility settings are the render authority. Hiding a control does not disable its keyboard or controller action.

Cockpit → Climate and Settings → HUD offer Single Bar HUD, Compact HUD and Full HUD. Single Bar removes the extra performance row. Performance has its own visibility switch and can also appear without climate. Radio and Missions are independent: hiding radio no longer prevents opening Missions. Collapsing a visible utility panel remains separate from hiding that component in Settings.

Existing saved layouts are migrated once to preserve their effective visibility, including components previously suppressed by hidden parents. After migration, enabling one component does not require enabling its old parent. The shifter remains optional with either instrument display.

## Flag delivery and notices

The Rust server scores a capture only when a live carrier physically reaches its own authored home base with the enemy flag and its own flag is home. Neither an enemy base nor approaching the edge of the capture radius counts. A carried or dropped own flag blocks scoring. Physically returning that flag can enable a waiting teammate to score once.

The match HUD and home-base cue explain whether delivery is ready or blocked. A capture confirmation uses an accepted server capture event; entering a highlighted zone alone never grants score. Solo warmup permits pickup/drop/return but cannot score or award XP.

Missions lists confirmed flag pickup, drop, return and capture events. The server retains the latest 16 events with sequence IDs, so transitions between received snapshots can still be shown. A new player/world/match establishes a baseline instead of replaying old notices; a brief transport interruption preserves its sequence cursor. Starting the official round clears warmup history without creating fake returns. Older servers without the event history remain readable through a conservative transition fallback.

## Flag visuals

Carried flags follow the same interpolated chassis pose as the rendered vehicle. The cloth is rotated 90 degrees to run parallel to the chassis, is 25% larger, and has a small smooth vertical bob. Redundant carried-state text labels are removed; ground/home objective labels remain useful. Flag carriers use gold circular minimap rings around their ordinary team-colored dot. Enemy detection rules still apply.

## Pending player acceptance

Test physical controller and mobile layouts with your preferred component combinations. Confirm the carried flag reads well on every vehicle and under network latency, and tune its size/bob if needed. Complete full-team CTF playtests, including a blocked delivery followed by a teammate return, recovery at home, and match end/rematch. Full assets, coastal route fairness and ten-player performance remain release gates. Ranked MMR, unfinished hero abilities/ultimates and cinematic replay capture remain pending.

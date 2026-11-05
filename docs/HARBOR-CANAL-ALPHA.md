# Harbor Canal playtest

In World Builder, open **Props → Big E · docked flight deck**. Place the prefab origin at runway height. Select it and click **Deck panorama** in its inspector for a view across the water toward the city. Its measured deck and island colliders rotate and resize with the model. Endless City has the real Big E at the existing eastern pier. View the harbor from the gallery or drive onto it. These vessels remain moored.

A new public match selects its map when the world is created. The rotation includes Endless City, Red docking, Blue docking, and both fleets docking. A replacement or reconnect joins the map already in use. Each Harbor Canal runtime also shuffles the service locations among reserved lots using its world ID. Each team has five spawn pads. The docked teams deploy on their ships.

## Driving across the canal

- The permanent causeway crosses at Z = −178 m. Its cap and three piers leave two culverts open under the roadway. The canal joins the sea at the ends. Water has no driving collider.
- The central drawbridge has two 24 m leaves. They stay level for half of their 20-second cycle, then raise to 30° and lower. A fast approach while the leaves rise gives a jumping route.
- The crossing at Z = +178 m has 280 HP. When server-confirmed damage destroys it, the full deck disappears for every viewer and the collider switches off. Rejoining the same world preserves that state.
- Separate highway guardrails line the banks and city edges. The curved returns use chords sampled from a circular arc. Each visible beam and its collider use the same endpoints and rotation. Crowd barriers and plastic roadblocks stay separate pieces. The generator does not deform existing road GLBs.

## Scouting, HUD and barrage

Open the cockpit **Navigation** tab to see the full Harbor Canal chart. F marks fuel and R marks repair. The defending land team starts with both banks charted. A carrier team reveals a 100 m sector when a living member enters it. When both teams arrive by sea, both start scouting. The server samples four times per second and sends a 64-bit chart to the appropriate team on changes and new connections. Knowledge lasts for the world session. Fog controls the GPS display. All players can render the physical geometry.

The aim grip has themed thread and four short rim accents. The minimap compass and utility icons use a muted accent. Relationship colors, healing signals and warning colors keep their gameplay meanings.

All ten vehicle heroes can spend a full ultimate in a live match or practice world. Barrage lasts five seconds. With a visible enemy within 45 m it uses focused fire. Without one, three mounts sweep in a ring, stopping at cover and shields. Enemies that become visible are reacquired on the next quarter-second pulse. A successful ultimate spends the charge even if every shot misses.

## Frame pacing

The presentation buffer now follows measured packet spacing. On a stable 30 Hz stream its reserve falls to about 41 ms. On variable delivery it increases gradually, capped at 90 ms. All vehicles and cameras use the same per-frame clock. Raw mode still displays the latest authoritative pose.

In the repeatable 100 Hz uneven-arrival replay, the previous fixed reserve held the pose on 36 samples and the adaptive reserve held on zero. In Chromium the two-carrier world preview used six scene draw calls, including both ships and the bridge leaves. Each marked carrier contributes one draw, with 72,945 source triangles and 42 triangles for flight-deck paint. Live vehicles, shadows, HUD and combat add their own costs.

See the included JSON results for the localhost two-world 5v5 soak and snapshot timing. Neither the local replay nor the browser preview measures FPS on a player's PC.

The repeat 45-second soak delivered 27.1 and 26.6 snapshots per client per second. The 95th-percentile arrival gaps were 49 and 51 ms, but individual gaps reached 821 and 973 ms. The isolated ten-vehicle combat run exceeded the 16.67 ms tick budget on 7 of 1,800 ticks (median 1.03 ms, p95 2.95 ms, maximum 281 ms). The synchronized local socket test also recorded an 800 ms pause in its load driver. Both the server and the test driver showed outliers. Interpolation covers ordinary jitter. Unusually long gaps can still interrupt motion.

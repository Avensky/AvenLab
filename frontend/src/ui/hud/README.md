# Driving utility HUD

UtilityDock is the single owner of minimap, radio and climate placement. It always
stacks climate below radio, including short landscape. An expanded map occupies
its own row and pushes the stack down. Minimized launchers stay reachable beside
or on its rim. hudPanelsStore owns session collapse state; preferences own saved
visibility and radio/climate presentation. Audio and cabin requests have separate
owners and survive those presentation changes.

Radio has a direct Missions flag beside power; its dropdown pushes climate down.
GPS uses the minimap. Compact climate presents CabinPerformance; frame sampling
stays in the existing performance probe and ping stays in rustSocket.

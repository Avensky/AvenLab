# HUD panel layout

hudPanelsStore holds session-only map/radio/climate open states. Saved visibility,
radio style and HVAC size remain preferences; playback stays in radioStore and
physical requests stay in inputStore. Minimizing unmounts the panel's content,
preserving those owners. UtilityDock is the single positioning owner. Its rim
launchers have an explicit layer above the clickable map.

# State ownership

`index.ts` is the stable public API; domain guides describe the established owners. Stores and catalogs are data-only. Internal files import
concrete dependencies; animation/transport loops read `getState()` or refs.
A selector should return only the value its component displays.

| Section | Writes / lifetime | Main readers |
| --- | --- | --- |
| [session](session/README.md) | Authoritative connection and vehicle setup | See section guide |
| [input](input/README.md) | Requested driving input | See section guide |
| [telemetry](telemetry/README.md) | Sampled display state | See section guide |
| [world](world/README.md) | Installed world and navigation | See section guide |
| [preferences](preferences/README.md) | Device preferences and accessibility | See section guide |
| [presentation](presentation/README.md) | Rendering and inspection choices | See section guide |
| [selection](selection/README.md) | Setup catalog and selected indexes | See section guide |
| [menus](menus/README.md) | Routes, overlays and menu navigation | See section guide |
| [recon](recon/README.md) | CAN research sessions and mission protocols | See section guide |
| [radio](radio/README.md) | Local media playback | See section guide |
| [missions](missions/README.md) | Gameplay mission radio presentation | See section guide |
| [alpha](alpha/README.md) | Game mode and hero draft | Mode and hero selectors |
| [chat](chat/README.md) | Chat and presence events | Lobby and team chat |
| [hud](hud/README.md) | Local panel and scoreboard visibility | Cockpit, hero guide and scoreboard |
| [social](social/README.md) | Personalized account and lobby data | World browser and matchmaking |
| [text](text/README.md) | Assisted keyboard session | Text entry |

## Change flow

Keyboard/controller/touch → input source merge → one 60 Hz sender → Rust fixed
simulation → validated network snapshot → one 20 Hz telemetry sampler → gauges.
The minimap takes a 10 Hz projection from that sampler. Clock updates are 30 s.
Menus are event-driven; opening Pause or the world editor holds the brake and zeroes
throttle. Device release cannot override that hold. Resume starts neutral.

World editor draft → validation → map export → install map JSON → restart Rust.
The live `worldStore.map`, setup selection, and authoring draft have separate
owners. Browser Save is not a live physics update.

Theme, visibility and controller preferences persist on the device. Simulation
state, media files, mission announcements and server identity do not persist.
Recon protocol edits keep `avenlab.signal-recon.protocols.v1`; all existing
preference/editor draft storage keys are retained.

For a new field, identify its owner first. Add a Rust field at the protocol
boundary, an input action for requested commands, a telemetry projection for a
displayed reading, or a preference for a presentation choice. Do not add a second
store holding copies of the same authority.

## Store update rates

Each group below links to the field-level guides for its stores. The 43 writable Zustand stores keep their existing owners. The cabin clock is a local external store. For socket readers, the [connection, motion and diagnostics views](session/networkViews.README.md) share the same authoritative data and notify their subscribers independently.

### Driving, combat and cockpit displays

| Store | Expected update |
| --- | --- |
| [useInputStore](input/inputStore.README.md) | Device events and controller samples |
| [useCombatStore](../combat/combatStore.README.md) | On combat control and loadout events |
| [useGuardBoostRequestStore](../combat/guardBoost.README.md) | On request and completion |
| [useHealPackRequestStore](../combat/healPackTargets.README.md) | On request and completion |
| [useReviveRequestStore](../combat/reviveTargets.README.md) | On request and completion |
| [useSightCue](../combat/sightCue.README.md) | On a changed target/tone or clear |
| [useVehicleTelemetryStore](telemetry/vehicleTelemetryStore.README.md) | Up to 20 Hz while the HUD sampler is owned and visible |
| [useMapTelemetryStore](telemetry/mapTelemetry.README.md) | Up to 10 Hz, changed pose only |
| [useHudPanelsStore](hud/hudPanelsStore.README.md) | On panel toggles and deployment/round transitions |
| [useRadioStore](radio/radioStore.README.md) | Browser media and equipment events |
| [useCabinTime](telemetry/cabinClock.README.md) | Local sample every 30 s while visible and subscribed |
| [useFrameReadout](../performance/frameReadout.README.md) | Up to 2 Hz plus reset |

### Multiplayer session, lobby and objectives

| Store | Expected update |
| --- | --- |
| [useNetworkStore](session/networkStore.README.md) | 30 Hz compact / 60 Hz legacy plus event channels |
| [useVehicleConfigStore](session/vehicleConfigStore.README.md) | On vehicle setup or world lifecycle |
| [useSocialStore](social/socialStore.README.md) | On personalized social or connection events |
| [useAlphaStore](alpha/alphaStore.README.md) | On draft or recovery actions |
| [useChatStore](chat/chatStore.README.md) | On message, history, membership or notice events |
| [usePresenceStore](chat/presenceStore.README.md) | On relevant differences between social views |
| [useMissionRadioStore](missions/missionRadioStore.README.md) | On accepted mission events |
| [useCtfFeedbackStore](../game/stats/ctfFeedbackStore.README.md) | On confirmed capture, clear or timeout |
| [useScoreboardStore](hud/scoreboardStore.README.md) | On display actions. Visible rows sample separately at 4 Hz |
| [useMatchResultsStore](session/matchResultsStore.README.md) | One result per match, history and UI events |
| [useCareerViewStore](../game/career/careerViewStore.README.md) | On career view selections |
| [useNavigationStore](world/navigationStore.README.md) | On destination or objective actions |
| [useWorldStore](world/worldStore.README.md) | Map and block lifecycle, plus inspector actions |

### Menus, preferences and presentation

| Store | Expected update |
| --- | --- |
| [useUIStore](menus/uiStore.README.md) | On route, navigation and loading events |
| [useSelectionStore](selection/selectionStore.README.md) | On setup/selection and recovery actions |
| [useHeroGuideStore](hud/heroGuideStore.README.md) | On guide interactions |
| [useHeroLoadouts](../vehicles/cosmetics/heroLoadouts.README.md) | On profile adoption, local edits and save |
| [usePreferencesStore](preferences/preferencesStore.README.md) | On hydration and preference edits |
| [useTextKeyboardStore](text/keyboardStore.README.md) | On typing and keyboard-assist actions |
| [useGameStore](presentation/gameStore.README.md) | On camera, editor or legacy presentation actions |
| [useRenderSettingsStore](presentation/renderSettingsStore.README.md) | On settings, profile and lifecycle events |
| [useDebugViewStore](presentation/debugViewStore.README.md) | On preference changes |
| [useVisualAlignmentStore](presentation/visualAlignmentStore.README.md) | On model measurement and removal |
| [useCaptureSettingsStore](../performance/captureSettingsStore.README.md) | On settings changes and hydration |
| [usePerformanceOverlayStore](../performance/performanceOverlayStore.README.md) | On overlay navigation |

### World authoring and CAN research

| Store | Expected update |
| --- | --- |
| [useBuilderStore](../worldBuilder/state/builderStore.README.md) | On editor actions and document loads |
| [useLayoutStore](../worldBuilder/state/layoutStore.README.md) | On editor interactions including pointer movement |
| [useEditorPreferences](../worldBuilder/state/editorPreferences.README.md) | On editor settings and hydration |
| [useVehicleEditorStore](../worldBuilder/vehicleEditor/vehicleEditorStore.README.md) | On tuning, save, camera and replay actions |
| [useCanBusStore](recon/canBusStore.README.md) | Explicit status reads and selection events |
| [useCanDataStore](recon/canDataStore.README.md) | Source-driven CAN batches and playback actions |
| [useSignalReconStore](recon/store.README.md) | On action, phase boundary, marker or HTTP result |

Packet scope, local sampling, measurements and regression commands are in the [network and store audit](../../../docs/STORE-NETWORK-AUDIT.md).

Other React external subscriptions use local events.

- [Fleet artwork revision](../vehicles/fleetAssets.README.md)
- [Styled portrait cache](../game/alpha/heroPortraitCache.README.md)
- [Menu motion preference](../components/menus/MenuVideoBackground.README.md)

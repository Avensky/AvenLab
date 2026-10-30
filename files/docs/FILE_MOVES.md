# Moved feature files

The public entry points are in [PROJECT_GUIDE](PROJECT_GUIDE.md). These paths map earlier discussions and searches to current owners.

| Before | Now |
| --- | --- |
| `frontend/src/store/networkStore.ts` | [frontend/src/store/session/networkStore.ts](../frontend/src/store/session/networkStore.ts) |
| `frontend/src/store/vehicleConfigStore.ts` | [frontend/src/store/session/vehicleConfigStore.ts](../frontend/src/store/session/vehicleConfigStore.ts) |
| `frontend/src/store/types.ts` | [frontend/src/store/session/types.ts](../frontend/src/store/session/types.ts) |
| `frontend/src/store/inputStore.ts` | [frontend/src/store/input/inputStore.ts](../frontend/src/store/input/inputStore.ts) |
| `frontend/src/store/vehicleTelemetryStore.ts` | [frontend/src/store/telemetry/vehicleTelemetryStore.ts](../frontend/src/store/telemetry/vehicleTelemetryStore.ts) |
| `frontend/src/store/cabinClock.ts` | [frontend/src/store/telemetry/cabinClock.ts](../frontend/src/store/telemetry/cabinClock.ts) |
| `frontend/src/store/worldStore.ts` | [frontend/src/store/world/worldStore.ts](../frontend/src/store/world/worldStore.ts) |
| `frontend/src/store/navigationStore.ts` | [frontend/src/store/world/navigationStore.ts](../frontend/src/store/world/navigationStore.ts) |
| `frontend/src/store/preferencesStore.ts` | [frontend/src/store/preferences/preferencesStore.ts](../frontend/src/store/preferences/preferencesStore.ts) |
| `frontend/src/store/gameStore.ts` | [frontend/src/store/presentation/gameStore.ts](../frontend/src/store/presentation/gameStore.ts) |
| `frontend/src/store/renderSettingsStore.ts` | [frontend/src/store/presentation/renderSettingsStore.ts](../frontend/src/store/presentation/renderSettingsStore.ts) |
| `frontend/src/store/debugViewStore.ts` | [frontend/src/store/presentation/debugViewStore.ts](../frontend/src/store/presentation/debugViewStore.ts) |
| `frontend/src/store/visualAlignmentStore.ts` | [frontend/src/store/presentation/visualAlignmentStore.ts](../frontend/src/store/presentation/visualAlignmentStore.ts) |
| `frontend/src/store/inspectionActions.ts` | [frontend/src/store/presentation/inspectionActions.ts](../frontend/src/store/presentation/inspectionActions.ts) |
| `frontend/src/store/selectionStore.ts` | [frontend/src/store/selection/selectionStore.ts](../frontend/src/store/selection/selectionStore.ts) |
| `frontend/src/store/worldCatalog.ts` | [frontend/src/store/selection/worldCatalog.ts](../frontend/src/store/selection/worldCatalog.ts) |
| `frontend/src/store/uiStore.ts` | [frontend/src/store/menus/uiStore.ts](../frontend/src/store/menus/uiStore.ts) |
| `frontend/src/store/canBusStore.ts` | [frontend/src/store/recon/canBusStore.ts](../frontend/src/store/recon/canBusStore.ts) |
| `frontend/src/store/canDataStore.ts` | [frontend/src/store/recon/canDataStore.ts](../frontend/src/store/recon/canDataStore.ts) |
| `frontend/src/store/radioStore.ts` | [frontend/src/store/radio/radioStore.ts](../frontend/src/store/radio/radioStore.ts) |
| `frontend/src/store/signalReconStore.ts` | [frontend/src/store/recon/store.ts](../frontend/src/store/recon/store.ts) |
| `frontend/src/store/signalReconMissions.ts` | [frontend/src/store/recon/catalog.ts](../frontend/src/store/recon/catalog.ts) |
| `frontend/src/store/tools/inputRouting.ts` | [frontend/src/controls/inputRouting.ts](../frontend/src/controls/inputRouting.ts) |
| `frontend/src/store/tools/resourceMasks.ts` | [frontend/src/store/telemetry/resourceMasks.ts](../frontend/src/store/telemetry/resourceMasks.ts) |
| `frontend/src/store/tools/deriveInputSignals.ts` | [frontend/src/store/input/protocol/deriveInputSignals.ts](../frontend/src/store/input/protocol/deriveInputSignals.ts) |
| `frontend/src/store/tools/inputMasks.ts` | [frontend/src/store/input/protocol/inputMasks.ts](../frontend/src/store/input/protocol/inputMasks.ts) |
| `frontend/src/store/tools/cabinMasks.ts` | [frontend/src/store/input/protocol/cabinMasks.ts](../frontend/src/store/input/protocol/cabinMasks.ts) |
| `frontend/src/store/tools/InputSender.ts` | [frontend/src/net/inputSender.ts](../frontend/src/net/inputSender.ts) |
| `frontend/src/store/tools/clusterMasks.ts` | [frontend/src/store/telemetry/clusterMasks.ts](../frontend/src/store/telemetry/clusterMasks.ts) |
| `frontend/src/store/tools/debugMasks.ts` | [frontend/src/store/world/debugMasks.ts](../frontend/src/store/world/debugMasks.ts) |
| `frontend/src/store/tools/cockpitMasks.ts` | [frontend/src/store/input/protocol/cockpitMasks.ts](../frontend/src/store/input/protocol/cockpitMasks.ts) |
| `frontend/src/game/modes/SandBox.tsx` | [frontend/src/game/modes/sandbox/SandBox.tsx](../frontend/src/game/modes/sandbox/SandBox.tsx) |
| `frontend/src/game/modes/SignalReconMission.tsx` | [frontend/src/game/modes/recon/SignalReconMission.tsx](../frontend/src/game/modes/recon/SignalReconMission.tsx) |
| `frontend/src/game/modes/ReconHeaderActionGrid.tsx` | [frontend/src/game/modes/recon/ReconHeaderActionGrid.tsx](../frontend/src/game/modes/recon/ReconHeaderActionGrid.tsx) |
| `frontend/src/game/modes/SignalReconPlayback.tsx` | [frontend/src/game/modes/recon/SignalReconPlayback.tsx](../frontend/src/game/modes/recon/SignalReconPlayback.tsx) |
| `frontend/src/game/modes/ReconWorkspaceHeader.tsx` | [frontend/src/game/modes/recon/ReconWorkspaceHeader.tsx](../frontend/src/game/modes/recon/ReconWorkspaceHeader.tsx) |
| `frontend/src/game/modes/SignalReconHeader.tsx` | [frontend/src/game/modes/recon/SignalReconHeader.tsx](../frontend/src/game/modes/recon/SignalReconHeader.tsx) |
| `frontend/src/game/modes/SignalReconBrainConsole.tsx` | [frontend/src/game/modes/recon/SignalReconBrainConsole.tsx](../frontend/src/game/modes/recon/SignalReconBrainConsole.tsx) |
| `frontend/src/game/modes/SignalReconSetup.tsx` | [frontend/src/game/modes/recon/SignalReconSetup.tsx](../frontend/src/game/modes/recon/SignalReconSetup.tsx) |
| `frontend/src/game/modes/SandboxSetup.tsx` | [frontend/src/game/modes/sandbox/SandboxSetup.tsx](../frontend/src/game/modes/sandbox/SandboxSetup.tsx) |
| `frontend/src/game/modes/SignalRecon.tsx` | [frontend/src/game/modes/recon/SignalRecon.tsx](../frontend/src/game/modes/recon/SignalRecon.tsx) |
| `frontend/src/game/MainMenu.tsx` | [frontend/src/game/menus/MainMenu.tsx](../frontend/src/game/menus/MainMenu.tsx) |
| `frontend/src/game/PauseMenu.tsx` | [frontend/src/game/menus/PauseMenu.tsx](../frontend/src/game/menus/PauseMenu.tsx) |
| `frontend/src/game/SettingsMenu.tsx` | [frontend/src/game/menus/SettingsMenu.tsx](../frontend/src/game/menus/SettingsMenu.tsx) |
| `frontend/src/game/CareerMenu.tsx` | [frontend/src/game/menus/CareerMenu.tsx](../frontend/src/game/menus/CareerMenu.tsx) |
| `frontend/src/game/MissionsMenu.tsx` | [frontend/src/game/menus/MissionsMenu.tsx](../frontend/src/game/menus/MissionsMenu.tsx) |
| `frontend/src/game/SessionMenu.tsx` | [frontend/src/game/menus/SessionMenu.tsx](../frontend/src/game/menus/SessionMenu.tsx) |
| `frontend/src/game/VehicleMenu.tsx` | [frontend/src/game/menus/VehicleMenu.tsx](../frontend/src/game/menus/VehicleMenu.tsx) |
| `frontend/src/game/menuItems.ts` | [frontend/src/game/menus/menuItems.ts](../frontend/src/game/menus/menuItems.ts) |
| `frontend/src/ui/Minimap.tsx` | [frontend/src/ui/Minimap/Minimap.tsx](../frontend/src/ui/Minimap/Minimap.tsx) |
| `frontend/src/worldBuilder/builderStore.ts` | [frontend/src/worldBuilder/state/builderStore.ts](../frontend/src/worldBuilder/state/builderStore.ts) |
| `frontend/src/worldBuilder/layoutStore.ts` | [frontend/src/worldBuilder/state/layoutStore.ts](../frontend/src/worldBuilder/state/layoutStore.ts) |
| `frontend/src/worldBuilder/editorPreferences.ts` | [frontend/src/worldBuilder/state/editorPreferences.ts](../frontend/src/worldBuilder/state/editorPreferences.ts) |
| `frontend/src/worldBuilder/builderActions.ts` | [frontend/src/worldBuilder/state/builderActions.ts](../frontend/src/worldBuilder/state/builderActions.ts) |
| `frontend/src/worldBuilder/layoutDocument.ts` | [frontend/src/worldBuilder/document/layoutDocument.ts](../frontend/src/worldBuilder/document/layoutDocument.ts) |
| `frontend/src/worldBuilder/layoutGeometry.ts` | [frontend/src/worldBuilder/document/layoutGeometry.ts](../frontend/src/worldBuilder/document/layoutGeometry.ts) |
| `frontend/src/worldBuilder/mapDocument.ts` | [frontend/src/worldBuilder/document/mapDocument.ts](../frontend/src/worldBuilder/document/mapDocument.ts) |
| `frontend/src/worldBuilder/spawnDocument.ts` | [frontend/src/worldBuilder/document/spawnDocument.ts](../frontend/src/worldBuilder/document/spawnDocument.ts) |
| `frontend/src/worldBuilder/libraryCatalog.ts` | [frontend/src/worldBuilder/document/libraryCatalog.ts](../frontend/src/worldBuilder/document/libraryCatalog.ts) |
| `frontend/src/worldBuilder/WorldBuilderPanel.tsx` | [frontend/src/worldBuilder/panels/WorldBuilderPanel.tsx](../frontend/src/worldBuilder/panels/WorldBuilderPanel.tsx) |
| `frontend/src/worldBuilder/CollisionBuilderPanel.tsx` | [frontend/src/worldBuilder/panels/CollisionBuilderPanel.tsx](../frontend/src/worldBuilder/panels/CollisionBuilderPanel.tsx) |
| `frontend/src/worldBuilder/LayoutInspector.tsx` | [frontend/src/worldBuilder/panels/LayoutInspector.tsx](../frontend/src/worldBuilder/panels/LayoutInspector.tsx) |
| `frontend/src/worldBuilder/SpawnInspector.tsx` | [frontend/src/worldBuilder/panels/SpawnInspector.tsx](../frontend/src/worldBuilder/panels/SpawnInspector.tsx) |
| `frontend/src/worldBuilder/EditorWorldControls.tsx` | [frontend/src/worldBuilder/panels/EditorWorldControls.tsx](../frontend/src/worldBuilder/panels/EditorWorldControls.tsx) |
| `frontend/src/worldBuilder/LibraryTabs.tsx` | [frontend/src/worldBuilder/panels/LibraryTabs.tsx](../frontend/src/worldBuilder/panels/LibraryTabs.tsx) |
| `frontend/src/worldBuilder/PiecePreview.tsx` | [frontend/src/worldBuilder/panels/PiecePreview.tsx](../frontend/src/worldBuilder/panels/PiecePreview.tsx) |
| `frontend/src/worldBuilder/WorldBuilderScene.tsx` | [frontend/src/worldBuilder/scene/WorldBuilderScene.tsx](../frontend/src/worldBuilder/scene/WorldBuilderScene.tsx) |
| `frontend/src/worldBuilder/LayoutScene.tsx` | [frontend/src/worldBuilder/scene/LayoutScene.tsx](../frontend/src/worldBuilder/scene/LayoutScene.tsx) |
| `frontend/src/worldBuilder/LayoutPlan.tsx` | [frontend/src/worldBuilder/scene/LayoutPlan.tsx](../frontend/src/worldBuilder/scene/LayoutPlan.tsx) |
| `frontend/src/worldBuilder/LayoutMeshes.tsx` | [frontend/src/worldBuilder/scene/LayoutMeshes.tsx](../frontend/src/worldBuilder/scene/LayoutMeshes.tsx) |
| `frontend/src/worldBuilder/WorldReference.tsx` | [frontend/src/worldBuilder/scene/WorldReference.tsx](../frontend/src/worldBuilder/scene/WorldReference.tsx) |
| `frontend/src/worldBuilder/ColliderPlan.tsx` | [frontend/src/worldBuilder/scene/ColliderPlan.tsx](../frontend/src/worldBuilder/scene/ColliderPlan.tsx) |
| `frontend/src/worldBuilder/ChunkGuide.tsx` | [frontend/src/worldBuilder/scene/ChunkGuide.tsx](../frontend/src/worldBuilder/scene/ChunkGuide.tsx) |
| `frontend/src/worldBuilder/SpawnMarkers.tsx` | [frontend/src/worldBuilder/scene/SpawnMarkers.tsx](../frontend/src/worldBuilder/scene/SpawnMarkers.tsx) |

The old CAN server files are now feature packages: can_router.py → capture/; can_ai_router.py → analysis/; can_ml_service.py → learning/. Each package README lists every moved function/class.

44 comment-only frontend examples are preserved under frontend/legacy, outside the active application tree.

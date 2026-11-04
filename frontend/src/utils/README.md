# utils

cameraFollow.ts contains pure camera smoothing/placement; drivingViews.ts defines approved driving camera order/presets; constants.ts defines input thresholds. Use index.ts externally. Keep world/vehicle configuration in its own feature rather than adding globals here.

`cameraDrag.ts` owns bare-canvas primary/right mouse and touch pointer capture. It leaves HUD gestures alone, checks the live menu/scope gate, and releases on cancel, outside release, blur, hidden tabs or camera cleanup. `PlayerCameraControls` keeps camera sensitivity, orbit bounds and smoothing.
Scoped aiming reuses the same pointer ownership in `combat/scopeAim.ts`, with a separate active rig and magnification-scaled turret deltas. Scope controls and research panels keep their own pointer input.

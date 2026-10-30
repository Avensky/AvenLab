# Keyboard, controller and touch

Keyboard.ts maps keys; GameController.ts polls one connected pad with neutral re-arming. inputRouting.ts decides drive vs menu priority. TouchControls.tsx owns pointer capture and source holds. useControlRelease.ts releases transient controls.

## How to edit

User bindings live in store/preferences. Requested masks and source arbitration live in store/input. Menu braking is owned by store/menus/uiStore.ts, so every opening path agrees. Fixed shortcuts/glyphs must match GameController.ts and components/controller.

physicalMenuPress.ts bridges controller A down/up to focused cockpit controls.
Custom controls own their hold; ordinary physical switches click once on release.
Menu rows keep rising-edge activation. Blur, disconnect, panel changes and
teardown cancel a hold. Keep this bridge and useMomentaryFeedback in agreement
so simulated keyboard steps always include keyup and never leave a contact glow.

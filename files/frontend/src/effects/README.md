# Cameras and active effects

Cameras.tsx chooses driving/inspection view. RotatingCamera.tsx and VehicleRotatingCamera.ts support preview camera behavior. Retired comment-only engine/skid/audio examples are in frontend/legacy.

## How to edit

Camera defaults/preferences are in store/presentation and store/preferences. Keep frame callbacks off when their scene is unmounted. Edit input routing to enter/leave inspection, not a separate overlay flag.

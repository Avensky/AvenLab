# Driving mode

SandBox.tsx mounts scene/vehicle renderers. SandboxSetup.tsx validates service readiness and sends the chosen vehicle/map request.

## How to edit

Change world/ for city rendering, vehicles/ for GLBs, Rust physics/setup for handling. Setup only requests a start; server responses own actual spawning.

# CAN research UI

SignalReconSetup.tsx chooses identity/interface/mode. SignalRecon.tsx is the workspace. SignalReconMission.tsx runs experiments. SignalReconPlayback.tsx reviews captures. SignalReconBrainConsole.tsx inspects analysis.

## How to edit

Protocol state and timing live in store/recon, not these pages. Backend session/capture changes belong to app/can/capture; analysis changes belong to app/can/analysis. The large mission/playback pages remain behavior-preserved and are called out for later UI extraction in REPO_AUDIT.md.

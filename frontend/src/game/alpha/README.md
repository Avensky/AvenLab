# Alpha selection and queues

HeroSelection owns role-tab presentation and one pending UI command; Server owns
seats, roles and locked picks. sessionActions owns the existing socket's spawn
acknowledgement and garage-to-driving handoff. useAlphaFlow reacts to admission
while queued. QueueScreen displays the server's ticket and uses the shared video
background. ProgressBadge and Career read server progression; they never award it.
EditorTestAction explicitly exports/applies a draft to the dedicated editor slot.

VehicleMenu lazily reuses HeroSelection in managed games; Back closes the picker
without cancelling the occupied seat. Main selection Back cancels its session.
See docs/ALPHA_UI_AND_LOBBIES.md for scope and alpha balancing values.

Play now enters this garage; its six mode destinations are defined in alphaStore.
Only four are server GameMode IDs. Signal Recon opens existing interface setup;
Swarm remains planned. sessionActions rejects research/planned mode_join calls.
The restored VehicleSelector/MapSelector use native SelectorArrow buttons under
form navigation, retaining legacy setup-row behavior elsewhere. Vehicle arrows
use the same server-validated hero chooser as the wall. Map arrows lock once a
world is admitted. Headers, mode/roster rows and the bottom workbench use the full
safe viewport width; the main menu has brand/progress left and actions right.

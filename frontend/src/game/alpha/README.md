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

# Driving HUD composition

DrivingHUD.tsx positions independent groups. HudGroup.tsx honors saved visibility. Dashboard/ owns gauges, Cockpit/ owns controls/radio/research, Minimap/ owns navigation, command/ owns the active terminal.

## How to edit

Change HUD layout in drivingHud.css; change instrument art inside Dashboard or Steering.tsx. Hiding a group unmounts its controls and releases only its input source. Ignition Auto fades while moving; research HVAC requires opt-in on the driving HUD.

Pedals.tsx uses the same delegated `useMomentaryFeedback` owner as the cockpit switches. Pedal borders follow local contact, while `aria-pressed` continues to report merged device input. Change shared pedal/assist faces in Cockpit/styles/switches.css; keeping a mouse over a released button must never retain its pressed border. Assist faces stay silver with black text/icons across themes.

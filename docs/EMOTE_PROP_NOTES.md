# Emote and prop pairing notes

Handheld props add personality to the equipped character. The Character preview
offers the complete gesture library. During a gesture, compatible props stay
visible and other props are temporarily stowed. The equipped appearance is saved
independently of this presentation state. Driving always stows handheld props.

The executable pairing notes live in
`frontend/src/game/characters/emotePropNotes.ts`. Add a reviewed pairing there
after checking both driver models and the relevant wardrobe.

| Gesture | Shop bag | Review note |
| --- | --- | --- |
| Relaxed breathing and comfortable weight shift | Keep | Small carrying motion adds character. |
| Upright reactions 003 and 005 | Keep | Existing carrying pose remains available. |
| Friendly wave | Keep | Right hand waves while the left carries the bag. |
| Lift the bag and check the bag | Keep | These gestures are built around the prop. |
| Steering, shifting, parking brake, horn and ignition | Stow | Both hands must be available to operate the vehicle. |
| Applause, hearts, two-handed gestures and dances | Stow pending review | Review clearances before marking a pairing as compatible. |
| Maps, flags, binoculars and other gesture-owned props | Stow shop bag | The gesture's own prop takes priority. |
| Other unreviewed gestures | Stow pending review | Keep the complete animation available. |

Use both hands where the action calls for them. Handheld props do not constrain
new choreography. For future prop filters, distinguish a reviewed good pairing
from an unreviewed pairing and a gesture that requires temporarily free hands.
Vehicle controls use the hand nearest the control, with the other hand retained
on the steering wheel. Horn and ignition use the right hand. Column selectors,
parking-brake pedals and parking-brake switches use their corresponding control
positions.

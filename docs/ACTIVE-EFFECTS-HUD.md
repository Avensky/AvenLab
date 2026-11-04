# Active buffs and debuffs HUD

Confirmed active effects now appear as round ability-style icons at bottom center. On narrow screens, the row sits above the driving controls rather than covering pedals, ignition, aim or the gear gate. Keyboard/controller weapon selection keeps its own space below the row.

| Nature | Glow | Current effects |
| --- | --- | --- |
| Offense | Gold | Ram charge |
| Mobility | Cyan | Ram speed tail, car nitrous |
| Control debuff | Red/pink | Stun |
| Heat debuff | Orange | Engine hot, thermal recovery / reduced output |
| Wear debuff | Amber | Condition-related engine penalty |
| Healing | Green | Color foundation; no unimplemented healing buff is shown |
| Defense | Blue | Color foundation for future confirmed defensive effects |
| Utility | Purple | Color foundation for future utility effects |

Timers and draining rings use confirmed remaining durations. Untimed conditions say ACTIVE; no recovery countdown is invented. A badge opens a short explanation when selected and never fires or reactivates an ability. Escape dismisses that explanation without opening Pause. Color, distinct icons and accessible names all identify effect type.

Ram charge changes into its reduced boost tail, with no duplicate nitrous badge. Stun/thermal recovery suppress contradictory speed-buff indications. Completed cooldowns and unavailable effects are not active buffs and do not appear. Pause, disconnect/stale telemetry and expiry remove the row as appropriate, without leaving an empty panel.

The pure projection lives in activeEffects.ts and semantic colors in activeEffects.css. Existing server fields supply the effects; this update adds no backend modifiers or new healing/defensive abilities. Future abilities must expose confirmed state before adding a badge. Snapshot signals are rounded for display and selected independently of pose updates. Telemetry sampling reuses the existing reference-counted HUD sampler.

## Validation and feedback

Six effect-projection tests cover phase changes, flag availability, mutually exclusive states, missing data, invalid timers and no cooldown-only badges. Browser checks cover six screen sizes, placement and clear input targets, color nature, tap details, expiry, pause/resume, stale data and keyboard/controller fallback layout. Earlier floating-utility, pedal, hatch/MG and Ram heat fixes are included. Check visibility and readability on your physical phone and preferred theme/HUD scale.

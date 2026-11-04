# Ready rings and combat hatches

Ready ability dials now retain clear annular gaps: outer radius 29 (3.5-wide stroke), white separator radius 24 (1-wide), inner radius 18.5 (2.5-wide). The clear widths are 2.75 and 3.75 SVG units. An annular dark backing prevents glow from merging the three lines. The ready glow is concentrated on the outer ring instead of filling a blurred disc. Unselected inner rings are lighter; selected weapon faces retain a white outer glow and accent-blue inner ring. Hero X artwork/layout is unchanged.

The separate commander hatch closes 90 degrees around its hinge when combat controls are on. The original combined mesh contains the driver's sideways hatch and the commander lid's exterior skin: those triangles are isolated into owned runtime geometry so both skins follow one turret hinge, while the lower lid follows the chassis. The driver lid closes 88 degrees around its lower corner. Both movable lids start closed, including previews; disabling combat controls opens them smoothly for inspection. No source GLB is rewritten.

The roof-gun opening/lid is baked into the Turret mesh and stays as imported. This patch does not split that complex mesh or pretend all three openings are sealed. Independent roof-gun HP/disable/repair is a future combat-module milestone, not implemented here. The alpha priority is basic authoritative vehicle HP, damage, death and respawn first; see ALPHA-MILESTONES.md.

Feedback: verify driver-lid seating and hinge clearances on your installed GLB, especially at large turret yaw and on slopes. These are model-specific cosmetic hinges, not physical hatch colliders or armor simulation.

Validation: current frontend tests, six-size ring/control browser checks, actual-model hatch open/close checks, TypeScript/lint/bundle and installer results are in validation.json. Earlier Rust and other HUD checks remain historical because this patch changes no Rust sources.

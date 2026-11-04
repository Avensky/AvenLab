# Floating aim layout and matched pedal height

The joystick defines an S by S aim module. Direct children other than the joystick are position:absolute overlays. Reset occupies the lower left and Lock the lower right; both extend eight pixels across the lower edge. Their glow and visible extent never increase the module, matrix or dock measurements. Future overlay tools follow the same direct-child rule.

The adjacent matrix is S high, two columns by three rows, with S/3 square cells. Ability icons, fill artwork and labels scale with the cells instead of reserving the previous tall row height. Fire stays bottom right. Low-height landscape shrinks the matrix with the normal shifter/joystick size.

Layered cooldown geometry uses outer radius 28, white separator radius 25 and inner radius 22. Outer/inner thickness remains 3.5/2.5. Non-layered Hero X geometry stays unchanged.

Lock cooldown is 250 ms; Reset is 1000 ms. Both are shared input deadlines, rendered through useCooldownProgress. Controller cooldown refusals are consumed by the utility action, without accidentally invoking the unarmed controller bindings. Scope's temporary free-aim and restore behavior remains separate from the lock-button timer.

Pedal and ignition heights are both 73.5 px normally and 51 px in short landscape, preserving the preceding ignition size. Pedals are wider and their icons grow. Their lower edges still align.

## Validation

TypeScript, lint and production bundle checks are recorded in validation.json. Browser checks cover six sizes, equal matrix/joystick height, utility placement, removal/reinsertion causing zero layout changes, ring ordering, cooldown refill, enlarged pedal/ignition alignment, and existing scope/firing controls. The controller regression verifies that rapid R3 cannot bypass cooldown or trigger alternate bindings. Earlier backend/model tests are retained as historical results; this patch has no new Rust changes.

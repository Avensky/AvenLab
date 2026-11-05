# Tire heat and pressure

In **Worlds → Create**, check **Simulate tire heat and pressure**. For an existing saved world, its owner can switch **Tire heat & pressure: ON / OFF** on the world card, including while it is occupied. The server saves the choice and applies one setting to everyone in that world. Existing saves and new user worlds default to off. For newly created server-managed worlds (including matchmaking), set `AVENLAB_TIRE_THERMALS=1` before starting the server; unset it or use `0` for the default. Reusing an existing saved world preserves its stored choice.

**Off:** the existing tire solver uses its original friction coefficients. No thermal integration runs. **On:** each pneumatic tire starts at 77°F and 32 PSI gauge. Load, speed, sliding and braking add heat; airflow cools it toward ambient. Pressure follows absolute temperature at fixed volume. Temperature and pressure adjust the existing longitudinal and lateral friction limits. The tire model samples at about 10 Hz, reusing the existing wheel contacts; the rest of vehicle simulation keeps its existing rates. Tracks bypass the model. Switching modes or respawning resets the tires.

To inspect a car, open the debugger and request **Wheels**. The wheel readout shows °F and gauge PSI. Tire readings travel only with requested wheel diagnostics; they are not added to gameplay snapshots.

This is an alpha handling model, not measured compound data. It does not simulate leaks, carcass flex, punctures, adjustable starting inflation or tire wear. A useful tuning drive is to repeat the same braking and slalom runs off and on, let the car cool in between, and compare stop distance, steering feel and individual wheel readings.

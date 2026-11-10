# Tire solver

The tire module owns contact data, steering, slip, combined longitudinal and
lateral force limits, and per-wheel heat and pressure. The suspension module
measures ground contact and constructs the patches supplied to the solver.

Use the final normal load after anti-roll transfer in both the tire solve and
the diagnostic load bar. ABS and traction control share the same force budget.

# Aven_Tire

mod.rs is the tire feature API. types/state define per-wheel data; kinematics computes slip; brush_lite/longitudinal/solve apply tire forces; steering handles response; anti_roll applies load transfer.

Change one physical behavior here and validate the existing handling tests. Inputs are requested commands, not HUD readings. Suspension contact acquisition stays in suspension_contact.rs; vehicle mass/setup stays in vehicle_setup.rs.

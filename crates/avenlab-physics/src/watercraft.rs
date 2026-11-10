//! Lumped hull buoyancy, hydrodynamic drag, thrust and rudder forces.
use rapier3d::prelude::*;

#[derive(Clone, Copy, Debug)]
pub struct HullConfig {
    pub mass_kg: f32,
    pub thrust_n: f32,
    pub top_speed_m_s: f32,
}

/// Apply forces for one Rapier substep at a caller-provided water surface.
/// Throttle and rudder commands are signed, and brake is in 0..1.
/// The caller is responsible for clearing forces between substeps.
pub fn apply_hull_forces(
    body: &mut RigidBody,
    config: HullConfig,
    water_y: f32,
    throttle: f32,
    brake: f32,
    steer: f32,
) {
    let forward = body.rotation() * Vector::z();
    let side = body.rotation() * Vector::x();
    let up = body.rotation() * Vector::y();
    let velocity = *body.linvel();
    let longitudinal = velocity.dot(&forward);
    let lateral = velocity.dot(&side);

    // A spring and damper approximate buoyancy around the floating equilibrium.
    let mass = config.mass_kg;
    let equilibrium_y = water_y + 2.0;
    let spring = (equilibrium_y - body.translation().y) * mass * 3.3;
    let damper = -velocity.y * mass * 3.6;
    let lift = (mass * 9.81 + spring + damper).clamp(0.0, mass * 9.81 * 3.0);

    let requested = throttle.clamp(-1.0, 1.0);
    let speed_limited =
        longitudinal.abs() >= config.top_speed_m_s && longitudinal.signum() == requested.signum();
    let thrust = if speed_limited {
        0.0
    } else {
        requested * config.thrust_n
    };
    let drag = -longitudinal * mass * (0.10 + brake.clamp(0.0, 1.0) * 1.5);
    let side_drag = -lateral * mass * 1.8;
    body.add_force(
        Vector::y() * lift + forward * (thrust + drag) + side * side_drag,
        true,
    );

    // A rudder reverses with sternway. Hull inertia and angular drag limit yaw.
    let rudder = -steer.clamp(-1.0, 1.0)
        * (longitudinal.abs() / 5.0).clamp(0.08, 1.0)
        * longitudinal.signum();
    let yaw = mass * (rudder * 90.0 - body.angvel().y * 700.0);
    let restore = up.cross(&Vector::y()) * mass * 1450.0;
    body.add_torque(Vector::y() * yaw + restore, true);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hull_lift_balances_weight_at_the_modeled_equilibrium() {
        let mut body = RigidBodyBuilder::dynamic()
            .translation(vector![0.0, 2.0, 0.0])
            .build();
        let config = HullConfig {
            mass_kg: 1000.0,
            thrust_n: 9000.0,
            top_speed_m_s: 14.0,
        };
        apply_hull_forces(&mut body, config, 0.0, 0.0, 0.0, 0.0);
        assert_eq!(body.user_force(), vector![0.0, config.mass_kg * 9.81, 0.0]);
        assert_eq!(body.user_torque(), Vector::zeros());
    }
}

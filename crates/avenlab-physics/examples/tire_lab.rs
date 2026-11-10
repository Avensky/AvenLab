//! A repeatable one-wheel test on a flat Rapier road, with the chassis held
//! at a prescribed pose and speed.
use avenlab_physics::suspension::{
    Wheel, WheelConfig, build_suspension_contact, suspension_from_sag,
};
use avenlab_physics::tire::solve::assess_drive;
use avenlab_physics::tire::steering::SteeringState;
use avenlab_physics::tire::{ControlInput, SolveContext, WheelId, solve_step};
use rapier3d::prelude::*;

fn main() {
    let mass = 1280.0;
    let reference_load = mass * 9.81 / 4.0;
    let (stiffness, damping) = suspension_from_sag(mass, 4, 0.065, 1.05);
    let mut wheel = Wheel::new(WheelConfig {
        id: WheelId::FL,
        offset: point![0.0, 0.0, 0.0],
        rest_length: 0.18,
        max_length: 0.12,
        radius: 0.33,
        stiffness,
        damping,
        drive: true,
        steer: true,
    });

    let mut bodies = RigidBodySet::new();
    let handle = bodies.insert(
        RigidBodyBuilder::dynamic()
            .translation(vector![0.0, 0.565, 0.0])
            .linvel(vector![2.0, 0.0, 15.0])
            .build(),
    );
    let mut colliders = ColliderSet::new();
    colliders.insert(
        ColliderBuilder::cuboid(10.0, 0.05, 10.0)
            .translation(vector![0.0, -0.05, 0.0])
            .build(),
    );
    let mut query = QueryPipeline::new();
    query.update(&colliders);

    let body = &bodies[handle];
    let contact = build_suspension_contact(
        &wheel,
        &SteeringState::default(),
        body,
        &query,
        &bodies,
        &colliders,
        handle,
        reference_load,
        InteractionGroups::all(),
    )
    .expect("the wheel is in reach of the road");
    wheel.normal_force = contact.normal_force;
    for _ in 0..300 {
        wheel.thermal.step(
            0.1,
            25.0,
            contact.v_long,
            wheel.normal_force / reference_load,
            contact.v_lat,
            0.0,
        );
    }

    let load = wheel.load();
    println!(
        "FL load {:.0} N, bar {:.0}%, {:.1} °C, {:.1} psi",
        load.normal_force_n,
        load.bar_fraction(12_000.0) * 100.0,
        wheel.thermal.temp_c,
        wheel.thermal.psi,
    );

    let ctx = SolveContext {
        dt: 1.0 / 120.0,
        mass,
        engine_force: 6_000.0,
        brake_force: 7_600.0,
        abs_enabled: true,
        tcs_enabled: true,
        abs_limit: 0.90,
        tcs_limit: 0.85,
        driven_wheels: 1.0,
        base_front_bias: 0.66,
        bias_gain: 0.25,
        wheelbase: 2.6,
        mu_base: 0.88,
    };
    let input = ControlInput {
        throttle: 1.0,
        ..ControlInput::default()
    };
    let mut patch = contact.tire_patch(&wheel, body, ctx.mu_base * wheel.thermal.grip, input.brake);
    patch.set_resolved_load(load.normal_force_n, reference_load, 0.15);
    let mut contacts = [patch];
    let traction = assess_drive(&ctx, &input, &contacts);
    let result = solve_step(&ctx, &input, &mut contacts);
    println!(
        "Drive demand {:.0} N, traction control active {}, impulse {:?} N·s",
        traction.demand_n, traction.control_active, result.impulses[0].impulse,
    );
}

use std::collections::HashMap;
use std::sync::{OnceLock, atomic::{AtomicU32, Ordering}};
use rapier3d::math::Rotation;
use rapier3d::prelude::*;
use crate::physics::PhysicsWorld;
use crate::suspension_contact::{
    build_suspension_contact, cast_wheel_ground, planar_wheel_basis,
    SuspensionContact, CONTACT_EPSILON,
};
use crate::aven_tire::{solve_step, ContactPatch, ControlInput, SolveContext, WheelId};
use crate::aven_tire::steering::{solve_steering, SteeringConfig};
use crate::aven_tire::kinematics;
use crate::aven_tire::anti_roll::apply_arb_load_transfer;
use crate::vehicle_debug::{DebugChassis, DebugFlags, DebugRay, DebugSlipRay, DebugWheel};
use crate::vehicle_state::{Vehicle, VehicleStateFlags};
use crate::powertrain::Demand;
#[cfg(test)]
use crate::powertrain::Powertrain;

static CONTACT_TRACE_ENABLED: OnceLock<bool> = OnceLock::new();
static CONTACT_TRACE_TICK: AtomicU32 = AtomicU32::new(0);

pub(crate) fn contact_trace_enabled() -> bool {
    *CONTACT_TRACE_ENABLED.get_or_init(|| {
        std::env::var("AVENLAB_CONTACT_TRACE")
            .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
    })
}

#[inline]
fn v3(v: Vector<Real>) -> [f32; 3] { [v.x, v.y, v.z] }

#[inline]
fn p3(p: Point<Real>) -> [f32; 3] { [p.x, p.y, p.z] }

fn steering_config(vehicle: &Vehicle) -> SteeringConfig {
    SteeringConfig {
        wheelbase: vehicle.config.wheelbase(),
        track_width: vehicle.config.front_track_width,
        max_steer_angle: vehicle.config.max_steer_angle,
        ackermann: vehicle.config.ackermann,
    }
}

fn wheel_pose_rotation(
    rotation: Rotation<Real>, forward: Vector<Real>, ground_normal: Option<Vector<Real>>,
    steer_angle: f32,
) -> [f32; 4] {
    // This ray-wheel solver has no camber linkage. Grounded wheels use the
    // contact frame instead of inheriting the body's entire roll/pitch. Their
    // centers, orientation and diagnostics now agree about the support plane.
    // Airborne wheels retain chassis orientation and steering; never pin them.
    let q = if let Some(normal) = ground_normal {
        let (forward, side) = planar_wheel_basis(forward, normal);
        let basis = rapier3d::na::Matrix3::from_columns(&[side, normal, forward]);
        Rotation::from_rotation_matrix(&rapier3d::na::Rotation3::from_matrix_unchecked(basis))
    } else {
        rotation * Rotation::from_axis_angle(&Vector::y_axis(), steer_angle)
    };
    [q.i, q.j, q.k, q.w]
}

struct ImpulseAccumulator {
    linear: Vec<Vector<Real>>,
    at_points: Vec<(Vector<Real>, Point<Real>)>,
}

impl ImpulseAccumulator {
    fn new() -> Self { Self { linear: vec![], at_points: vec![] } }
    fn apply(self, body: &mut RigidBody) {
        // This is the only custom impulse application point for a vehicle in
        // this substep. Each queued impulse is consumed exactly once.
        for j in self.linear { body.apply_impulse(j, true); }
        for (j, p) in self.at_points { body.apply_impulse_at_point(j, p, true); }
    }
}

impl PhysicsWorld {
    /// Sense and solve each substep. Snapshot geometry is refreshed separately
    /// after Rapier finishes integrating the outer step.
    pub(crate) fn apply_vehicle_forces(&mut self, dt: Real) {
        for (&handle, wheels) in self.wheels.iter_mut() {
            let Some(body_ro) = self.bodies.get(handle) else { continue };
            let Some(player_id) = self.body_to_player.get(&handle) else { continue };
            let Some(vehicle) = self.vehicles.get_mut(player_id) else { continue };
            if wheels.is_empty() { continue; }

            let longitudinal_speed = (body_ro.rotation().inverse() * body_ro.linvel()).z;
            let (throttle, brake) = vehicle.cockpit.advance(dt, longitudinal_speed, vehicle.throttle, vehicle.brake, vehicle.handbrake, vehicle.powertrain.running);
            let handbrake = vehicle.handbrake.max(if vehicle.cockpit.parked() { 1.0 } else { 0.0 });
            vehicle.powertrain.manual_gear = vehicle.cockpit.manual_gear();
            vehicle.vehicle_flags.set(VehicleStateFlags::TCS, vehicle.cockpit.tcs_enabled(vehicle.vehicle_flags.contains(VehicleStateFlags::TCS)));
            vehicle.powertrain.advance(vehicle.config.resources, Demand {
                throttle, longitudinal_speed,
                wheel_radius: vehicle.config.wheel_radius, engine_force: vehicle.config.engine_force,
            }, dt);
            vehicle.vehicle_flags.set(VehicleStateFlags::ENGINE_ON, vehicle.powertrain.running);
            vehicle.vehicle_flags.set(VehicleStateFlags::BOOST, vehicle.powertrain.boost_active);
            if vehicle.cockpit.enabled {
                vehicle.vehicle_flags.set(VehicleStateFlags::HEADLIGHTS, vehicle.cockpit.headlights(vehicle.powertrain.running));
            }

            let mut impulses = ImpulseAccumulator::new();
            let body_mass = body_ro.mass() as f32;
            // N per wheel at the nominal equal-load state. Actual spring/ARB
            // loads below control grip; this reference is only a scaling basis.
            let fz_ref = body_mass * 9.81 / wheels.len() as f32;
            let mut contacts = Vec::new();
            let mut suspension_contacts: Vec<(WheelId, SuspensionContact)> = Vec::new();
            let mut compression = HashMap::new();
            let mut loads = HashMap::new();

            let cfg = steering_config(vehicle);
            let target = vehicle.steer * cfg.max_steer_angle;
            // One active steering strategy: a 0.10 s exponential response.
            // The legacy torque rack is not called. Ackermann below is geometry,
            // not another smoothing pass; positive input turns toward local -X.
            let response = 1.0 - (-dt as f32 / 0.10).exp();
            vehicle.steer_angle += (target - vehicle.steer_angle) * response;
            let (fl, fr) = solve_steering(&cfg, body_ro.rotation(), vehicle.steer_angle);
            vehicle.steering.fl = fl;
            vehicle.steering.fr = fr;

            for wheel in wheels.iter_mut() {
                let id = WheelId::from_debug(&wheel.debug_id);
                wheel.normal_force = 0.0;
                let Some(contact) = build_suspension_contact(
                    wheel, &vehicle.steering, body_ro, &self.query_pipeline,
                    &self.bodies, &self.colliders, handle, fz_ref,
                ) else {
                    wheel.grounded = false;
                    wheel.compression = 0.0;
                    wheel.compression_ratio = 0.0;
                    // Visual free spin is integrated once per substep. It has
                    // no effect on chassis propulsion or the friction budget.
                    let center = body_ro.position() * wheel.offset
                        + vector![0.0, -wheel.full_droop_length(), 0.0];
                    let velocity = kinematics::point_velocity(
                        *body_ro.linvel(), *body_ro.angvel(), *body_ro.center_of_mass(), center,
                    );
                    let (forward, _) = kinematics::wheel_basis_world(
                        &wheel.debug_id, body_ro.rotation(), &fl, &fr,
                    );
                    let rolling_speed = velocity.dot(&forward) / wheel.radius.max(0.001);
                    let powered_spin = if wheel.drive && vehicle.vehicle_flags
                        .contains(VehicleStateFlags::ENGINE_ON) {
                        vehicle.throttle * 18.0
                    } else { 0.0 };
                    wheel.wheel_speed += (rolling_speed + powered_spin - wheel.wheel_speed)
                        * (1.0 - (-8.0 * dt).exp());
                    wheel.wheel_speed *= (-16.0 * vehicle.brake * dt).exp();
                    continue;
                };

                compression.insert(id, contact.compression);
                loads.insert(id, contact.normal_force);
                wheel.grounded = true;
                wheel.compression = contact.compression;
                wheel.compression_ratio = contact.compression_ratio;

                let local_forward = body_ro.rotation().inverse() * contact.forward;
                let steer_angle = if wheel.steer {
                    local_forward.x.atan2(local_forward.z)
                } else { 0.0 };
                let tangent_velocity = contact.point_vel
                    - contact.ground_normal * contact.point_vel.dot(&contact.ground_normal);
                let speed = tangent_velocity.norm();
                let brake_dir = if speed > 1.0e-4 {
                    -tangent_velocity / speed
                } else {
                    contact.forward * if contact.v_long >= 0.0 { -1.0 } else { 1.0 }
                };
                contacts.push(ContactPatch {
                    wheel: id, grounded: true,
                    hit_point: p3(contact.hit_point), apply_point: p3(contact.apply_point),
                    forward: v3(contact.forward), side: v3(contact.side),
                    v_long: contact.v_long, v_lat: contact.v_lat,
                    normal_force: contact.normal_force,
                    // mu_lat is finalized once below AFTER anti-roll changes Fz.
                    mu_lat: vehicle.config.mu_base, mu_long: vehicle.config.mu_base,
                    // Legacy field retained for tire API compatibility. solve_step
                    // applies full lateral impulse at contact and ignores this.
                    roll_factor: 1.0,
                    drive: wheel.drive, brake: vehicle.brake, steer_angle,
                    compression_ratio: contact.compression_ratio,
                    vel_world: v3(contact.point_vel), brake_dir: v3(brake_dir),
                    speed_planar: speed, yaw_rate: body_ro.angvel().y,
                    relative_com: v3(contact.apply_point - *body_ro.center_of_mass()),
                    tire_state: wheel.tire_state,
                });
                suspension_contacts.push((id, contact));
            }

            apply_arb_load_transfer(
                WheelId::FL, WheelId::FR, &mut loads, &compression,
                vehicle.config.arb_front, fz_ref,
            );
            apply_arb_load_transfer(
                WheelId::RL, WheelId::RR, &mut loads, &compression,
                vehicle.config.arb_rear, fz_ref,
            );
            // Keep the axle load conserved after ARB redistribution. Clipping
            // each outside tire to 1.5*reference discarded needed support in a
            // hard turn, bottoming the chassis instead of resisting roll. The
            // contact builder already bounds raw impact load; ARB is bounded
            // and cannot make either side negative.
            // The same FINAL Fz goes to suspension impulse, friction budget and
            // telemetry. Anti-roll redistributes spring support; do not apply a
            // second independent ARB force/torque as well as these changed loads.
            for wheel in wheels.iter_mut() {
                wheel.normal_force = loads.get(&WheelId::from_debug(&wheel.debug_id))
                    .copied().unwrap_or(0.0);
            }
            for (id, contact) in &suspension_contacts {
                let force = loads.get(id).copied().unwrap_or(0.0);
                impulses.at_points.push((contact.ground_normal * force * dt, contact.apply_point));
            }
            for contact in &mut contacts {
                // Load sensitivity has one owner, after load redistribution.
                // Previously the contact builder computed this and we overwrote it.
                contact.normal_force = loads.get(&contact.wheel).copied().unwrap_or(0.0);
                let ratio = (contact.normal_force / fz_ref.max(1.0e-6)).max(0.2);
                let mu = vehicle.config.mu_base;
                contact.mu_lat = (mu * ratio.powf(-vehicle.config.load_sensitivity))
                    .clamp(mu * 0.6, mu * 1.1);
            }

            let ctx = SolveContext {
                dt, mass: body_mass,
                engine_force: vehicle.config.engine_force * vehicle.powertrain.power_multiplier, brake_force: vehicle.config.brake_force,
                abs_enabled: vehicle.vehicle_flags.contains(VehicleStateFlags::ABS),
                tcs_enabled: vehicle.vehicle_flags.contains(VehicleStateFlags::TCS),
                abs_limit: vehicle.config.abs_nx_limit, tcs_limit: vehicle.config.tcs_nx_limit,
                driven_wheels: wheels.iter().filter(|wheel| wheel.drive).count().max(1) as f32,
                base_front_bias: 0.66, bias_gain: 0.25,
                wheelbase: vehicle.config.wheelbase(), mu_base: vehicle.config.mu_base,
            };
            let control = ControlInput {
                throttle: vehicle.powertrain.drive_throttle,
                brake: brake.max(vehicle.powertrain.direction_brake), handbrake, steer: vehicle.steer,
            };
            let driven = ctx.driven_wheels.max(1.0);
            vehicle.cockpit.grip_limited = contacts.iter().any(|patch| patch.drive && patch.grounded
                && ctx.engine_force * control.throttle.abs() / driven > patch.normal_force * patch.mu_long * 0.95);
            vehicle.cockpit.traction_active = ctx.tcs_enabled && contacts.iter().any(|patch| patch.drive && patch.grounded
                && ctx.engine_force * control.throttle.abs() / driven > patch.normal_force * patch.mu_long * ctx.tcs_limit);
            let tire_forces = solve_step(&ctx, &control, &mut contacts);
            // solve_step emits engine/brake at COM and lateral impulse at the
            // patch. Contact application already produces yaw and roll torque;
            // adding artificial turn torque would duplicate the steering effect.
            for patch in &contacts {
                if let Some(wheel) = wheels.iter_mut()
                    .find(|wheel| WheelId::from_debug(&wheel.debug_id) == patch.wheel) {
                    wheel.tire_state = patch.tire_state;
                }
            }
            for impulse in tire_forces.impulses {
                let j: Vector<Real> = impulse.impulse.into();
                match impulse.at_point {
                    Some(point) => impulses.at_points.push((j, Point::from(point))),
                    None => impulses.linear.push(j),
                }
            }
            let body = self.bodies.get_mut(handle).unwrap();
            let velocity = *body.linvel();
            let speed = (velocity.x * velocity.x + velocity.z * velocity.z).sqrt();
            if control.brake.max(control.handbrake) > 0.8 && control.throttle.abs() < 0.001 && speed < 0.08 {
                // A near-rest brake hold only removes planar drift/yaw. It does
                // not freeze suspension motion, pitch or roll, or affect launch.
                body.set_linvel(vector![0.0, velocity.y, 0.0], true);
                let angular = *body.angvel();
                body.set_angvel(vector![angular.x, 0.0, angular.z], true);
            }
            impulses.apply(body);
        }
    }

    /// Publish wheels, chassis and debug geometry from the same final body pose.
    /// Ground casts measure contact only; they never apply a second force.
    pub(crate) fn refresh_vehicle_wheel_snapshots(&mut self) -> bool {
        let chassis_debug = self.debug_flags.contains(DebugFlags::CHASSIS);
        let wheel_debug = self.debug_flags.contains(DebugFlags::WHEELS);
        let ray_debug = self.debug_flags.contains(DebugFlags::RAYS);
        let slip_debug = self.debug_flags.contains(DebugFlags::SLIP);
        let load_debug = self.debug_flags.contains(DebugFlags::LOAD_BARS);
        let trace_enabled = contact_trace_enabled();
        let trace_now = trace_enabled
            && CONTACT_TRACE_TICK.fetch_add(1, Ordering::Relaxed) % 60 == 0;

        for (&handle, wheels) in self.wheels.iter_mut() {
            let Some(body) = self.bodies.get(handle) else { continue };
            let Some(player_id) = self.body_to_player.get(&handle) else { continue };
            let Some(vehicle) = self.vehicles.get(player_id) else { continue };
            let pos = body.position();
            let (fl, fr) = solve_steering(&steering_config(vehicle), &pos.rotation, vehicle.steer_angle);
            if chassis_debug {
                self.debug_overlay.chassis.push(DebugChassis {
                    // Debug box center must match the translated collider, not
                    // the body/model origin (different for Supra and Tank).
                    player_id: player_id.clone(), position: p3(pos * Point::from(vehicle.config.chassis_com_offset)),
                    rotation: [pos.rotation.i, pos.rotation.j, pos.rotation.k, pos.rotation.w],
                    half_extents: vehicle.config.chassis_half_extents,
                });
            }
            let mut grounded_count = 0;
            let mut driven_contacts = 0;
            let mut support = 0.0;
            let mut trace_wheels = String::new();
            for wheel in wheels.iter_mut() {
                let origin = pos * wheel.offset;
                let reach = wheel.full_droop_length() + wheel.radius + CONTACT_EPSILON;
                let ground = cast_wheel_ground(
                    wheel, body, &self.query_pipeline, &self.bodies, &self.colliders, handle,
                );
                let hit_point = ground.as_ref().map(|hit| hit.hit_point);
                let center = if let Some(hit) = &ground {
                    wheel.grounded = true;
                    wheel.compression = hit.compression;
                    wheel.compression_ratio = hit.compression_ratio;
                    hit.hit_point + hit.ground_normal * wheel.radius
                } else {
                    wheel.grounded = false;
                    wheel.normal_force = 0.0;
                    wheel.compression = 0.0;
                    wheel.compression_ratio = 0.0;
                    origin + vector![0.0, -wheel.full_droop_length(), 0.0]
                };
                wheel.world_center = p3(center);
                // A grounded tire bottom equals the actual ray hit height.
                // This refresh runs once after integration, with no extra lift,
                // force, smoothing or frontend suspension compensation.
                let (raw_forward, _) = kinematics::wheel_basis_world(
                    &wheel.debug_id, &pos.rotation, &fl, &fr,
                );
                let local_forward = pos.rotation.inverse() * raw_forward;
                wheel.steer_angle = if wheel.steer {
                    local_forward.x.atan2(local_forward.z)
                } else { 0.0 };
                wheel.world_rotation = wheel_pose_rotation(
                    pos.rotation, raw_forward, ground.as_ref().map(|hit| hit.ground_normal),
                    wheel.steer_angle,
                );
                let normal = vector![0.0, 1.0, 0.0];
                let (forward, side) = planar_wheel_basis(raw_forward, normal);
                let velocity = kinematics::point_velocity(
                    *body.linvel(), *body.angvel(), *body.center_of_mass(),
                    hit_point.unwrap_or(center),
                );
                let (v_long, v_lat) = kinematics::slip_components(velocity, forward, side);
                if wheel.grounded { wheel.wheel_speed = v_long / wheel.radius.max(0.001); }
                let slip_angle = v_lat.atan2(v_long.abs().max(0.1));
                // Grounded speed is assigned v_long/radius, so this visual slip
                // ratio is normally zero by construction. It cannot diagnose
                // real wheelspin; a rotational wheel inertia model is absent.
                let slip_ratio = (wheel.wheel_speed * wheel.radius - v_long) / v_long.abs().max(1.0);

                if ray_debug {
                    self.debug_overlay.suspension_rays.push(DebugRay {
                        player_id: player_id.clone(), origin: p3(origin), direction: [0.0, -1.0, 0.0],
                        length: reach, hit: hit_point.map(p3),
                        color: if wheel.grounded { [0.0, 1.0, 0.0] } else { [1.0, 0.0, 0.0] },
                    });
                }
                if wheel_debug {
                    self.debug_overlay.wheels.push(DebugWheel {
                        player_id: player_id.clone(), id: wheel.debug_id.clone(), center: wheel.world_center,
                        radius: wheel.radius, grounded: wheel.grounded,
                        compression: wheel.compression, compression_ratio: wheel.compression_ratio,
                        normal_force: wheel.normal_force, steer: vehicle.steer,
                        steering: wheel.steer, drive: wheel.drive, rotation: wheel.world_rotation,
                        wheel_speed: wheel.wheel_speed, steer_angle: wheel.steer_angle,
                        v_long, v_lat, slip_angle, slip_ratio,
                    });
                }
                if wheel.grounded {
                    grounded_count += 1;
                    driven_contacts += if wheel.drive { 1 } else { 0 };
                    support += wheel.normal_force;
                    if load_debug {
                        let origin = center + normal * 0.03;
                        let length = (wheel.normal_force / 12000.0).clamp(0.0, 1.0).sqrt() * 1.25;
                        self.debug_overlay.load_bars.push(DebugRay {
                            player_id: player_id.clone(), origin: p3(origin), direction: v3(normal), length,
                            hit: Some(p3(origin + normal * length)),
                            color: if WheelId::from_debug(&wheel.debug_id).is_left() {
                                [0.2, 0.6, 1.0]
                            } else { [1.0, 0.4, 0.2] },
                        });
                    }
                    if slip_debug && v_lat.abs() > 0.01 {
                        let direction = if v_lat >= 0.0 { side } else { -side };
                        self.debug_overlay.slip_vectors.push(DebugSlipRay {
                            player_id: player_id.clone(),
                            origin: p3(hit_point.unwrap() + normal * wheel.radius * 0.25),
                            direction: v3(direction), slip_angle,
                            magnitude: (v_lat.abs() * 0.25).clamp(0.02, 0.6),
                            color: if WheelId::from_debug(&wheel.debug_id).is_left() {
                                [0.2, 0.6, 1.0]
                            } else { [1.0, 0.4, 0.2] },
                        });
                    }
                }
                if trace_now {
                    use std::fmt::Write;
                    let _ = write!(trace_wheels, " {}:{} Fz={:.0} comp={:.3} bottom={:.3} ground={:.3} gap={:.4} v={:.2}",
                        wheel.debug_id, if wheel.grounded { "G" } else { "A" },
                        wheel.normal_force, wheel.compression, center.y - wheel.radius,
                        hit_point.map(|p| p.y).unwrap_or(f32::NAN),
                        hit_point.map(|p| center.y - wheel.radius - p.y).unwrap_or(f32::NAN), v_long);
                }
            }
            if trace_now {
                let forward = pos.rotation * vector![0.0, 0.0, 1.0];
                println!("[contact] player={} engine={} throttle={:.2} brake={:.2} steer={:.2} speed={:.2} vertical_speed={:.3} yaw={:.2} grounded={}/{} drive_contacts={} Fz={:.0}/weight={:.0}{}",
                    player_id, vehicle.vehicle_flags.contains(VehicleStateFlags::ENGINE_ON),
                    vehicle.throttle, vehicle.brake, vehicle.steer,
                    body.linvel().dot(&forward), body.linvel().y, body.angvel().y,
                    grounded_count, wheels.len(), driven_contacts,
                    support, body.mass() * 9.81, trace_wheels);
            }
        }
        trace_now
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::aven_tire::steering::SteeringState;
    use crate::vehicle_setup::BRZ;

    #[test]
    fn grounded_wheels_follow_the_contact_plane_instead_of_chassis_roll() {
        for roll in [-0.15, 0.15] {
            for steer in [-0.25, 0.25] {
                let chassis = Rotation::from_euler_angles(0.08, 0.7, roll);
                let wheel_forward = chassis * Rotation::from_axis_angle(&Vector::y_axis(), steer) * Vector::z();
                let normal = Vector::y();
                let q = wheel_pose_rotation(chassis, wheel_forward, Some(normal), steer);
                let q = Rotation::from_quaternion(rapier3d::na::Quaternion::new(q[3], q[0], q[1], q[2]));
                assert!((q * Vector::y() - normal).norm() < 1.0e-5);
                let (expected, _) = planar_wheel_basis(wheel_forward, normal);
                assert!((q * Vector::z() - expected).norm() < 1.0e-5);
            }
        }
    }

    #[test]
    fn airborne_wheels_keep_the_body_pose_and_steering() {
        let chassis = Rotation::from_euler_angles(0.2, 0.7, -0.3);
        let steer = -0.25;
        let expected = chassis * Rotation::from_axis_angle(&Vector::y_axis(), steer);
        let q = wheel_pose_rotation(chassis, expected * Vector::z(), None, steer);
        let q = Rotation::from_quaternion(rapier3d::na::Quaternion::new(q[3], q[0], q[1], q[2]));
        assert!((q.inverse() * expected).angle() < 1.0e-5);
    }

    #[test]
    fn wheel_snapshots_and_debug_use_the_final_chassis_pose() {
        let mut world = PhysicsWorld::new();
        world.debug_flags = DebugFlags::CHASSIS | DebugFlags::WHEELS | DebugFlags::RAYS;
        world.colliders.insert(ColliderBuilder::cuboid(2000.0, 0.05, 2000.0)
            .translation(vector![0.0, -0.05, 0.0]).build());
        let height = BRZ.nominal_chassis_y(0.0);
        let handle = world.bodies.insert(RigidBodyBuilder::dynamic()
            .translation(vector![0.0, height, 0.0]).build());
        world.register_vehicle(handle, BRZ);
        world.body_to_player.insert(handle, "test".into());
        world.vehicles.insert("test".into(), Vehicle {
            body: handle, config: BRZ, throttle: 0.0, steer: 0.0, brake: 0.0, handbrake: 0.0,
            pitch: 0.0, yaw: 0.0, roll: 0.0, ascend: 0.0,
            steer_angle: 0.0, steer_rate: 0.0, steering: SteeringState::default(),
            rack_torque: 0.0, rack_torque_filtered: 0.0,
            vehicle_flags: VehicleStateFlags::ENGINE_ON, player_flags: 0,
            powertrain: Powertrain::new(BRZ.resources),
            cockpit: crate::cockpit::Cockpit::default(),
        });
        world.query_pipeline.update(&world.colliders);
        world.refresh_vehicle_wheel_snapshots();

        // Emulate a new integrated pose with body roll. Refresh must use it
        // without making the grounded wheels inherit that body tilt.
        world.bodies[handle].set_translation(vector![20.0, height, 405.0], true);
        let yaw = Rotation::from_axis_angle(&Vector::y_axis(), 0.7);
        let roll = Rotation::from_axis_angle(&Vector::z_axis(), 0.03);
        world.bodies[handle].set_rotation(yaw * roll, true);
        world.debug_overlay.clear();
        world.refresh_vehicle_wheel_snapshots();

        let body = &world.bodies[handle];
        let snapshots = world.wheel_snapshots_for_body(handle, 0.0);
        for (wheel, snapshot) in world.wheels[&handle].iter().zip(&snapshots) {
            let mount = body.position() * wheel.offset;
            assert!((snapshot.position[0] - mount.x).abs() < 1.0e-4);
            assert!((snapshot.position[2] - mount.z).abs() < 1.0e-4);
            assert!((snapshot.position[1] - snapshot.radius).abs() < 1.0e-4);
            assert!(snapshot.grounded);
            let dot = snapshot.rotation[0] * yaw.i + snapshot.rotation[1] * yaw.j
                + snapshot.rotation[2] * yaw.k + snapshot.rotation[3] * yaw.w;
            assert!(dot.abs() > 1.0 - 1.0e-5);
            let debug = world.debug_overlay.wheels.iter().find(|debug| debug.id == wheel.debug_id).unwrap();
            assert_eq!(debug.center, snapshot.position);
            assert_eq!(debug.rotation, snapshot.rotation);
        }
        assert_eq!(world.debug_overlay.chassis[0].position, [20.0, height, 405.0]);
        assert_eq!(world.debug_overlay.suspension_rays.len(), 4);
    }
}

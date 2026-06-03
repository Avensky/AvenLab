use std::collections::HashMap;
use rapier3d::prelude::*;
use crate::physics::PhysicsWorld;
use crate::suspension_contact::{build_suspension_contact, SuspensionContact};
use crate::aven_tire::{solve_step, ContactPatch, ControlInput, SolveContext, WheelId};
use crate::aven_tire::steering::{solve_steering, SteeringConfig};
use crate::aven_tire::anti_roll::apply_arb_load_transfer;
use crate::vehicle_debug::{DebugChassis,DebugFlags,DebugRay,DebugSlipRay, DebugWheel};
use crate::vehicle_state::VehicleStateFlags;

#[inline]
fn v3(v: Vector<Real>) -> [f32; 3] {
    [v.x, v.y, v.z]
}

#[inline]
fn p3(p: Point<Real>) -> [f32; 3] {
    [p.x, p.y, p.z]
}

struct ImpulseAccumulator {
    linear: Vec<Vector<Real>>,
    at_points: Vec<(Vector<Real>, Point<Real>)>,
}

impl ImpulseAccumulator {
    fn new() -> Self { Self { linear: vec![], at_points: vec![],} }
    fn apply(self, body: &mut RigidBody) {
        for j in self.linear { body.apply_impulse(j, true); }
        for (j, p) in self.at_points {  body.apply_impulse_at_point(j, p, true); }
    }
}

impl PhysicsWorld {
    pub(crate) fn apply_vehicle_forces(&mut self, dt: Real) {

        self.query_pipeline.update(&self.colliders);

        let debug_chassis = self.debug_flags.contains(DebugFlags::CHASSIS);
        let debug_slip = self.debug_flags.contains(DebugFlags::SLIP);
        let debug_rays = self.debug_flags.contains(DebugFlags::RAYS);
        let debug_wheels = self.debug_flags.contains(DebugFlags::WHEELS);
        let debug_load_bars = self.debug_flags.contains(DebugFlags::LOAD_BARS);
        let debug_arb = self.debug_flags.contains(DebugFlags::ARB);

        for (&handle, wheels) in self.wheels.iter_mut() {
            let Some(body_ro) = self.bodies.get(handle) else { continue };
            let Some(player_id) = self.body_to_player.get(&handle) else { continue };
            let Some(vehicle) = self.vehicles.get_mut(player_id) else { continue };
            
            // ======================================================
            //  Debug: chassis
            // ======================================================
            let pos = body_ro.position();
            if debug_chassis {
                self.debug_overlay.chassis = Some(DebugChassis {
                    position: pos.translation.vector.into(),
                    rotation: [pos.rotation.i, pos.rotation.j, pos.rotation.k, pos.rotation.w],
                    half_extents: vehicle.config.chassis_half_extents,               });
            }

            // ==================================================
            //  Impulse Accumulator
            // ==================================================
            let mut impulses = ImpulseAccumulator::new();

            // --------------------------------------------------
            //  VEHICLE CONSTANTS
            // --------------------------------------------------
            let body_mass = body_ro.mass() as f32;
            let fz_ref = body_mass * 9.81 / wheels.len() as f32;
            
            
            // --------------------------------------------------
            // PHASE 1 — SENSE
            // --------------------------------------------------
            let mut contacts: Vec<ContactPatch> = Vec::new();
            let mut suspension_contacts: Vec<(WheelId, SuspensionContact)> = Vec::new();
            let mut axle_compression = HashMap::new();
            let mut axle_normal_force = HashMap::new();

            // println!(
            //     "vehicle={} contacts={} throttle={} brake={} steer={}",
            //     player_id,
            //     contacts.len(),
            //     vehicle.throttle,
            //     vehicle.brake,
            //     vehicle.steer
            // );
            
            let cfg = SteeringConfig {
                wheelbase: vehicle.config.wheelbase,    // meters (front axle to rear axle)
                track_width: vehicle.config.track_width,
                max_steer_angle: vehicle.config.max_steer_angle,
                ackermann: vehicle.config.ackermann,
            };
            
            let target = vehicle.steer * cfg.max_steer_angle;
            
            let tau = 0.10; // seconds to reach ~63%
            let k = 1.0 - (-dt as f32 / tau).exp();
            vehicle.steer_angle += (target - vehicle.steer_angle) * k;


            let (fl, fr) = solve_steering(&cfg, &body_ro.position().rotation, vehicle.steer_angle);
            vehicle.steering.fl = fl;
            vehicle.steering.fr = fr;
            
            for wheel in wheels.iter_mut() {
                let normal_force = 0.0;
                let mut grounded = false;
                if let Some(contact) = build_suspension_contact(
                    wheel,
                    vehicle,
                    &vehicle.steering,
                    body_ro,
                    &self.query_pipeline,
                    &self.bodies,
                    &self.colliders,
                    handle,
                    fz_ref,
                    dt as f32,
                ) {
                    let id = WheelId::from_debug(&wheel.debug_id);

                    axle_compression.insert(id, contact.compression);
                    axle_normal_force.insert(id, contact.normal_force);
                    suspension_contacts.push((id, contact.clone()));

                    let forward = if contact.forward.magnitude_squared() < 1e-6 {
                        body_ro.position().rotation * vector![0.0, 0.0, 1.0]
                    } else { contact.forward };

                    let v = contact.point_vel;

                    // suspension axis (world-space)
                    // ground normal (for now flat; later use contact.ground_normal)
                    let n = vector![0.0, 1.0, 0.0];

                    // planar/tangent velocity at contact
                    let v_n = v.dot(&n);
                    let v_t = v - n * v_n;

                    // safe normalize
                    let speed_t = v_t.norm();
                    let brake_dir = if speed_t > 1e-4 {
                        -v_t / speed_t   // oppose motion
                    } else {
                        // if nearly stopped, fall back to opposing v_long in wheel frame
                        let s = if contact.v_long >= 0.0 { -1.0 } else { 1.0 };
                        forward * s
                    };

                    let yaw_rate = body_ro.angvel().y as f32; // assuming Y-up
                    
                    let com_world: Point<Real> = body_ro.position() * body_ro.center_of_mass();
                    let relative_com = contact.apply_point - com_world;

                    grounded = contact.grounded;

                    contacts.push(ContactPatch {
                        wheel: id,
                        grounded,
                        hit_point: p3(contact.hit_point),
                        apply_point: p3(contact.apply_point),
                        forward: v3(forward),
                        side: v3(contact.side),
                        v_long: contact.v_long,
                        v_lat: contact.v_lat,
                        normal_force:contact.normal_force,
                        mu_lat: contact.mu_lat,
                        mu_long: contact.mu_long,
                        roll_factor: contact.roll_factor,
                        drive: wheel.drive,
                        brake: vehicle.brake,
                        steer_angle: vehicle.steer_angle,
                        compression_ratio: contact.compression_ratio,
                        vel_world: v3(contact.point_vel),
                        brake_dir: v3(brake_dir),
                        speed_planar: speed_t as f32,
                        yaw_rate,
                        relative_com: v3(relative_com),
                        tire_state: wheel.tire_state,
                    });

                    // ===============================================================================
                    // debug slip rays
                    // ===============================================================================
                    if contact.forward.magnitude() > 1e-4 {
                        let slip_mag = contact.v_lat.abs();
                        if slip_mag > 0.01 {
                            let slip_dir = if contact.v_lat >= 0.0 { contact.side } else { -contact.side };
                            let slip_len = (slip_mag * 0.25).clamp(0.02, 0.6);
                            let color = match contact.wheel_id.as_str() {
                                "FL" | "RL" => [0.2, 0.6, 1.0],
                                "FR" | "RR" => [1.0, 0.4, 0.2],
                                _ => [1.0, 1.0, 1.0],
                            };
                            let slip_origin = contact.hit_point + contact.ground_normal * wheel.radius * 0.25;
                            let slip_angle = 0.0;

                            if debug_slip && contact.forward.magnitude() > 1e-4 {
                                self.debug_overlay.slip_vectors.push(DebugSlipRay {
                                    origin: slip_origin.into(),
                                    direction: slip_dir.into(),
                                    slip_angle: slip_angle,
                                    magnitude: slip_len,
                                    color,
                                });
                            }
                        }
                    }

                    // ==================================================================
                    //  Shared Debug Params
                    // ==================================================================
                    let origin = pos * (wheel.offset + vector![0.0, wheel.radius + 0.02, 0.0]);
                    let dir = vector![0.0, -1.0, 0.0];
                    let ground_n = vector![0.0, 1.0, 0.0];
                    let max_dist = wheel.rest_length + wheel.max_length + wheel.radius;
                    let wheel_center = contact.hit_point + contact.ground_normal * wheel.radius;
                    
                    wheel.grounded = contact.grounded;
                    wheel.world_center = wheel_center.into();
                    wheel.world_rotation = [
                        pos.rotation.i,
                        pos.rotation.j,
                        pos.rotation.k,
                        pos.rotation.w,
                    ];
                    wheel.steer_angle = if wheel.steer { vehicle.steer_angle } else { 0.0 };
                    wheel.wheel_speed = contact.v_long / wheel.radius.max(0.001);
                    // ==========================================================
                    //  DEBUG: suspension ray (ALWAYS push)
                    // ==========================================================
                    if debug_rays {
                        self.debug_overlay.suspension_rays.push(DebugRay {
                            origin: [origin.x, origin.y, origin.z],
                            direction: dir.into(),
                            length: max_dist,
                            hit: Some(p3(contact.hit_point)),
                            color: if contact.grounded { [0.0, 1.0, 0.0] } else { [1.0, 0.0, 0.0] },
                        });
                    }

                    // ----------------------------------------------------------
                    // DEBUG: wheel numeric (ALWAYS push)
                    // ----------------------------------------------------------
                    if debug_wheels {
                        self.debug_overlay.wheels.push(DebugWheel {
                            id: wheel.debug_id.clone(),
                            center: wheel_center.into(),
                            radius: wheel.radius as f32,
                            grounded: contact.grounded,
                            compression: contact.compression,
                            normal_force: contact.normal_force,
                            steer: vehicle.steer,
                            steering: wheel.steer,
                            drive: wheel.drive,
                        });
                    }
                    // ----------------------------------------------------------
                    // DEBUG: load bar (optional but super helpful)
                    // ----------------------------------------------------------
                    let norm = (contact.normal_force / 12000.0).clamp(0.0, 1.0);
                    let bar_len = norm.sqrt() * 1.25;

                    let bar_origin = wheel_center + ground_n * 0.03;
                    let color = match wheel.debug_id.as_str() {
                        "FL" | "RL" => [0.2, 0.6, 1.0],
                        "FR" | "RR" => [1.0, 0.4, 0.2],
                        _ => [1.0, 1.0, 1.0],
                    };

                    if debug_load_bars {
                        let norm = (contact.normal_force / 12000.0).clamp(0.0, 1.0);
                        self.debug_overlay.load_bars.push(DebugRay {
                            origin: bar_origin.into(),
                            direction: ground_n.into(),
                            length: bar_len,
                            hit: Some((bar_origin + ground_n * bar_len).into()),
                            color,
                        });
                    }

                } // end contact creation
                
                if !grounded {
                    let fallback_center = pos * wheel.offset;
                    wheel.grounded = false;
                    wheel.world_center = [fallback_center.x, fallback_center.y, fallback_center.z];
                    wheel.world_rotation = [
                        pos.rotation.i,
                        pos.rotation.j,
                        pos.rotation.k,
                        pos.rotation.w,
                    ];
                    wheel.steer_angle = if wheel.steer { vehicle.steer_angle } else { 0.0 };
                    wheel.wheel_speed = 0.0;
                }

            } // end wheel iter()

            // --------------------------------------------------
            // PHASE 2 — REDISTRIBUTE (ARB)
            // --------------------------------------------------
            apply_arb_load_transfer(
                WheelId::FL, WheelId::FR,
                &mut axle_normal_force,
                &axle_compression,
                vehicle.config.arb_front,
                fz_ref,
            );

            apply_arb_load_transfer(
                WheelId::RL, WheelId::RR,
                &mut axle_normal_force,
                &axle_compression,
                vehicle.config.arb_rear,
                fz_ref,
            );

            // --------------------------------------------------
            // PHASE 3A — SUSPENSION IMPULSES (STORE ONLY)
            // --------------------------------------------------
            for (wheel_id, contact) in suspension_contacts.iter() {

                let axel_normal = axle_normal_force.get(wheel_id).copied().unwrap_or(contact.normal_force);
                let max_normal_impulse = fz_ref * 1.5 * dt; // ≈ 1.5g per wheel
                let normal_impulse_mag = (axel_normal * dt as f32).clamp(0.0, max_normal_impulse as f32);

                impulses.at_points.push((
                    contact.ground_normal * normal_impulse_mag as Real,
                    contact.apply_point,
                ));
            }

            // --------------------------------------------------
            // PHASE 3B — TIRE SOLVER
            // --------------------------------------------------
            for contact in contacts.iter_mut() {
                if let Some(nf) = axle_normal_force.get(&contact.wheel) {
                    contact.normal_force = *nf;
                }
            }

            let ctx = SolveContext {
                dt: dt as f32,
                mass: body_mass,
                engine_force: vehicle.config.engine_force,
                brake_force: vehicle.config.brake_force,
                // abs_enabled: vehicle.config.abs_enabled,
                // tcs_enabled: vehicle.config.tcs_enabled,
                abs_enabled: vehicle.vehicle_flags.contains(VehicleStateFlags::ABS),
                tcs_enabled: vehicle.vehicle_flags.contains(VehicleStateFlags::TCS),
                abs_limit: vehicle.config.abs_nx_limit,
                tcs_limit: vehicle.config.tcs_nx_limit,
                driven_wheels: 2.0,
                base_front_bias: 0.66,
                bias_gain: 0.25,
                wheelbase: vehicle.config.wheelbase,
                mu_base: vehicle.config.mu_base,
            };

            let control = ControlInput {
                throttle: vehicle.throttle,
                brake: vehicle.brake,
                steer: vehicle.steer,
            };

            let tire_forces = solve_step(&ctx, &control, &mut contacts);
            for imp in tire_forces.impulses {
                let j: Vector<Real> = imp.impulse.into();
                match imp.at_point {
                    Some(p) => impulses.at_points.push((j, Point::from(p))),
                    None => impulses.linear.push(j),
                }
            }

            // --------------------------------------------------
            // PHASE 3C — APPLY ALL IMPULSES (ONCE)
            // --------------------------------------------------

            // Static Friction lock at low speed
            let body = self.bodies.get_mut(handle).unwrap();
            let v = body.linvel();
            let speed = (v.x * v.x + v.z * v.z).sqrt();

            let hard_brake = control.brake > 0.8;
            let near_rest  = speed < 0.4;

            if hard_brake && near_rest {
                // Kill planar velocity
                body.set_linvel(vector![0.0, v.y, 0.0], true);

                // Kill yaw
                body.set_angvel(vector![0.0, 0.0, 0.0], true);
            }

            impulses.apply(body);

        }
    }
}
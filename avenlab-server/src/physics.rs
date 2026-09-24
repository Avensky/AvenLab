// ==============================================================================
// physics.rs — WORLD STEP + VEHICLE FORCE PIPELINE (RAPIER INTEGRATION)
// ==============================================================================
// We are implementing a hybrid impulse-based tire model, best described as:
// Raycast suspension + brush tire model + impulse-domain friction ellipse
// ------------------------------------------------------------------------------
// This file owns the server-side rigid-body simulation loop and integrates a
// custom raycast-vehicle model into Rapier.
//
// Design goals:
// - Chassis collider has friction = 0.0 (no ground friction from Rapier contacts).
// - All tire forces are computed manually (impulse domain) and applied to the
//   chassis as impulses (and optional torque impulses).
// - Suspension is raycast-based: spring + damper -> normal force -> impulse.
// - Tires use a lightweight brush lateral model + longitudinal engine/brake
//   model, combined via a friction ellipse in *impulse space*.
//
// Step pipeline (high-level):
// 1) apply_vehicle_controls(dt)
//    - Converts player inputs into intent (steer smoothing / rate-limiting).
//    - Does NOT apply physics forces.
// 2) apply_suspension(dt)
//    - Phase 1 (Sense): raycast each wheel, compute compression, point velocity,
//      slip components, raw normal force, and build ContactPatch.
//    - Phase 2 (Redistribute): apply anti-roll bar load transfer (per axle),
//      updating per-wheel normal forces.
//    - Phase 3 (Act): apply suspension impulses (Jn = n * Fz * dt), then call
//      aven_tire::solve_step() to compute tire impulses (long + lat + yaw +
//      optional aligning `), then apply all impulses to the chassis.
// 3) pipeline.step(...)
//    - Rapier integrates the final velocities/poses.
// ------------------------------------------------------------------------------
// Key dependencies:
// - suspension_contact::build_suspension_contact()
// - anti_roll::apply_arb_load_transfer()
// - aven_tire::solve_step()
// ==============================================================================
// ==============================================================================

// src/physics.rs
use rapier3d::prelude::*;
use rapier3d::prelude::{InteractionGroups, Group};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use crate::aven_tire::steering::{apply_vehicle_controls, SteeringState};
use crate::vehicle_state::{Vehicle, VehicleStateFlags, Wheel, PhysicsWheelSnapshot};
use crate::vehicle_setup::config_for_vehicle;
use crate::state::InputPacket;
use crate::vehicle_debug::{DebugOverlay, DebugFlags};
use crate::world::block_colliders::{
    BlockColliderFile,
    BlockColliderWorld,
    MapSnapshot,
    load_block_collider_file,
    spawn_block_building_colliders,
};
// constants
const GROUP_GROUND: Group  = Group::from_bits_truncate(0b0001);
const GROUP_CHASSIS: Group = Group::from_bits_truncate(0b0010);

pub struct PhysicsWorld {
    pub gravity: Vector<Real>, // gravity vector
    pub pipeline: PhysicsPipeline, // physics pipeline
    pub island_manager: IslandManager, // manages islands of bodies
    pub broad_phase: DefaultBroadPhase, // broad-phase collision detection
    pub narrow_phase: NarrowPhase, // collision detection
    pub bodies: RigidBodySet, // for rigid bodies
    pub colliders: ColliderSet, // for collision shapes
    pub block_world: BlockColliderWorld, // for block-based colliders
    active_map: Option<Arc<BlockColliderFile>>, // currently active map
    pub joints: ImpulseJointSet, // for constraints
    pub multibody_joints: MultibodyJointSet,// for articulated bodies
    pub ccd: CCDSolver, // continuous collision detection
    pub query_pipeline: QueryPipeline, // for raycasting
    // pub suspension: VehicleSuspension,
    pub wheels: HashMap<RigidBodyHandle, Vec<Wheel>>, // body handle → wheels
    pub vehicles: HashMap<String, Vehicle>, // playerId → vehicle   
    pub body_to_player: HashMap<RigidBodyHandle, String>, // body handle → playerId
    pub debug_overlay: DebugOverlay,// for debug visualization
    pub debug_flags: DebugFlags,
}

impl PhysicsWorld {

    fn map_definition_path(map_id: &str) -> anyhow::Result<PathBuf> {
        if map_id.is_empty()
            || !map_id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        {
            anyhow::bail!("Invalid map id: {map_id}");
        }

        Ok(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("src")
                .join("assets")
                .join("blocks")
                .join(format!("{map_id}_colliders.json"))
        )
    }

    pub fn active_map_id(&self) -> Option<&str> {
        self.active_map
            .as_ref()
            .map(|map| map.map_id.as_str())
    }

    pub fn map_snapshot(&self) -> Option<MapSnapshot> {
        let map = self.active_map.as_ref()?;

        Some(map.snapshot(&self.block_world))
    }

    /// Load the collider set selected by the frontend before spawning a car.
    pub fn select_map(&mut self, map_id: &str) -> anyhow::Result<()> {
        // Already selected.
        if self.active_map_id() == Some(map_id) {
            self.update_loaded_blocks_around_players();
            return Ok(());
        }

        if let Some(current) = self.active_map_id() {
            if !self.vehicles.is_empty() {
                anyhow::bail!(
                    "Cannot switch physics map from '{}' to '{}' while vehicles are spawned",
                    current,
                    map_id,
                );
            }
        }

        // Load and validate the NEW map before destroying the current one.
        let path = Self::map_definition_path(map_id)?;

        println!("🗺️ Loading map definition: {}", path.display());

        let file = load_block_collider_file(
            path.to_string_lossy().to_string()
        )?;

        if file.map_id != map_id {
            anyhow::bail!(
                "Requested map '{}' but definition contains map_id '{}'",
                map_id,
                file.map_id,
            );
        }

        let requested = Arc::new(file);

        // New definition is valid. Now remove previous chunks.
        let loaded_keys: Vec<(i32, i32)> =
            self.block_world.loaded.keys().copied().collect();

        for (bx, bz) in loaded_keys {
            self.unload_block(bx, bz);
        }

        self.block_world.tile_size = Some(requested.cell);
        self.active_map = Some(requested);

        self.update_loaded_blocks_around_players();

        let chunk_count = self.block_world.loaded.len();

        println!(
            "✅ Active map '{}' loaded: cell={:?}, chunks={}",
            map_id,
            self.block_world.tile_size,
            chunk_count,
        );

        Ok(())
    }

    pub fn set_debug_flags(&mut self, flags: DebugFlags) {
        self.debug_flags = flags;
    }

    #[inline]
    fn debug_enabled(&self, flag: DebugFlags) -> bool {
        self.debug_flags.contains(flag)
    }

    pub fn wheel_snapshots_for_body(
        &self,
        body_handle: RigidBodyHandle,
        _steer_angle: f32,
    ) -> Vec<PhysicsWheelSnapshot> {
        if self.bodies.get(body_handle).is_none() {
            return Vec::new();
        }

        let Some(wheels) = self.wheels.get(&body_handle) else {
            return Vec::new();
        };
        wheels
            .iter()
            .map(|w| {
                let id = match w.debug_id.as_str() {
                    "FL" => "fl",
                    "FR" => "fr",
                    "RL" => "rl",
                    "RR" => "rr",
                    other => other,
                };

                PhysicsWheelSnapshot {
                    id: id.to_string(),
                    position: w.world_center,
                    rotation: w.world_rotation,
                    radius: w.radius,
                    wheel_speed: w.wheel_speed,
                    steer_angle: w.steer_angle,
                    grounded: w.grounded,
                }
            })
            .collect()
    }

    #[inline]
    fn world_to_block(x: f32, z: f32, tile: [f32; 2]) -> (i32, i32) {
        let bx = (x / tile[0]).floor() as i32;
        let by = (z / tile[1]).floor() as i32;
        (bx, by)
    }

    pub fn update_loaded_blocks_around_players(&mut self) {
        let wanted = match self.active_map.as_ref() {
            Some(map) => map.initial_chunks(),
            None => return,
        };

        let loaded_keys: Vec<(i32, i32)> =
            self.block_world.loaded.keys().copied().collect();

        for key in loaded_keys {
            if !wanted.contains(&key) {
                self.unload_block(key.0, key.1);
            }
        }

        for (bx, bz) in wanted {
            if let Err(error) = self.load_block(bx, bz) {
                eprintln!(
                    "⚠️ Failed to load map chunk ({bx},{bz}): {error}"
                );
            }
        }
    }

    pub fn load_block(
        &mut self,
        bx: i32,
        bz: i32,
    ) -> anyhow::Result<()> {
        if self.block_world.loaded.contains_key(&(bx, bz)) {
            return Ok(());
        }

        let file = self.active_map
            .as_ref()
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("No active map selected"))?;

        self.block_world.tile_size = Some(file.cell);

        let groups = InteractionGroups::new(
            GROUP_GROUND,
            GROUP_CHASSIS,
        );

        let (handles, boxes) = spawn_block_building_colliders(
            &mut self.bodies,
            &mut self.colliders,
            file.as_ref(),
            bx,
            bz,
            groups,
        );

        self.block_world.loaded.insert((bx, bz), handles);
        self.block_world.debug_boxes.insert((bx, bz), boxes);

        println!(
            "🧱 Loaded map '{}' chunk ({},{})",
            file.map_id,
            bx,
            bz,
        );

        Ok(())
    }

    pub fn unload_block(&mut self, bx: i32, by: i32) {
        self.block_world.unload(
            &mut self.bodies,
            &mut self.colliders,
            &mut self.island_manager,
            &mut self.joints,
            &mut self.multibody_joints,
            bx,
            by,
        );
    }

    fn populate_block_debug(&mut self) {
        // Copy loaded AABB boxes into the overlay each frame
        self.debug_overlay.block_boxes = self.debug_block_boxes();
    }

    pub fn debug_block_boxes(&self) -> Vec<crate::world::block_colliders::DebugAabbBox> {
        self.block_world
            .debug_boxes
            .values()
            .flat_map(|v| v.iter().cloned())
            .collect()
    }


    pub fn despawn_vehicle_for_player(&mut self, player_id: &str) {
        let Some(vehicle) = self.vehicles.remove(player_id) else {
            return;
        };

        let body_handle = vehicle.body;

        self.wheels.remove(&body_handle);
        self.body_to_player.remove(&body_handle);

        self.bodies.remove(
            body_handle,
            &mut self.island_manager,
            &mut self.colliders,
            &mut self.joints,
            &mut self.multibody_joints,
            true, // remove attached colliders
        );

        println!("🧹 Physics vehicle removed for {}", player_id);
    }

    pub fn debug_snapshot(&self) -> DebugOverlay { self.debug_overlay.clone()}

    pub fn new() -> Self {
        let gravity = vector![0.0, -9.81, 0.0];

        let bodies = RigidBodySet::new();
        let colliders = ColliderSet::new();

        // No global fallback floor. A map is selected before any vehicle is
        // spawned, and that map owns its road/building colliders. Keeping a
        // second floor at y=0 would overlap the normalized road collider and
        // create duplicate contacts/jitter.

        Self {
            gravity,
            pipeline: PhysicsPipeline::new(),
            island_manager: IslandManager::new(),
            broad_phase: DefaultBroadPhase::new(),
            narrow_phase: NarrowPhase::new(),
            bodies,
            colliders,
            block_world: BlockColliderWorld::new(),
            active_map: None,
            joints: ImpulseJointSet::new(),
            multibody_joints: MultibodyJointSet::new(),
            ccd: CCDSolver::new(),
            query_pipeline: QueryPipeline::new(),
            wheels:  HashMap::new(),
            vehicles: HashMap::new(),
            body_to_player: HashMap::new(),
            debug_overlay: DebugOverlay {
                chassis: Vec::new(),
                arb_links: Vec::new(),
                suspension_rays: Vec::new(),
                load_bars: Vec::new(),
                wheels: Vec::new(),
                chassis_right: [1.0, 0.0, 0.0], // default
                slip_vectors: Vec::new(),
                block_boxes: Vec::new(),
            },
            debug_flags: DebugFlags::NONE,
        }
    }
    
    // ===========================================================================
    // Attach input to a player's vehicle (just stores it; actual forces are
    // applied in `step`).
    // ===========================================================================
    pub fn apply_player_input_packet(
        &mut self,
        player_id: &str,
        packet: InputPacket,
    ) {
        if let Some(v) = self.vehicles.get_mut(player_id) {

            // analog
            v.throttle = packet.throttle.clamp(-1.0, 1.0);
            v.steer    = packet.steer.clamp(-1.0, 1.0);
            v.brake    = packet.brake.clamp(0.0, 1.0);

            // digital states
            v.vehicle_flags = VehicleStateFlags::from_bits_truncate(packet.vehicleMask);
            v.player_flags  = packet.playerMask;
        }
    }


    // ============================================================================
    // Spawn a simple "car" for this player:
    // - Dynamic rigid body with a box collider.
    // - Positioned slightly above the ground so it can fall and settle.
    // ============================================================================
    pub fn spawn_vehicle_for_player(
        &mut self,
        id: String,
        position: [f32; 3],
        vehicle_id: &str,
    ) -> Result<RigidBodyHandle, String> {
        let config = config_for_vehicle(vehicle_id).ok_or_else(|| {
            format!("Unknown vehicle id '{vehicle_id}'")
        })?;
        let [hx, hy, hz] = config.chassis_half_extents;
        let [_cx, cy, _cz] = config.chassis_com_offset;

        let (spawn_x, spawn_z, road_surface_y) = {
            let map = self.active_map
                .as_ref()
                .ok_or_else(|| "No map selected".to_string())?;

            let selected = map.spawn_points
                .iter()
                .copied()
                .find(|candidate| {
                    let candidate_x = candidate[0];
                    let candidate_z = candidate[1];

                    self.vehicles.values().all(|vehicle| {
                        self.bodies
                            .get(vehicle.body)
                            .map(|body| {
                                let p = body.translation();

                                let dx = p.x - candidate_x;
                                let dz = p.z - candidate_z;

                                dx * dx + dz * dz > 36.0
                            })
                            .unwrap_or(true)
                    })
                })
                .unwrap_or([position[0], position[2]]);

            (
                selected[0],
                selected[1],
                map.surface.road_y,
            )
        };

        // Start fully above the backend y=0 road surface.
        let spawn_y = road_surface_y + hy -cy + 0.15;
        let volume = (hx * 2.0) * (hy * 2.0) * (hz * 2.0);  // box size
        let density = config.mass / volume;                 // ρ = m / V

        // Rigid body
        let rb = RigidBodyBuilder::dynamic()
            .translation(vector![spawn_x, spawn_y, spawn_z])
            .linear_damping(config.linear_damping)
            .angular_damping(config.angular_damping)
            .ccd_enabled(true)
            .build();
        
        // Box collider
        let [hx, hy, hz] = config.chassis_half_extents;
        let [cx, cy, cz] = config.chassis_com_offset;

        let collider = ColliderBuilder::cuboid(hx, hy, hz)
            .translation(vector![cx, cy, cz]) // COM offset
            .collision_groups(InteractionGroups::new(
                GROUP_CHASSIS,
                GROUP_GROUND,
            ))
            .active_events(ActiveEvents::empty())
            .density(density)
            .friction(0.0) // IMPORTANT
            .restitution(0.0)
            .build();

        let handle = self.bodies.insert(rb); // insert rigid body
        
        self.colliders.insert_with_parent(collider, handle, &mut self.bodies); // attach to body
        self.body_to_player.insert(handle, id.clone()); // map body to player ID  
        self.register_vehicle(handle, config); // setup wheels
        
        self.vehicles.insert(
            id.clone(),
            Vehicle {
                body: handle,
                config,
                throttle: 0.0,
                steer: 0.0,
                brake: 0.0,
                pitch: 0.0,
                yaw: 0.0,
                roll: 0.0,
                ascend: 0.0,
                steer_angle: 0.0,
                steer_rate: 0.0,
                steering: SteeringState::default(),
                rack_torque: 0.0,
                rack_torque_filtered: 0.0,
                vehicle_flags: VehicleStateFlags::ENGINE_ON
                                | VehicleStateFlags::ABS
                                | VehicleStateFlags::TCS,
                player_flags: 0,
                rpm: 0.0,
                gear: 0,
                fuel: 0.0,
                engine_temp: 0.0,
                engine_torque: 0.0,
            },
        );

        println!(
            "🚗 Spawned vehicle {} for player {} at {:?} (body = {:?})",
            vehicle_id, id, [spawn_x, spawn_y, spawn_z], handle
        );

        Ok(handle)
    }    
    
    pub fn step(&mut self, dt: Real) {

        // prevent ui clutter
        self.debug_overlay.clear();
        
        // Convert inputs → intent (NO PHYSICS)
        apply_vehicle_controls(self.vehicles.values_mut(), dt);
        
        // Apply suspension + traction + tire forces
        self.apply_vehicle_forces(dt);
        
        // Step physics
        let hooks = ();
        let mut events = ();
        self.pipeline.step(
            &self.gravity,
            &IntegrationParameters {
                dt,
                ..IntegrationParameters::default()
            },
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.bodies,
            &mut self.colliders,
            &mut self.joints,
            &mut self.multibody_joints,
            &mut self.ccd,
            Some(&mut self.query_pipeline),
            &mut events,
            &hooks,
        );


        // streaming step
        self.update_loaded_blocks_around_players();

        // NOW repopulate debug overlay with the up-to-date loaded boxes
        self.populate_block_debug();    

        // Safety: prevent bodies from exploding to insane coordinates
        for (_, body) in self.bodies.iter_mut() {
            let mut pos = *body.translation();

            // let bad =
            //     !pos.x.is_finite() 
            //     || !pos.y.is_finite() 
            //     || !pos.z.is_finite() 
            //     || pos.x.abs() > 1_000.0 
            //     || pos.y.abs() > 1_000.0 
            //     || pos.z.abs() > 1_000.0;

            let bad =
                !pos.x.is_finite()
                || !pos.y.is_finite()
                || !pos.z.is_finite()
                || pos.y.abs() > 10_000.0;

            if bad {
                // Reset this body to a safe position above the heightfield
                pos = vector![0.0, 5.0, 0.0];
                body.set_translation(pos, true);
                body.set_linvel(vector![0.0, 0.0, 0.0], true);
                body.set_angvel(vector![0.0, 0.0, 0.0], true);

                println!("⚠️ Reset exploding body back to {:?}", pos);
            }
        }
    }
}

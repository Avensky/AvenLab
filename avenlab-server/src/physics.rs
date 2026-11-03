// Backend simulation ownership:
// * main: holds latest controls and requests one fixed 60 Hz outer tick.
// * step: clears debug scratch, maintains map/query data, runs 120 Hz substeps,
//   then samples final wheel/chassis poses once and builds the final overlay.
// * step_substep: vehicle_forces senses contacts, transfers ARB load, solves
//   tire impulses and applies each once; Rapier then integrates the rigid body.
// Collision normals remain Rapier's job. Ray springs supply wheel support;
// the chassis must not normally rest on the road. Tire grip is custom only.
// A second floor, turn torque, steering smoother or post-step force would
// duplicate an existing owner. See AUDIT.md for units and inactive strategies.

// src/physics.rs
use rapier3d::prelude::*;
use rapier3d::prelude::{InteractionGroups, Group};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use crate::aven_tire::steering::SteeringState;
use crate::vehicle_state::{Vehicle, VehicleStateFlags, Wheel, PhysicsWheelSnapshot};
use crate::powertrain::Powertrain;
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
// One timing definition is shared by the wall timer, physics and snapshot metadata.
pub const SIMULATION_HZ: f64 = 60.0;
pub const SIMULATION_DT: Real = (1.0 / SIMULATION_HZ) as Real;
const MAX_PHYSICS_SUBSTEP: Real = 1.0 / 120.0;
const MAX_PHYSICS_SUBSTEPS: usize = 8;

pub struct PhysicsWorld {
    barrier_impacts:HashMap<(RigidBodyHandle,RigidBodyHandle),f32>,
    pub asset_health: HashMap<String,f32>,
    pub combat_poses: HashMap<String,crate::state::CombatPose>,
    tank_colliders: HashMap<String,(ColliderHandle,ColliderHandle)>,
    combat_sequences: HashMap<String,(u32,std::time::Instant)>,
    combat_cooldowns: HashMap<String,f32>,
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
    pub wheels: HashMap<RigidBodyHandle, Vec<Wheel>>, // body handle → wheels
    pub vehicles: HashMap<String, Vehicle>, // playerId → vehicle
    pub body_to_player: HashMap<RigidBodyHandle, String>, // body handle → playerId
    pub debug_overlay: DebugOverlay,// for debug visualization
    pub debug_flags: DebugFlags,
    spawn_poses: HashMap<String, (Isometry<Real>, Real)>,
    falling_seconds: HashMap<String, Real>,
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

    /// Fresh isolated editor physics, constructed before replacing its old runtime.
    pub fn from_editor_document(file: crate::world::block_colliders::BlockColliderFile) -> anyhow::Result<Self> {
        let file=crate::world::block_colliders::validate_block_collider_file(file)?;
        let mut world=Self::new();world.block_world.tile_size=Some(file.cell);world.active_map=Some(Arc::new(file));world.update_loaded_blocks_around_players();Ok(world)
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
        self.barrier_impacts.clear();self.asset_health.clear(); self.combat_cooldowns.clear(); self.combat_sequences.clear(); self.combat_poses.clear(); self.tank_colliders.clear();
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
                    "FL" => "fr",
                    "FR" => "fl",
                    "RL" => "rr",
                    "RR" => "rl",
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
        if self.debug_flags.contains(DebugFlags::BLOCKS) {
            self.debug_overlay.block_boxes = self.debug_block_boxes();
        } else {
            self.debug_overlay.block_boxes.clear();
        }
    }

    pub fn debug_block_boxes(&self) -> Vec<crate::world::block_colliders::DebugAabbBox> {
        self.block_world
            .debug_boxes
            .values()
            .flat_map(|v| v.iter().cloned())
            .collect()
    }


    /// Rebind an authenticated practice lease without recreating its Rapier body.
    pub fn reassign_player(&mut self,old:&str,new:&str)->bool {
        let Some(mut vehicle)=self.vehicles.remove(old) else{return false};
        vehicle.throttle=0.0;vehicle.steer=0.0;vehicle.brake=0.0;vehicle.handbrake=0.0;
        self.body_to_player.insert(vehicle.body,new.into());self.vehicles.insert(new.into(),vehicle);
        if let Some(v)=self.combat_poses.remove(old){self.combat_poses.insert(new.into(),v);}
        if let Some(v)=self.tank_colliders.remove(old){self.tank_colliders.insert(new.into(),v);}
        if let Some(v)=self.combat_cooldowns.remove(old){self.combat_cooldowns.insert(new.into(),v);}
        if let Some(v)=self.spawn_poses.remove(old){self.spawn_poses.insert(new.into(),v);}
        if let Some(v)=self.falling_seconds.remove(old){self.falling_seconds.insert(new.into(),v);}
        self.combat_sequences.remove(old);true
    }

    pub fn despawn_vehicle_for_player(&mut self, player_id: &str) {
        self.spawn_poses.remove(player_id); self.falling_seconds.remove(player_id);
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
            combat_poses: HashMap::new(),tank_colliders: HashMap::new(),
            barrier_impacts:HashMap::new(),asset_health: HashMap::new(), combat_sequences: HashMap::new(), combat_cooldowns: HashMap::new(),
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
            spawn_poses: HashMap::new(), falling_seconds: HashMap::new(),
        }
    }

    /// Server-owned turret state, firing cadence and direct-hit structure damage.
    pub fn combat_tick(&mut self, player: &str, seq:u32, intent: Option<&crate::state::CombatPose>) {
        let Some(vehicle)=self.vehicles.get(player) else {return;};
        let body_handle=vehicle.body;let config=vehicle.config;
        let Some(body)=self.bodies.get(body_handle) else {return;};
        let hull=*body.position();
        let forward=hull.rotation*Vector::z();let hull_yaw=forward.x.atan2(forward.z);
        let entry=self.combat_sequences.entry(player.to_owned()).or_insert((seq,std::time::Instant::now()));
        if entry.0!=seq {*entry=(seq,std::time::Instant::now());}
        let fresh=entry.1.elapsed().as_millis()<=250;
        let target=intent.map(|c|c.bounded()).unwrap_or_default();
        if let Some(vehicle)=self.vehicles.get_mut(player){
            vehicle.ram.requested=target.ram&&fresh&&target.enabled;
            if !fresh||!target.enabled{vehicle.ram.cancel();}
        }
        let mut c=self.combat_poses.get(player).cloned().unwrap_or_else(||crate::state::CombatPose{yaw:hull_yaw+std::f32::consts::PI,ammo:1,..Default::default()});
        let locking = config.tracked && target.hull_locked && !c.hull_locked;
        if locking {
            let current = vector![-c.yaw.sin()*c.pitch.cos(), c.pitch.sin(), -c.yaw.cos()*c.pitch.cos()];
            let local = hull.rotation.inverse()*current;
            c.lock_yaw = local.x.atan2(local.z);
            c.lock_pitch = local.y.atan2((local.x*local.x+local.z*local.z).sqrt()).clamp(-0.174533,0.349066);
        }
        c.hull_locked=config.tracked&&target.hull_locked;
        c.enabled=target.enabled&&fresh&&self.vehicles.get(player).is_some_and(|v|v.ram.stun_remaining<=0.0);c.fire=target.fire&&c.enabled;c.ram=target.ram&&c.enabled;
        if c.enabled && !c.hull_locked {
            let delta=(target.yaw-c.yaw).sin().atan2((target.yaw-c.yaw).cos());
            let rate=if config.tracked {2.6}else{3.0};
            c.yaw+=delta.clamp(-rate*SIMULATION_DT,rate*SIMULATION_DT);
            c.pitch+=(target.pitch-c.pitch).clamp(-0.8*SIMULATION_DT,0.8*SIMULATION_DT);
        }
        c.yaw=c.yaw.sin().atan2(c.yaw.cos());
        c.role=if config.tracked {"tank".into()}else{target.role.clone()};
        let mut direction=vector![-c.yaw.sin()*c.pitch.cos(),c.pitch.sin(),-c.yaw.cos()*c.pitch.cos()];
        if config.tracked {
            let local=hull.rotation.inverse()*direction;
            let yaw=if c.hull_locked {c.lock_yaw}else{local.x.atan2(local.z)};
            let elevation=if c.hull_locked {c.lock_pitch}else{local.y.atan2((local.x*local.x+local.z*local.z).sqrt()).clamp(-0.174533,0.349066)};
            direction=hull.rotation*vector![yaw.sin()*elevation.cos(),elevation.sin(),yaw.cos()*elevation.cos()];
            c.yaw=(-direction.x).atan2(-direction.z);c.pitch=direction.y.clamp(-1.0,1.0).asin();
            c.x=0.0;c.y=config.nominal_wheel_center_y()-config.wheel_radius-0.0130596+1.65;c.z=1.05;
            self.update_tank_collision(player,body_handle,&hull,yaw,elevation,config.nominal_wheel_center_y()-config.wheel_radius-0.0130596);
        }else{c.x=target.x;c.y=target.y;c.z=target.z;}
        c.weapon=if config.tracked {target.weapon.clone()}else{"primary".into()};
        let cannon=config.tracked && c.weapon!="coax";
        // Both timers advance while holstered: switching never resets a reload.
        for key in [player.to_owned(),format!("{player}:coax")] {
            if let Some(t)=self.combat_cooldowns.get_mut(&key){*t=(*t-SIMULATION_DT).max(0.0);}
        }
        let key=if config.tracked && !cannon {format!("{player}:coax")}else{player.to_owned()};
        let cooldown=self.combat_cooldowns.entry(key).or_insert(0.0);
        let shoot=c.fire&&*cooldown<=0.0;
        if shoot {*cooldown=if cannon {3.0}else if c.role=="medic" {0.6}else{0.1};c.shot=c.shot.wrapping_add(1);if cannon {c.cannon_shot=c.cannon_shot.wrapping_add(1);}}
        c.reload=*cooldown;c.ammo=if cannon {u8::from(*cooldown<=0.0)}else{255};
        c.cannon_reload=*self.combat_cooldowns.get(player).unwrap_or(&0.0);
        c.coax_reload=*self.combat_cooldowns.get(&format!("{player}:coax")).unwrap_or(&0.0);
        let breech=hull.transform_point(&point![c.x,c.y,c.z]);
        let origin=breech+if config.tracked {direction*4.1}else{Vector::zeros()};
        self.combat_poses.insert(player.to_owned(),c);
        if !shoot {return;}
        if cannon {if let Some(body)=self.bodies.get_mut(body_handle){body.apply_impulse_at_point(-direction*36000.0,origin,true);}}
        self.query_pipeline.update(&self.colliders);
        let obstruction=if config.tracked {self.query_pipeline.cast_ray(&self.bodies,&self.colliders,&Ray::new(breech,direction),4.1,true,QueryFilter::default().exclude_rigid_body(body_handle)).map(|(h,d)|(h,breech+direction*d,0.0))}else{None};
        let hit=if obstruction.is_some(){obstruction}else if cannon {
            crate::ballistics::trace(origin,direction,body_handle,&self.bodies,&self.colliders,&self.query_pipeline)
        }else{
            self.query_pipeline.cast_ray(&self.bodies,&self.colliders,&Ray::new(origin,direction),if config.tracked {800.0}else{200.0},true,QueryFilter::default().exclude_rigid_body(body_handle))
                .map(|(h,d)|(h,origin+direction*d,0.0))
        };
        if let Some(c)=self.combat_poses.get_mut(player){c.impact=hit.map(|(_,p,_)|[p.x,p.y,p.z]);c.impact_time=hit.map(|(_,_,t)|t).unwrap_or(crate::ballistics::MAX_TIME);}
        let Some((handle,impact,_))=hit else {return;};
        let Some(parent)=self.colliders[handle].parent() else {return;};
        if cannon && self.bodies[parent].is_dynamic(){
            let mass=self.bodies[parent].mass();
            self.bodies[parent].apply_impulse_at_point(direction*(mass*2.8).min(80000.0),impact,true);
        }
        let index=self.bodies[parent].user_data as usize;if index==0{return;}
        let Some(layout)=self.active_map.as_ref().and_then(|m|m.authored_layout.as_ref()).filter(|l|!l.repeat) else{return;};
        let Some(object)=layout.objects.get(index-1) else{return;};
        if ["coastal-land","coastal-land-bridge"].contains(&object.piece.as_str()){return;}
        let Some(d)=object.destruction.as_ref().filter(|d|d.enabled) else{return;};
        let multiplier=if cannon {d.cannon}else{d.small_arms};
        let hp=self.asset_health.entry(object.id.clone()).or_insert(d.hp);
        *hp=(*hp-if cannon {300.0*multiplier}else{20.0*multiplier}).max(0.0);
        if *hp==0.0 {for h in self.bodies[parent].colliders().to_vec(){if let Some(c)=self.colliders.get_mut(h){c.set_enabled(false);}}self.query_pipeline.update(&self.colliders);}
    }
    fn update_tank_collision(&mut self,player:&str,body:RigidBodyHandle,_hull:&Isometry<Real>,yaw:f32,elevation:f32,visual_y:f32){
        let existing=self.tank_colliders.get(player).copied().filter(|(a,b)|self.colliders.contains(*a)&&self.colliders.contains(*b));
        let (turret,barrel)=existing.unwrap_or_else(||{
            let groups=self.bodies[body].colliders().first().map(|h|self.colliders[*h].collision_groups()).unwrap_or(InteractionGroups::all());
            let a=self.colliders.insert_with_parent(ColliderBuilder::cuboid(1.05,0.45,1.1).density(0.0).collision_groups(groups).build(),body,&mut self.bodies);
            // Query sensor: hittable barrel without snagging narrow bridges or levering the hull.
            let b=self.colliders.insert_with_parent(ColliderBuilder::cuboid(0.13,0.13,2.0).density(0.0).sensor(true).collision_groups(groups).build(),body,&mut self.bodies);
            self.tank_colliders.insert(player.to_owned(),(a,b));(a,b)
        });
        let yaw_q=Rotation::from_axis_angle(&Vector::y_axis(),yaw);
        self.colliders[turret].set_position_wrt_parent(Isometry::from_parts(Translation::from(vector![0.0,visual_y+1.75,0.10]),yaw_q));
        let gun_q=yaw_q*Rotation::from_axis_angle(&Vector::x_axis(),-elevation);
        let pivot=vector![0.0,visual_y+1.30,0.10]+yaw_q*vector![0.0,0.35,0.95];
        self.colliders[barrel].set_position_wrt_parent(Isometry::from_parts(Translation::from(pivot+gun_q*vector![0.0,0.0,2.0]),gun_q));
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
        let mut recover = false;
        if let Some(v) = self.vehicles.get_mut(player_id) {

            // analog
            v.throttle = packet.throttle.clamp(-1.0, 1.0);
            v.steer    = packet.steer.clamp(-1.0, 1.0);
            v.brake    = packet.brake.clamp(0.0, 1.0);
            v.handbrake = packet.handbrake.clamp(0.0, 1.0);
            let speed = self.bodies.get(v.body).map(|body| (body.rotation().inverse() * body.linvel()).z).unwrap_or(0.0);
            v.cockpit.receive_with_parking(packet.cockpit_mask, packet.parking_brake, speed, packet.vehicleMask & VehicleStateFlags::TCS.bits() != 0);
            v.cockpit.receive_cabin(packet.cabin_mask);
            if let Some(gear)=v.cockpit.take_forward_shift() { v.powertrain.request_forward_gear(gear); }

            // digital states
            v.vehicle_flags = VehicleStateFlags::from_bits_truncate(packet.vehicleMask);
            v.powertrain.engine_requested = v.cockpit.engine_request(v.vehicle_flags.contains(VehicleStateFlags::ENGINE_ON),v.powertrain.running);
            v.powertrain.boost_requested = v.vehicle_flags.contains(VehicleStateFlags::BOOST);
            recover = packet.playerMask & (1 << 5) != 0 && v.player_flags & (1 << 5) == 0;
            v.player_flags  = packet.playerMask;
        }
        if recover { let _ = self.recover_vehicle_for_player(player_id); }
    }

    /// Recovery returns a car to its recorded map spawn without repairing, cooling,
    /// refilling or changing ownership. A held Reset input triggers only once.
    pub fn recover_vehicle_for_player(&mut self, player_id: &str) -> Result<(), String> {
        let vehicle = self.vehicles.get(player_id).ok_or("Spawn a vehicle first")?;
        let handle = vehicle.body;
        let config = vehicle.config;
        let body = self.bodies.get(handle).ok_or("Vehicle body unavailable")?;
        let (mut pose, road) = self.spawn_poses.get(player_id).copied()
            .unwrap_or((*body.position(), self.active_map.as_ref().map(|map| map.surface.road_y).unwrap_or(0.0)));
        pose.translation.y = config.nominal_chassis_y(road)
            .max(road + config.chassis_half_extents[1] - config.chassis_com_offset[1] + 0.05);
        let [hx, hy, hz] = config.chassis_half_extents;
        let [cx, cy, cz] = config.chassis_com_offset;
        let shape = SharedShape::cuboid(hx, hy, hz);
        self.query_pipeline.update(&self.colliders);
        if self.query_pipeline.intersection_with_shape(&self.bodies, &self.colliders,
            &(pose * Isometry::translation(cx, cy, cz)), &*shape,
            QueryFilter::default().exclude_rigid_body(handle)).is_some() {
            return Err("Spawn is occupied. Wait for the area to clear and reset again.".into());
        }
        let body = self.bodies.get_mut(handle).unwrap();
        body.set_position(pose, true); body.set_linvel(Vector::zeros(), true);
        body.set_angvel(Vector::zeros(), true); body.reset_forces(true); body.reset_torques(true);
        self.bodies.propagate_modified_body_positions_to_colliders(&mut self.colliders);
        self.query_pipeline.update(&self.colliders);
        if let Some(v)=self.vehicles.get_mut(player_id){v.ram.cancel();}
        Ok(())
    }


    // ============================================================================
    // Spawn a simple "car" for this player:
    // - Dynamic rigid body with a box collider.
    // - Starts near static sag above the map road, with a chassis clearance guard.
    // ============================================================================
    pub fn spawn_vehicle_for_player(
        &mut self,
        id: String,
        _position: [f32; 3],
        vehicle_id: &str,
        team: &str,
    ) -> Result<RigidBodyHandle, String> {
        let config = config_for_vehicle(vehicle_id).ok_or_else(|| {
            format!("Unknown vehicle id '{vehicle_id}'")
        })?;
        let [hx, hy, hz] = config.chassis_half_extents;
        let [_cx, cy, _cz] = config.chassis_com_offset;

        let (spawn_x, spawn_z, spawn_yaw, road_surface_y) = {
            let map = self.active_map
                .as_ref()
                .ok_or_else(|| "No map selected".to_string())?;

            let spawns = match team {
                "red" => &map.team_spawns.red,
                "blue" => &map.team_spawns.blue,
                other => {
                    return Err(format!("Unknown team '{other}'"));
                }
            };

            if spawns.is_empty() {
                return Err(format!(
                    "Map '{}' has no spawn points configured for team '{}'",
                    map.map_id,
                    team,
                ));
            }

            let spawn = spawns
                .iter()
                .find(|spawn| {
                    let candidate_x =
                        spawn.chunk[0] as f32 * map.cell[0]
                        + spawn.local[0];

                    let candidate_z =
                        spawn.chunk[1] as f32 * map.cell[1]
                        + spawn.local[1];

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
                .ok_or_else(|| {
                    format!(
                        "No free spawn point available for team '{}' on map '{}'",
                        team,
                        map.map_id,
                    )
                })?;

            let spawn_x =
                spawn.chunk[0] as f32 * map.cell[0]
                + spawn.local[0];

            let spawn_z =
                spawn.chunk[1] as f32 * map.cell[1]
                + spawn.local[1];

            (
                spawn_x,
                spawn_z,
                spawn.yaw,
                spawn.surface_y.unwrap_or(map.surface.road_y),
            )
        };

        // The road top is map.surface.road_y (0.32 m for this city), not y=0.
        // wheel_y locates the mount below the body origin. Subtract it exactly
        // once when solving body height; omitting it starts the springs bottomed
        // out and launches the chassis toward the actual equilibrium height.
        let suspension_spawn_y = config.nominal_chassis_y(road_surface_y);
        // The translated collider bottom is body_y + cy - hy. Keep it clear of
        // the road at creation without adding a second suspension/visual offset.
        let minimum_chassis_y =
            road_surface_y
            + hy
            - cy
            + 0.05;

        let spawn_y =
            suspension_spawn_y.max(minimum_chassis_y);

        self.spawn_poses.insert(id.to_string(), (Isometry::new(vector![spawn_x, spawn_y, spawn_z], vector![0.0, spawn_yaw, 0.0]), road_surface_y));
        // Rigid body
        let rb = RigidBodyBuilder::dynamic()
            .translation(vector![spawn_x, spawn_y, spawn_z])
            .rotation(vector![0.0, spawn_yaw, 0.0])
            .linear_damping(config.linear_damping)
            .angular_damping(config.angular_damping)
            .additional_mass_properties(config.mass_properties())
            .ccd_enabled(true)
            .build();

        // Box collider
        let [cx, cy, cz] = config.chassis_com_offset;

        let collider = ColliderBuilder::cuboid(hx, hy, hz)
            .translation(vector![cx, cy, cz])
            .collision_groups(InteractionGroups::new(
                GROUP_CHASSIS,
                GROUP_GROUND | GROUP_CHASSIS,
            ))
            .active_events(ActiveEvents::empty())
            // The body above owns mass/COM/inertia. A second density-derived
            // mass here would raise the COM again and double the vehicle mass.
            .density(0.0)
            // Average(0, road friction 1.2) is still 0.6. Min wins over the
            // map's default Average rule, making chassis contacts frictionless.
            // Rapier owns collision normals; the custom tire solver owns grip.
            .friction(0.0)
            .friction_combine_rule(CoefficientCombineRule::Min)
            .restitution(0.0)
            .build();

        let handle = self.bodies.insert(rb); // insert rigid body

        self.colliders.insert_with_parent(collider, handle, &mut self.bodies); // attach to body
        // Custom suspension runs before Rapier's next step. Make mass/COM valid
        // now instead of giving that first force solve zero reference load.
        self.bodies[handle].recompute_mass_properties_from_colliders(&self.colliders);
        self.body_to_player.insert(handle, id.clone()); // map body to player ID
        self.register_vehicle(handle, config); // setup wheels

        self.vehicles.insert(
            id.clone(),
            Vehicle {
                ram:crate::ram::RamState::default(),team:team.into(),
                body: handle,
                config,
                throttle: 0.0,
                steer: 0.0,
                brake: 0.0,
                handbrake: 0.0,
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
                powertrain: Powertrain::new(config.resources),
                cockpit: crate::cockpit::Cockpit::default(),
            },
        );

        println!(
            "🚗 Spawned vehicle {} for player {} at {:?} (body = {:?})",
            vehicle_id, id, [spawn_x, spawn_y, spawn_z], handle
        );

        Ok(handle)
    }

    /// Change this player's vehicle in place. Keep the existing body/session,
    /// but rebuild its collider, mass properties and wheel/suspension state.
    pub fn change_vehicle_for_player(&mut self, player_id: &str, vehicle_id: &str) -> Result<(), String> {
        let config = config_for_vehicle(vehicle_id)
            .ok_or_else(|| format!("Unknown vehicle id '{vehicle_id}'"))?;
        if self.vehicles.get(player_id).and_then(|v|self.bodies.get(v.body)).is_some_and(|b| b.translation().y < self.active_map.as_ref().map(|m|m.surface.road_y).unwrap_or(0.0)-20.0) {
            self.recover_vehicle_for_player(player_id)?;
        }
        self.configure_vehicle_for_player(player_id, config)
    }

    /// Editor tuning uses the same validated body/wheel rebuild as model swaps.
    pub fn configure_vehicle_for_player(&mut self, player_id: &str, config: crate::vehicle_state::VehicleConfig) -> Result<(), String> {
        let current = self.vehicles.get(player_id)
            .ok_or_else(|| "Spawn a vehicle before changing cars".to_string())?;
        let previous = current.config;
        let handle = current.body;
        let body = self.bodies.get(handle)
            .ok_or_else(|| "The current vehicle body is unavailable".to_string())?;
        let collider_handle = *body.colliders().first()
            .ok_or_else(|| "The current vehicle collider is unavailable".to_string())?;
        if !self.colliders.contains(collider_handle) {
            return Err("The current vehicle collider is unavailable".to_string());
        }

        // Preserve location and orientation. Only the geometry-derived ride
        // height changes, so a larger/smaller vehicle retains road clearance.
        let height = |c: crate::vehicle_state::VehicleConfig| {
            c.nominal_chassis_y(0.0)
                .max(c.chassis_half_extents[1] - c.chassis_com_offset[1] + 0.05)
        };
        let mut pose = *body.position();
        pose.translation.y += height(config) - height(previous);
        let [hx, hy, hz] = config.chassis_half_extents;
        let [cx, cy, cz] = config.chassis_com_offset;
        let shape = SharedShape::cuboid(hx, hy, hz);
        let collider_pose = pose * Isometry::translation(cx, cy, cz);
        self.query_pipeline.update(&self.colliders);
        if self.query_pipeline.intersection_with_shape(
            &self.bodies, &self.colliders, &collider_pose, &*shape,
            QueryFilter::default().exclude_rigid_body(handle),
        ).is_some() {
            return Err("Not enough room for this vehicle. Move to an open area and try again.".to_string());
        }

        // All fallible validation is above: a rejected request leaves the old
        // vehicle intact. Reusing the handle also keeps ownership/team stable.
        let collider = self.colliders.get_mut(collider_handle).unwrap();
        collider.set_shape(shape);
        collider.set_translation_wrt_parent(vector![cx, cy, cz]);
        let body = self.bodies.get_mut(handle).unwrap();
        body.set_position(pose, true);
        body.set_linear_damping(config.linear_damping);
        body.set_angular_damping(config.angular_damping);
        body.set_additional_mass_properties(config.mass_properties(), true);
        body.recompute_mass_properties_from_colliders(&self.colliders);
        body.set_linvel(Vector::zeros(), true);
        body.set_angvel(Vector::zeros(), true);
        body.reset_forces(true);
        body.reset_torques(true);

        let vehicle = self.vehicles.get_mut(player_id).unwrap();
        vehicle.powertrain.reconfigure(previous.resources, config.resources);
        vehicle.ram.cancel();
        vehicle.config = config;
        vehicle.throttle = 0.0;
        vehicle.steer = 0.0;
        vehicle.brake = 0.0;
        vehicle.steer_angle = 0.0;
        vehicle.steer_rate = 0.0;
        vehicle.steering = SteeringState::default();
        vehicle.rack_torque = 0.0;
        vehicle.rack_torque_filtered = 0.0;
        vehicle.player_flags = 0;
        self.register_vehicle(handle, config);
        self.bodies.propagate_modified_body_positions_to_colliders(&mut self.colliders);
        self.query_pipeline.update(&self.colliders);
        Ok(())
    }

    /// Sandbox maintenance helper. Identity comes from the connection, never
    /// an arbitrary client-supplied player ID. Future match service must also
    /// require an authorized station/cost; this is explicitly a debug action.
    pub fn service_vehicle_for_player(&mut self, player_id: &str) -> Result<(), String> {
        let vehicle = self.vehicles.get_mut(player_id).ok_or("Spawn a vehicle before servicing")?;
        let body = self.bodies.get(vehicle.body).ok_or("Vehicle body unavailable")?;
        if vehicle.powertrain.engine_requested || body.linvel().norm() > 0.5 {
            return Err("Stop and switch the engine off before sandbox service".into());
        }
        if !self.wheels.get(&vehicle.body).is_some_and(|wheels| wheels.iter().any(|wheel| wheel.grounded)) {
            return Err("Park on the ground before sandbox service".into());
        }
        vehicle.powertrain.service(vehicle.config.resources);
        vehicle.vehicle_flags.remove(VehicleStateFlags::ENGINE_ON | VehicleStateFlags::BOOST);
        Ok(())
    }

    /// Authored service bays use their local footprint, including rotation.
    /// A stopped vehicle receives fuel and/or repairs gradually; no client can
    /// request arbitrary healing. Supply/destruction economics are a later layer.
    fn service_authored_bays(&mut self, dt: Real) {
        let Some(layout) = self.active_map.as_ref().and_then(|map|map.authored_layout.as_ref()) else { return; };
        let tile = self.block_world.tile_size.unwrap_or([1.0, 1.0]);
        'vehicle: for vehicle in self.vehicles.values_mut() {
            let Some(body) = self.bodies.get(vehicle.body) else { continue; };
            if body.linvel().norm() > 0.5 { continue; }
            let p=body.translation();
            for &(bx, bz) in self.block_world.loaded.keys() {
            for bay in &layout.objects {
                if !["fuel-station","repair-shop","service-center"].contains(&bay.piece.as_str()) { continue; }
                if self.asset_health.get(&bay.id)==Some(&0.0){continue;}
                let dx=p.x-bay.position[0]-bx as f32*tile[0]; let dz=p.z-bay.position[2]-bz as f32*tile[1];
                let yaw=bay.yaw.to_radians();
                let x=dx*yaw.cos()-dz*yaw.sin(); let z=dx*yaw.sin()+dz*yaw.cos();
                if x.abs()>bay.size[0]*0.3 || z.abs()>bay.size[2]*0.325
                    || p.y<bay.position[1] || p.y>bay.position[1]+bay.size[1] { continue; }
                let state=&mut vehicle.powertrain;
                if bay.piece!="repair-shop" { state.fuel_liters=(state.fuel_liters+dt*3.0).min(vehicle.config.resources.fuel_capacity_liters); }
                if bay.piece!="repair-shop" {state.nos_remaining_s=(state.nos_remaining_s+dt*1.5).min(vehicle.config.resources.nos_seconds);}
                if bay.piece!="fuel-station" { state.condition=(state.condition+dt*0.06).min(1.0);state.temperature_c=(state.temperature_c-dt*3.0).max(vehicle.config.resources.initial_temp_c); }
                continue 'vehicle; // Overlapping bays cannot multiply the service rate.
            }
            }
        }
    }

    pub fn step(&mut self, dt: Real) {
        if dt.is_finite() && dt > 0.0 { self.service_authored_bays(dt.min(0.1)); }
        if !dt.is_finite() || dt <= 0.0 {
            return;
        }

        let step_started = std::time::Instant::now();
        for vehicle in self.vehicles.values_mut(){
            vehicle.ram.stun_remaining=(vehicle.ram.stun_remaining-dt.min(0.066667)).max(0.0);
            let grounded=self.wheels.get(&vehicle.body).is_some_and(|ws|ws.iter().filter(|w|w.grounded).count()>=2);
            let forward_speed=self.bodies.get(vehicle.body).map(|b|(b.rotation().inverse()*b.linvel()).z).unwrap_or(-1.0);
            vehicle.ram.blocked=if !vehicle.config.tracked {"TANK ONLY"}
                else if vehicle.ram.stun_remaining>0.0 {"STUNNED"}
                else if !vehicle.powertrain.running || vehicle.config.engine_force<=0.0 {"ENGINE OFF"}
                else if vehicle.powertrain.thermal_recovery || (!vehicle.ram.active() && vehicle.powertrain.temperature_c>=vehicle.config.resources.overheat_c) {"COOL ENGINE"}
                else if !vehicle.ram.active() && vehicle.powertrain.condition<0.12 {"NEEDS REPAIR"}
                else if !vehicle.ram.active() && vehicle.powertrain.nos_remaining_s+0.01<crate::ram::DURATION {"REFILL NOS"}
                else if !vehicle.ram.active() && vehicle.powertrain.fuel_liters<crate::ram::FUEL_COST+1.0 {"LOW FUEL"}
                else if !vehicle.cockpit.manual_gear().map(|g|g>0).unwrap_or(true) {"DRIVE GEAR"}
                else if vehicle.cockpit.parking_force()>=0.2 {"PARKED"}
                else if vehicle.brake>=0.2 || vehicle.handbrake>=0.2 {"BRAKES"}
                else if !grounded {"AIRBORNE"}
                else if vehicle.throttle< -0.05 || forward_speed< -0.5 {"REVERSING"}else{""};
            let allowed=vehicle.ram.blocked.is_empty();
            let started = vehicle.ram.advance(dt.min(0.066667),allowed);
            if started {
                vehicle.powertrain.fuel_liters=(vehicle.powertrain.fuel_liters-crate::ram::FUEL_COST).max(0.0);
                if let Some(body) = self.bodies.get_mut(vehicle.body) {
                    // Ability-powered launch, once per activation, only grounded.
                    let forward = body.rotation()*Vector::z();
                    let speed = body.linvel().dot(&forward);
                    let delta = (vehicle.config.max_speed*crate::ram::SPEED_MULTIPLIER-speed).clamp(0.0,12.0);
                    body.apply_impulse(forward*(body.mass()*delta),true);
                }
            }
            if !vehicle.ram.active() && vehicle.ram.cost_due {
                vehicle.ram.cost_due=false;
                vehicle.powertrain.condition=(vehicle.powertrain.condition-crate::ram::CONDITION_COST).max(0.0);
                let heat=vehicle.powertrain.temperature_c;
                vehicle.powertrain.temperature_c=heat.max((heat+crate::ram::HEAT_DEBT).min(vehicle.config.resources.critical_c-5.0));
            }
        }
        // Map maintenance and debug allocation belong to the outer tick.
        // Rapier keeps this query pipeline current between substeps.
        self.debug_overlay.clear();
        self.update_loaded_blocks_around_players();
        // Reloaded tiles must not resurrect invisible collision for destroyed assets.
        if !self.asset_health.is_empty() {
            if let Some(layout)=self.active_map.as_ref().and_then(|m|m.authored_layout.as_ref()).filter(|l|!l.repeat) {
                let disabled:Vec<_>=self.bodies.iter().filter(|(_,b)| b.user_data>0 && layout.objects.get(b.user_data as usize-1).is_some_and(|o|self.asset_health.get(&o.id)==Some(&0.0))).flat_map(|(_,b)|b.colliders().to_vec()).collect();
                for h in disabled {if let Some(c)=self.colliders.get_mut(h){c.set_enabled(false);}}
            }
        }

        self.query_pipeline.update(&self.colliders);

        // Recompute custom contacts and forces for each small integration step.
        // Bound catch-up work after a stall as well as the spring integration dt.
        let elapsed = dt.min(MAX_PHYSICS_SUBSTEP * MAX_PHYSICS_SUBSTEPS as Real);
        let count = ((elapsed / MAX_PHYSICS_SUBSTEP).ceil() as usize)
            .clamp(1, MAX_PHYSICS_SUBSTEPS);
        let substep_dt = elapsed / count as Real;
        for _ in 0..count {
            self.step_substep(substep_dt);
        }
        let trace_now = self.refresh_vehicle_wheel_snapshots();
        self.populate_block_debug();
        if trace_now {
            println!("[physics] substeps={} step_ms={:.2} debug_boxes={}",
                count, step_started.elapsed().as_secs_f64() * 1000.0,
                self.debug_overlay.block_boxes.len());
        }
    }

    /// Only authored, destructible rail/barrier pieces use mass-based impacts.
    /// No broad city collider scan and no damage from merely resting against one.
    fn apply_barrier_impacts(&mut self,motion:&HashMap<RigidBodyHandle,(Vector<Real>,Vector<Real>)>,dt:f32){
        self.barrier_impacts.retain(|_,t|{*t-=dt;*t>0.0});
        let Some(layout)=self.active_map.as_ref().and_then(|m|m.authored_layout.as_ref()).filter(|l|!l.repeat)else{return};
        let mut hits=HashMap::new();
        for v in self.vehicles.values(){
            let Some(body)=self.bodies.get(v.body)else{continue};
            let speed=motion.get(&v.body).map(|(_,velocity)|velocity.norm()).unwrap_or_else(||body.linvel().norm());
            if speed<3.0{continue;}
            for collider in body.colliders(){for pair in self.narrow_phase.contact_pairs_with(*collider){
                if pair.total_impulse_magnitude()<1000.0{continue;}
                let other=if pair.collider1==*collider{pair.collider2}else{pair.collider1};
                let Some(target)=self.colliders.get(other).and_then(|c|c.parent())else{continue};
                if self.barrier_impacts.contains_key(&(v.body,target)){continue;}
                let Some(object)=self.bodies[target].user_data.checked_sub(1).and_then(|i|layout.objects.get(i as usize)).filter(|o|o.piece=="barrier")else{continue};
                let Some(d)=object.destruction.as_ref().filter(|d|d.enabled)else{continue};
                let damage=(0.5*body.mass()*speed*speed/5000.0).clamp(0.0,400.0);
                hits.insert((v.body,target),(object.id.clone(),d.hp,damage));
            }}
        }
        for ((source,target),(id,max_hp,damage)) in hits{
            self.barrier_impacts.insert((source,target),0.4);
            let hp=self.asset_health.entry(id).or_insert(max_hp);*hp=(*hp-damage).max(0.0);
            if *hp==0.0{for h in self.bodies[target].colliders().to_vec(){if let Some(c)=self.colliders.get_mut(h){c.set_enabled(false);}}}
        }
    }

    fn apply_ram_bonus(&mut self,motion:&HashMap<RigidBodyHandle,(Vector<Real>,Vector<Real>)>){
        let mut hits=Vec::new();
        for (id,attacker) in &self.vehicles{
            if !attacker.ram.charging(){continue;}
            let Some(body)=self.bodies.get(attacker.body)else{continue;};
            let (position,velocity)=motion.get(&attacker.body).copied().unwrap_or((*body.translation(),*body.linvel()));
            let forward=body.rotation()*Vector::z();
            for collider in body.colliders(){for pair in self.narrow_phase.contact_pairs_with(*collider){
                if pair.total_impulse_magnitude()<1000.0 {continue;}
                let other=if pair.collider1==*collider{pair.collider2}else{pair.collider1};
                let Some(target)=self.colliders.get(other).and_then(|c|c.parent())else{continue;};
                if target==attacker.body||attacker.ram.hits.contains(&target){continue;}
                let Some(target_body)=self.bodies.get(target)else{continue;};
                let (target_pos,target_velocity)=motion.get(&target).copied().unwrap_or((*target_body.translation(),*target_body.linvel()));
                let toward=target_pos-position;
                if toward.norm()<0.1||toward.normalize().dot(&forward)<0.35{continue;}
                let closing=(velocity-target_velocity).dot(&toward.normalize());
                if closing>3.5 {hits.push((id.clone(),target,closing));}
            }}
        }
        for (source,target,closing) in hits{
            let Some(attacker)=self.vehicles.get_mut(&source)else{continue;};
            if !attacker.ram.hits.insert(target){continue;}let team=attacker.team.clone();
            if let Some(victim_id)=self.body_to_player.get(&target).cloned(){
                // Physical knockback affects any dynamic vehicle in the path.
                // Friendly vehicles retain ordinary collision damage only.
                if let Some(body)=self.bodies.get_mut(target) {
                    let direction=motion.get(&attacker.body).map(|(p,_)|(*body.translation()-*p).normalize()).unwrap_or(Vector::z());
                    let kick=(closing*0.8).clamp(6.0,18.0);
                    body.apply_impulse((direction*kick+Vector::y()*0.8)*body.mass(),true);
                }
                let mut dealt=0.0;
                if let Some(victim)=self.vehicles.get_mut(&victim_id){
                    if victim.team==team{continue;}
                    victim.ram.stun_remaining=victim.ram.stun_remaining.max(crate::ram::STUN_SECONDS);
                    let bonus=((closing-3.5)*0.015).clamp(0.03,0.25);
                    let before=victim.powertrain.condition;victim.powertrain.condition=(before-bonus).max(0.0);dealt=before-victim.powertrain.condition;
                }
                if let Some(attacker)=self.vehicles.get_mut(&source){attacker.powertrain.credit_damage_dealt(dealt);}
            }else{
                let index=self.bodies[target].user_data as usize;
                let Some(object)=self.active_map.as_ref().and_then(|m|m.authored_layout.as_ref()).filter(|l|!l.repeat).and_then(|l|index.checked_sub(1).and_then(|i|l.objects.get(i)))else{continue;};
                if ["coastal-land","coastal-land-bridge"].contains(&object.piece.as_str()){continue;}
                let Some(d)=object.destruction.as_ref().filter(|d|d.enabled)else{continue;};
                let hp=self.asset_health.entry(object.id.clone()).or_insert(d.hp);*hp=(*hp-150.0*d.cannon).max(0.0);
                if *hp==0.0 {for h in self.bodies[target].colliders().to_vec(){if let Some(c)=self.colliders.get_mut(h){c.set_enabled(false);}}}
            }
        }
    }

    fn step_substep(&mut self, dt: Real) {

        // Inputs were clamped once when attached to the vehicle. Steering
        // smoothing has one owner inside apply_vehicle_forces, not a second
        // rack integrator or a second control pass here.
        // Apply suspension + traction + tire forces exactly once per substep.
        self.apply_vehicle_forces(dt);

        // Only multiplayer impacts can earn ultimate. Sample vehicle motion
        // before Rapier resolves a collision, so a ram that stops the attacker
        // still counts. Ordinary solo driving allocates no attribution table;
        // active Ram also samples pre-contact motion for authored structures.
        let impact_motion: HashMap<_, _> = if self.vehicles.len() > 1 || self.vehicles.values().any(|v|v.ram.active()) || self.active_map.as_ref().and_then(|m|m.authored_layout.as_ref()).is_some_and(|l|!l.repeat&&l.objects.iter().any(|o|o.piece=="barrier")) {
            self.vehicles.values().filter_map(|vehicle| self.bodies.get(vehicle.body)
                .map(|body| (vehicle.body, (*body.translation(), *body.linvel())))).collect()
        } else { HashMap::new() };

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

        // Collision normal impulses are Rapier's results, after integration.
        // Inspect only each vehicle's contacts; never scan all city colliders.
        let mut damage_credits = Vec::new();
        for (victim_id, vehicle) in &mut self.vehicles {
            let Some(body) = self.bodies.get(vehicle.body) else { continue; };
            let mut impact_impulse = 0.0_f32;
            let mut impact_source = None;
            for collider in body.colliders() {
                for pair in self.narrow_phase.contact_pairs_with(*collider) {
                    let impulse = pair.total_impulse_magnitude();
                    if impulse > impact_impulse {
                        impact_impulse = impulse;
                        let other = if pair.collider1 == *collider { pair.collider2 } else { pair.collider1 };
                        impact_source = self.colliders.get(other).and_then(|collider| collider.parent());
                    }
                }
            }
            let before = vehicle.powertrain.condition;
            vehicle.powertrain.impact(impact_impulse / body.mass().max(1.0), vehicle.config.resources);
            let damage = before - vehicle.powertrain.condition;
            if damage > 0.0 {
                if let Some(source) = impact_source {
                    if let (Some((source_pos, source_velocity)), Some((victim_pos, _)), Some(source_id)) =
                        (impact_motion.get(&source), impact_motion.get(&vehicle.body), self.body_to_player.get(&source)) {
                        let toward = victim_pos - source_pos;
                        if source_id != victim_id && toward.norm() > 0.1 && source_velocity.dot(&toward.normalize()) > 1.0 {
                            damage_credits.push((source_id.clone(), damage));
                        }
                    }
                }
            }
        }
        for (source, damage) in damage_credits {
            if let Some(vehicle) = self.vehicles.get_mut(&source) { vehicle.powertrain.credit_damage_dealt(damage); }
        }


        self.apply_barrier_impacts(&impact_motion,dt);
        self.apply_ram_bonus(&impact_motion);

        // Recovery is server-owned and independent of menus or held input.
        // Allow a brief fall before resetting to the authored spawn, not origin.
        let mut recover = Vec::new();
        for (id, vehicle) in &self.vehicles {
            let Some(body) = self.bodies.get(vehicle.body) else { continue; };
            let road = self.spawn_poses.get(id).map(|s|s.1).unwrap_or(0.0);
            let p = body.translation();
            let elapsed = self.falling_seconds.entry(id.clone()).or_default();
            if !p.iter().all(|v|v.is_finite()) { recover.push(id.clone()); }
            else if p.y < road - 20.0 {
                *elapsed += dt;
                if *elapsed >= 2.0 { recover.push(id.clone()); }
            } else { *elapsed = 0.0; }
        }
        for id in recover { if self.recover_vehicle_for_player(&id).is_ok() { self.falling_seconds.remove(&id); } }

        // Safety: prevent bodies from exploding to insane coordinates
        for (_, body) in self.bodies.iter_mut() {
            let mut pos = *body.translation();

            let bad =
                !pos.x.is_finite()
                || !pos.y.is_finite()
                || !pos.z.is_finite()
                || pos.y.abs() > 10_000.0;

            if bad {
                // Emergency fallback only: this is not normal vehicle spawning.
                // A reset at y=5 is announced below and can explain a sudden high
                // spawn if non-finite state was produced elsewhere.
                pos = vector![0.0, 5.0, 0.0];
                body.set_translation(pos, true);
                body.set_linvel(vector![0.0, 0.0, 0.0], true);
                body.set_angvel(vector![0.0, 0.0, 0.0], true);

                println!("⚠️ Reset exploding body back to {:?}", pos);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::suspension_contact::cast_wheel_ground;

    #[test]
    fn launch_assist_rearms_after_actual_drive_demand_returns_below_grip() {
        let mut world = flat_world();
        world.spawn_vehicle_for_player("launch-test".into(), [0.0;3], "brz", "red").unwrap();
        world.vehicles.get_mut("launch-test").unwrap().powertrain.engine_requested=true;
        for _ in 0..150 { world.step(SIMULATION_DT); }
        assert!(world.vehicles["launch-test"].powertrain.running);
        {
            let v=world.vehicles.get_mut("launch-test").unwrap();
            v.powertrain.engine_requested=true;
            // A proving fixture requests more drive than the grounded tires
            // can transmit. The production solver still owns all final forces.
            v.config.engine_force *= 3.0;
            v.throttle=1.0;
            v.cockpit.receive(Some((1<<6)|(1<<7)|(2<<4)|(1<<16)|(1<<24)),0.0,false);
        }
        let mut saturated=false;
        for _ in 0..20 {
            world.step(SIMULATION_DT);
            let v=&world.vehicles["launch-test"];
            let wheels=&world.wheels[&v.body];
            let driven=wheels.iter().filter(|w|w.drive).count().max(1) as f32;
            let force=v.config.engine_force*v.powertrain.power_multiplier*v.powertrain.drive_ratio_multiplier*v.powertrain.drive_throttle.abs()/driven;
            saturated |= wheels.iter().any(|w|w.drive && w.normal_force>=50.0 && force>w.normal_force*v.config.mu_base);
            assert!(v.cockpit.launch_off(),"launch mode must remain armed while drive exceeds grip");
        }
        assert!(saturated,"the running vehicle must actually exhaust grounded drive grip");
        assert!(!world.vehicles["launch-test"].vehicle_flags.contains(VehicleStateFlags::TCS));
        world.vehicles.get_mut("launch-test").unwrap().throttle=0.0;
        for _ in 0..40 {world.step(SIMULATION_DT);}
        assert!(world.vehicles["launch-test"].vehicle_flags.contains(VehicleStateFlags::TCS));
        assert!(!world.vehicles["launch-test"].cockpit.launch_off());
    }

    #[test]
    fn fuel_starvation_removes_actual_propulsion_even_with_an_on_request() {
        let mut world = flat_world();
        let handle = world.spawn_vehicle_for_player("fuel-test".into(), [0.0; 3], "brz", "red").unwrap();
        let vehicle = world.vehicles.get_mut("fuel-test").unwrap();
        vehicle.powertrain.fuel_liters = 0.0; vehicle.throttle = 1.0;
        for _ in 0..120 { world.step(SIMULATION_DT); }
        let vehicle = &world.vehicles["fuel-test"];
        assert!(!vehicle.vehicle_flags.contains(VehicleStateFlags::ENGINE_ON));
        assert_eq!(vehicle.powertrain.power_multiplier, 0.0);
        let velocity = world.bodies[handle].linvel();
        assert!(velocity.x.abs() < 0.1 && velocity.z.abs() < 0.1);
    }

    #[test]
    fn rapier_wall_impact_causes_condition_loss_but_standing_on_the_road_does_not() {
        let mut world = flat_world();
        let handle = world.spawn_vehicle_for_player("impact-test".into(), [0.0; 3], "brz", "red").unwrap();
        world.vehicles.get_mut("impact-test").unwrap().powertrain.engine_requested = false;
        for _ in 0..120 { world.step(SIMULATION_DT); }
        assert_eq!(world.vehicles["impact-test"].powertrain.condition, 1.0);
        let position = *world.bodies[handle].translation();
        world.colliders.insert(ColliderBuilder::cuboid(10.0, 4.0, 0.3)
            .translation(vector![position.x, 2.0, position.z + 8.0]).friction(0.0).build());
        world.bodies[handle].set_linvel(vector![0.0, 0.0, 15.0], true);
        for _ in 0..90 { world.step(SIMULATION_DT); }
        assert!(world.vehicles["impact-test"].powertrain.condition < 0.98);
        assert!(world.vehicles["impact-test"].powertrain.condition >= 0.0);
        assert_eq!(world.vehicles["impact-test"].powertrain.ultimate_fraction,0.0,"scenery and self damage never earn charge");
    }

    #[test]
    fn a_vehicle_ram_credits_only_actual_damage_dealt_not_damage_taken_or_parked_contact() {
        let mut world = flat_world();
        let attacker = world.spawn_vehicle_for_player("attacker".into(), [0.0;3], "brz", "red").unwrap();
        let y = world.bodies[attacker].translation().y;
        world.bodies[attacker].set_translation(vector![0.0,y,-12.0],true);
        let target = world.spawn_vehicle_for_player("target".into(), [0.0;3], "brz", "red").unwrap();
        for vehicle in world.vehicles.values_mut() { vehicle.powertrain.engine_requested = false; }
        for _ in 0..120 { world.step(SIMULATION_DT); }
        assert_eq!(world.vehicles["attacker"].powertrain.ultimate_fraction,0.0);
        assert_eq!(world.vehicles["target"].powertrain.condition,1.0);
        world.bodies[attacker].set_linvel(vector![0.0,0.0,18.0],true);
        for _ in 0..100 { world.step(SIMULATION_DT); }
        let dealt = 1.0 - world.vehicles["target"].powertrain.condition;
        assert!(dealt>0.0001,"test needs a damaging ram: attacker={:?}, target={:?}, target condition={}",world.bodies[attacker].translation(),world.bodies[target].translation(),world.vehicles["target"].powertrain.condition);
        assert!((world.vehicles["attacker"].powertrain.ultimate_fraction-dealt).abs()<1.0e-5);
        assert_eq!(world.vehicles["target"].powertrain.ultimate_fraction,0.0);
        assert_ne!(attacker,target);
    }

    #[test]
    fn sandbox_service_requires_a_parked_grounded_engine_off_vehicle() {
        let mut world = flat_world();
        let handle = world.spawn_vehicle_for_player("service-test".into(), [0.0; 3], "brz", "red").unwrap();
        for _ in 0..120 { world.step(SIMULATION_DT); }
        assert!(world.service_vehicle_for_player("service-test").is_err());
        world.vehicles.get_mut("service-test").unwrap().powertrain.engine_requested = false;
        world.bodies[handle].set_linvel(vector![0.0, 0.0, 2.0], true);
        assert!(world.service_vehicle_for_player("service-test").is_err());
        world.bodies[handle].set_linvel(Vector::zeros(), true);
        let vehicle = world.vehicles.get_mut("service-test").unwrap();
        vehicle.powertrain.fuel_liters = 3.0; vehicle.powertrain.condition = 0.3; vehicle.powertrain.temperature_c = 125.0;
        let position = *world.bodies[handle].position();
        world.service_vehicle_for_player("service-test").unwrap();
        let vehicle = &world.vehicles["service-test"];
        assert_eq!(vehicle.powertrain.fuel_liters, vehicle.config.resources.fuel_capacity_liters);
        assert_eq!(vehicle.powertrain.condition, 1.0);
        assert_eq!(vehicle.powertrain.temperature_c, vehicle.config.resources.initial_temp_c);
        assert!(!vehicle.powertrain.engine_requested); assert!(!vehicle.powertrain.running);
        assert_eq!(*world.bodies[handle].position(), position);
    }

    #[test]
    fn reset_and_fall_recovery_return_to_recorded_spawn() {
        let mut world=flat_world();
        let handle=world.spawn_vehicle_for_player("fall-test".into(),[0.0;3],"brz","red").unwrap();
        let spawn=*world.bodies[handle].translation();
        world.bodies[handle].set_translation(vector![45.0,10.0,65.0],true);
        world.recover_vehicle_for_player("fall-test").unwrap();
        assert!((*world.bodies[handle].translation()-spawn).norm()<0.01);
        world.bodies[handle].set_translation(vector![45.0,-40.0,65.0],true);
        for _ in 0..60 { world.step(SIMULATION_DT); }
        assert!(world.bodies[handle].translation().y < -20.0,"brief fall should be visible");
        for _ in 0..65 { world.step(SIMULATION_DT); }
        assert!((world.bodies[handle].translation().x-spawn.x).abs()<0.01);
        assert!(world.bodies[handle].translation().y > -1.0);
        world.bodies[handle].set_translation(vector![45.0,-40.0,65.0],true);
        world.change_vehicle_for_player("fall-test","ae86").unwrap();
        assert!((world.bodies[handle].translation().x-spawn.x).abs()<0.01);
        assert!(world.bodies[handle].translation().y > 0.0);
    }

    #[test]
    fn recovery_is_edge_triggered_and_preserves_supplies_damage_and_temperature() {
        let mut world = flat_world();
        let handle = world.spawn_vehicle_for_player("recover-test".into(), [0.0; 3], "brz", "red").unwrap();
        world.bodies[handle].set_rotation(Rotation::from_euler_angles(0.0, 0.4, 2.5), true);
        let train = &mut world.vehicles.get_mut("recover-test").unwrap().powertrain;
        train.fuel_liters = 12.0; train.condition = 0.6; train.temperature_c = 120.0; train.nos_remaining_s = 2.0;
        let packet = InputPacket { combat: None, r#type: "input".into(), seq: 1, dt: 1.0 / 60.0,
            throttle: 0.0, steer: 0.0, brake: 0.0, handbrake: 0.0, cockpit_mask: None,  parking_brake:None, cabin_mask: None, vehicleMask: 97, playerMask: 1 << 5, debug_mask: Some(0) };
        world.apply_player_input_packet("recover-test", packet.clone());
        assert!((world.bodies[handle].rotation() * Vector::y()).y > 0.99);
        world.bodies[handle].set_linvel(vector![1.0, 0.0, 0.0], true);
        world.apply_player_input_packet("recover-test", packet);
        assert_eq!(world.bodies[handle].linvel().x, 1.0, "a held reset cannot repeatedly freeze the car");
        let train = &world.vehicles["recover-test"].powertrain;
        assert_eq!(train.fuel_liters, 12.0); assert_eq!(train.condition, 0.6); assert_eq!(train.temperature_c, 120.0); assert_eq!(train.nos_remaining_s, 2.0);
    }

    #[test]
    fn repeating_gear_override_packets_do_not_lock_automatic_and_neutral_remains_explicit() {
        let mut world=flat_world();world.spawn_vehicle_for_player("shift-test".into(),[0.0;3],"brz","red").unwrap();
        let mut packet=InputPacket { combat: None,r#type:"input".into(),seq:1,dt:1.0/60.0,throttle:1.0,steer:0.0,brake:0.0,handbrake:0.0,
            cockpit_mask:Some((6<<7)|(1<<6)|(11<<24)|(1<<16)), parking_brake:None, cabin_mask:None,vehicleMask:97,playerMask:0,debug_mask:Some(0)};
        for _ in 0..30 {world.apply_player_input_packet("shift-test",packet.clone());world.step(SIMULATION_DT);}
        assert_eq!(world.vehicles["shift-test"].powertrain.manual_gear,None);assert_eq!(world.vehicles["shift-test"].powertrain.gear,6);
        for _ in 0..90 {world.apply_player_input_packet("shift-test",packet.clone());world.step(SIMULATION_DT);}
        assert!(world.vehicles["shift-test"].powertrain.gear<6,"held sender state cannot renew the brief override");
        packet.cockpit_mask=Some((1<<6)|(2<<24)|(2<<16));
        for _ in 0..60 {world.apply_player_input_packet("shift-test",packet.clone());world.step(SIMULATION_DT);}
        let p=&world.vehicles["shift-test"].powertrain;assert_eq!(p.gear,0);assert_eq!(p.manual_gear,Some(0));assert_eq!(p.drive_throttle,0.0);
        packet.cockpit_mask=Some((2<<7)|(1<<6)|(11<<24)|(3<<16));world.apply_player_input_packet("shift-test",packet);world.step(SIMULATION_DT);
        assert_eq!(world.vehicles["shift-test"].powertrain.gear,2);assert_eq!(world.vehicles["shift-test"].powertrain.manual_gear,None);
    }

    #[test]
    fn held_flash_sets_authoritative_lamps_and_releases_to_the_selected_mode() {
        let mut world = flat_world();
        world.spawn_vehicle_for_player("flash-test".into(), [0.0;3], "brz", "red").unwrap();
        let mut packet = InputPacket { combat: None, r#type:"input".into(), seq:1, dt:1.0/60.0,
            throttle:0.0, steer:0.0, brake:0.0, handbrake:0.0, cockpit_mask:None,
             parking_brake:None, cabin_mask:Some(4|4096|8192|(2<<10)), vehicleMask:96, playerMask:0, debug_mask:Some(0) };
        for mode in 0..=3 {
            packet.cockpit_mask = Some(mode | (1<<6) | (1<<7) | ((mode+1)<<16) | (6<<24));
            packet.cabin_mask = Some(4|4096|(2<<10)|(1<<20));
            world.apply_player_input_packet("flash-test", packet.clone()); world.step(SIMULATION_DT);
            let vehicle = &world.vehicles["flash-test"];
            assert!(vehicle.vehicle_flags.contains(VehicleStateFlags::HEADLIGHTS));
            assert_ne!(vehicle.cockpit.cluster_mask(0.0) & 8, 0);
            packet.cabin_mask = Some(4|4096|(2<<10));
            world.apply_player_input_packet("flash-test", packet.clone()); world.step(SIMULATION_DT);
            let vehicle = &world.vehicles["flash-test"];
            assert_eq!(vehicle.vehicle_flags.contains(VehicleStateFlags::HEADLIGHTS), mode >= 2);
            assert_eq!(vehicle.cockpit.cluster_mask(0.0) & 8 != 0, mode == 3);
            assert_eq!(vehicle.cockpit.lights, mode as u8);
        }
    }

    #[test]
    fn input_pipeline_keeps_fractional_cable_force_independent_of_service_and_momentary_brakes() {
        let mut world=flat_world();
        world.spawn_vehicle_for_player("pressure-test".into(),[0.0;3],"brz","red").unwrap();
        let mut packet=InputPacket { combat: None,r#type:"input".into(),seq:1,dt:1.0/60.0,
            throttle:0.0,steer:0.0,brake:0.0,handbrake:0.8,
            cockpit_mask:Some((1<<6)|(1<<7)|(3<<24)|(1<<16)),parking_brake:Some(0.173),
            cabin_mask:None,vehicleMask:97,playerMask:0,debug_mask:Some(0)};
        world.apply_player_input_packet("pressure-test",packet.clone());world.step(SIMULATION_DT);
        let v=&world.vehicles["pressure-test"];
        assert!((v.cockpit.parking_force()-0.173).abs()<0.00001);assert_eq!(v.handbrake,0.8);
        packet.handbrake=0.0;packet.brake=0.4;
        world.apply_player_input_packet("pressure-test",packet.clone());world.step(SIMULATION_DT);
        let v=&world.vehicles["pressure-test"];
        assert_eq!(v.handbrake,0.0);assert!((v.cockpit.parking_force()-0.173).abs()<0.00001);
        packet.parking_brake=Some(0.0);
        world.apply_player_input_packet("pressure-test",packet);world.step(SIMULATION_DT);
        assert_eq!(world.vehicles["pressure-test"].cockpit.parking_force(),0.0);
    }

    #[test]
    fn ignition_packets_power_the_cluster_without_starting_until_the_starter_is_held() {
        let mut world=flat_world();world.spawn_vehicle_for_player("key-test".into(),[0.0;3],"brz","red").unwrap();
        let mut packet=InputPacket { combat: None, r#type:"input".into(),seq:1,dt:1.0/60.0,throttle:0.0,steer:0.0,brake:0.0,handbrake:0.0,
            cockpit_mask:None, parking_brake:None, cabin_mask:Some(4|4096|8192),vehicleMask:97,playerMask:0,debug_mask:Some(0) };
        world.apply_player_input_packet("key-test",packet.clone());world.step(SIMULATION_DT);
        assert!(!world.vehicles["key-test"].powertrain.running);
        for stage in [1,2] {
            packet.cabin_mask=Some(4|4096|8192|(stage<<10));
            for _ in 0..60 { world.apply_player_input_packet("key-test",packet.clone());world.step(SIMULATION_DT); }
            assert!(!world.vehicles["key-test"].powertrain.running);assert!(!world.vehicles["key-test"].powertrain.engine_requested);
        }
        packet.cabin_mask=Some(4|4096|8192|(3<<10));
        for _ in 0..10 {world.apply_player_input_packet("key-test",packet.clone());world.step(SIMULATION_DT);}
        assert!(!world.vehicles["key-test"].powertrain.running);
        let vehicle = &world.vehicles["key-test"];
        assert_ne!(vehicle.powertrain.resource_mask(vehicle.config.resources) & crate::powertrain::STARTING, 0);
        packet.cabin_mask=Some(4|4096|8192|(2<<10));world.apply_player_input_packet("key-test",packet.clone());world.step(SIMULATION_DT);
        assert!(!world.vehicles["key-test"].powertrain.running,"early release aborts cranking");
        packet.cabin_mask=Some(4|4096|8192|(3<<10));
        for _ in 0..60 {world.apply_player_input_packet("key-test",packet.clone());world.step(SIMULATION_DT);}
        assert!(world.vehicles["key-test"].powertrain.running);
        let vehicle = &world.vehicles["key-test"];
        assert_eq!(vehicle.powertrain.resource_mask(vehicle.config.resources) & crate::powertrain::STARTING, 0);
        assert!(vehicle.vehicle_flags.contains(VehicleStateFlags::ENGINE_ON));
        assert_eq!((world.vehicles["key-test"].cockpit.cabin_snapshot(true,true)>>10)&3,2);
        packet.cabin_mask=Some(4|4096|8192|(2<<10));world.apply_player_input_packet("key-test",packet.clone());world.step(SIMULATION_DT);
        assert!(world.vehicles["key-test"].powertrain.running,"release to ON keeps the engine running");
        packet.cabin_mask=Some(4|4096|8192);world.apply_player_input_packet("key-test",packet);world.step(SIMULATION_DT);
        assert!(!world.vehicles["key-test"].powertrain.running);
    }

    // Test the public spawn path against a minimal map using the actual loader's
    // Blender-to-Rapier collider conversion. No frontend height assumptions.
    fn flat_world() -> PhysicsWorld {
        let mut world = PhysicsWorld::new();
        let map: BlockColliderFile = serde_json::from_value(serde_json::json!({
            "schema_version": 2, "map_id": "audit_flat",
            "coordinate_system": {"units": "meters", "up_axis": "y", "forward_axis": "-z"},
            "cell": [200.0, 200.0], "surface": {"road_y": 0.32},
            "layout": {"kind": "fixed_grid", "origin": [0, 0], "size": [1, 1]},
            "team_spawns": {"red": [{"chunk": [0, 0], "local": [0.0, 0.0], "yaw": 0.0}], "blue": []},
            "visuals": [{"id": "roads", "asset": "unused.glb", "position": [0.0, 0.0, 0.0],
                "rotation": [0.0, 0.0, 0.0, 1.0], "scale": [1.0, 1.0, 1.0]}],
            "roads": [{"id": "road", "kind": "road", "visual": "Roads", "pos": [0.0, 0.0, 0.27],
                "rot": [0.0, 0.0, 0.0, 1.0], "half_extents": [100.0, 100.0, 0.05],
                "collider": "box", "destructible": false, "state": "intact"}],
            "buildings": []
        })).unwrap();
        world.active_map = Some(Arc::new(map));
        world.update_loaded_blocks_around_players();
        world
    }

    #[test]
    fn authored_spawn_uses_saved_location_heading_and_surface_elevation() {
        let mut baseline = flat_world();
        let original = baseline.spawn_vehicle_for_player("ground".into(), [0.0; 3], "brz", "red").unwrap();
        let ground_y = baseline.bodies[original].translation().y;
        let mut world = flat_world();
        let map = Arc::make_mut(world.active_map.as_mut().unwrap());
        let point = &mut map.team_spawns.red[0];
        point.local = [17.0, -23.0];
        point.yaw = std::f32::consts::FRAC_PI_2;
        point.surface_y = Some(12.5);
        let handle = world.spawn_vehicle_for_player("roof".into(), [0.0; 3], "brz", "red").unwrap();
        let body = &world.bodies[handle];
        assert!((body.translation().x - 17.0).abs() < 0.0001);
        assert!((body.translation().z + 23.0).abs() < 0.0001);
        assert!((body.translation().y - ground_y - (12.5 - 0.32)).abs() < 0.0001);
        let forward = body.rotation() * vector![0.0, 0.0, 1.0];
        assert!(forward.x > 0.999 && forward.z.abs() < 0.0001);
    }

    #[test]
    fn road_jump_lab_brz_crosses_the_measured_join_and_ground_bypass() {
        for (x,z,direction,distance) in [(0.0,220.0,1.0,30.0),(30.0,10.0,-1.0,100.0)] {
            let mut world=PhysicsWorld::new();world.select_map("road_jump_lab").unwrap();
            let h=world.spawn_vehicle_for_player("seam-driver".into(),[0.0;3],"brz","red").unwrap();
            world.bodies[h].set_translation(vector![x,0.895,z],true);
            for _ in 0..180 {world.step(SIMULATION_DT);}
            assert!(world.wheels[&h].iter().all(|w|w.grounded));
            world.bodies[h].set_linvel(vector![0.0,0.0,direction*8.0],true);
            let mut lost=0;let mut max_vertical=0.0_f32;
            for _ in 0..1200 {
                world.step(SIMULATION_DT);
                lost+=usize::from(world.wheels[&h].iter().any(|w|!w.grounded));
                max_vertical=max_vertical.max(world.bodies[h].linvel().y.abs());
                if (world.bodies[h].translation().z-z)*direction>distance {break;}
            }
            let moved=(world.bodies[h].translation().z-z)*direction;
            println!("LAB ground x={x}: moved={moved:.3} m lost={lost} max-vy={max_vertical:.3}");
            assert!(moved>distance && lost<5 && max_vertical<0.5);
        }
    }

    #[test]
    fn road_jump_lab_brz_climbs_the_return_ramp_onto_the_roof() {
        let mut world=PhysicsWorld::new();world.select_map("road_jump_lab").unwrap();
        let h=world.spawn_vehicle_for_player("return-driver".into(),[0.0;3],"brz","red").unwrap();
        world.bodies[h].set_translation(vector![16.0,0.895,-124.0],true);
        world.bodies[h].set_rotation(Rotation::identity(),true);
        for _ in 0..180 {world.step(SIMULATION_DT);}
        let mut on_roof=false;
        for _ in 0..600 {
            world.vehicles.get_mut("return-driver").unwrap().throttle=0.3;
            world.step(SIMULATION_DT);
            let p=world.bodies[h].translation();
            if p.z> -100.0 && p.y>2.0 && world.wheels[&h].iter().all(|w|w.grounded) {on_roof=true;break;}
        }
        println!("LAB return ramp: on-roof={on_roof} final={:?}",world.bodies[h].translation());
        assert!(on_roof,"the lower bypass must connect back to the landing roof through a drivable ramp");
    }

    // Real BRZ on the installed fixture: accelerate with the existing powertrain,
    // then observe suspension takeoff and roof contact. No scripted launch force.
    #[test]
    fn road_jump_lab_brz_proves_takeoff_landing_and_an_open_gap() {
        for (label, throttle, boost) in [("unboosted",1.0,false),("nos",1.0,true),("slow",0.12,false)] {
            let mut world=PhysicsWorld::new();world.select_map("road_jump_lab").unwrap();
            let h=world.spawn_vehicle_for_player("jump-driver".into(),[0.0;3],"brz","red").unwrap();
            for _ in 0..180 {world.step(SIMULATION_DT);}
            let mut airborne=0;let mut landed=false;let mut fell=false;let mut launch_speed=0.0_f32;
            let mut last_z=world.bodies[h].translation().z;
            let mut supported=0;let mut first_contact=0.0_f32;
            for _ in 0..2400 {
                let v=world.vehicles.get_mut("jump-driver").unwrap();v.throttle=throttle;
                v.powertrain.boost_requested=boost && last_z<60.0;
                if supported>0 {v.throttle=0.0;v.brake=1.0;}
                world.step(SIMULATION_DT);
                let p=*world.bodies[h].translation();let speed=world.bodies[h].linvel().norm();
                if last_z>=-16.0 && p.z< -16.0 {launch_speed=speed;}
                last_z=p.z;
                let grounded=world.wheels[&h].iter().any(|w|w.grounded);
                if p.z< -18.0 && !grounded {airborne+=1;}
                if p.z< -26.0 && p.z> -102.0 && p.y>2.0 && p.y<4.0 && grounded && airborne>5 {
                    if first_contact==0.0 {first_contact=p.z;}
                    if world.wheels[&h].iter().all(|w|w.grounded) {supported+=1;} else {supported=0;}
                    if supported>=30 {landed=true;break;}
                } else {supported=0;}
                if p.y< -3.0 {fell=true;break;}
            }
            println!("JUMP {label}: launch={launch_speed:.3} m/s airborne={airborne} landed={landed} roof-contact-z={first_contact:.3} fell={fell} final={:?} nos={:.3}",world.bodies[h].translation(),world.vehicles["jump-driver"].powertrain.nos_remaining_s);
            if label=="slow" {assert!(fell && !landed,"slow approach must fall into the open gap");}
            else {assert!(launch_speed>0.0 && airborne>5 && landed,"powered approach must take off and land on the roof");}
        }
    }

    #[test]
    fn workshop_garage_drives_through_its_open_bay_onto_the_road() {
        let mut world=PhysicsWorld::new();world.select_map("workshop_yard").unwrap();
        let handle=world.spawn_vehicle_for_player("garage-driver".into(),[0.0;3],"brz","red").unwrap();
        for _ in 0..180 {world.step(SIMULATION_DT);}
        assert!(world.wheels[&handle].iter().all(|w|w.grounded));
        world.bodies[handle].set_linvel(vector![8.0,0.0,0.0],true);
        let mut lost=0;
        for _ in 0..240 {world.step(SIMULATION_DT);lost+=usize::from(world.wheels[&handle].iter().any(|w|!w.grounded));}
        assert!(world.bodies[handle].translation().x>12.0,"car must leave the room and cross the explicit apron");
        assert!(lost<8,"wheel contact lost on {lost} frames");
        assert!(world.bodies[handle].translation().y>0.1);
    }

    #[test]
    fn measured_road_map_supports_real_vehicle_suspension_and_tile_seams() {
        let mut world=PhysicsWorld::new();world.select_map("road_precision").unwrap();
        let handle=world.spawn_vehicle_for_player("road-driver".into(),[0.0;3],"brz","red").unwrap();
        for _ in 0..180 {world.step(SIMULATION_DT);}
        let parked=*world.bodies[handle].translation();
        assert!(parked.y>0.1 && parked.y<2.0,"suspension must settle on the measured asphalt");
        assert!(world.wheels[&handle].iter().all(|w|w.grounded));
        world.bodies[handle].set_linvel(vector![0.0,0.0,-8.0],true);
        let mut max_vertical_speed=0.0_f32;let mut lost=0;
        for _ in 0..240 {
            world.step(SIMULATION_DT);
            max_vertical_speed=max_vertical_speed.max(world.bodies[handle].linvel().y.abs());
            lost+=usize::from(world.wheels[&handle].iter().any(|w|!w.grounded));
        }
        let moved=(world.bodies[handle].translation().z-parked.z).abs();
        assert!(moved>10.0,"vehicle must cross multiple source road tile joins");
        assert!(lost<5,"contact lost on {lost} frames");
        assert!(max_vertical_speed<0.5,"unexpected triangle seam kick: {max_vertical_speed}");
    }

    #[test]
    fn healthy_frs_reaches_sixth_and_its_configured_speed_in_the_real_tire_solver() {
        let mut world=flat_world();let handle=world.spawn_vehicle_for_player("top-speed".into(),[0.0;3],"frs","red").unwrap();
        for _ in 0..120 {world.step(SIMULATION_DT);}
        let configured=world.vehicles["top-speed"].config.max_speed;let mut highest=0;let mut speed=0.0;
        for _ in 0..7200 {
            // A virtual rolling road keeps the finite fixture beneath the car.
            // No velocity or tire force is supplied by the test.
            let body=&mut world.bodies[handle];let y=body.translation().y;body.set_translation(vector![0.0,y,0.0],true);
            let v=world.vehicles.get_mut("top-speed").unwrap();v.throttle=1.0;
            world.step(SIMULATION_DT);
            highest=highest.max(world.vehicles["top-speed"].powertrain.gear);speed=world.bodies[handle].linvel().norm();
        }
        println!("FRS tire solver: {speed:.3} m/s, gear {highest}, configured {configured:.3} m/s; fuel={:.2} L, temperature={:.2} C",world.vehicles["top-speed"].powertrain.fuel_liters,world.vehicles["top-speed"].powertrain.temperature_c);
        assert_eq!(highest,6);assert!(speed>configured*0.94&&speed<configured*1.06,"{speed} vs {configured}");
    }

    #[test]
    fn real_spawn_path_places_all_vehicle_wheels_at_target_sag_on_the_road() {
        for id in ["ae86", "gt86", "brz", "camaro", "supra", "tank"] {
            let mut world = flat_world();
            let handle = world.spawn_vehicle_for_player("test".into(), [0.0; 3], id, "red").unwrap();
            world.query_pipeline.update(&world.colliders);
            let config = config_for_vehicle(id).unwrap();
            for wheel in &world.wheels[&handle] {
                let hit = cast_wheel_ground(wheel, &world.bodies[handle], &world.query_pipeline,
                    &world.bodies, &world.colliders, handle).unwrap();
                assert!((hit.hit_point.y - 0.32).abs() < 1.0e-5);
                assert!((hit.compression - config.suspension_sag).abs() < 1.0e-5);
            }
        }
    }

    #[test]
    fn vehicle_changes_keep_owner_position_and_rotation_and_rebuild_physics() {
        let mut world = flat_world();
        let handle = world.spawn_vehicle_for_player("test".into(), [0.0; 3], "ae86", "red").unwrap();
        let original_count = world.colliders.len();
        let mut parked = *world.bodies[handle].position();
        parked.translation.x = 11.0;
        parked.translation.z = 22.0;
        parked.rotation = Rotation::from_euler_angles(0.0, 0.7, 0.0);
        world.bodies[handle].set_position(parked, true);
        world.bodies.propagate_modified_body_positions_to_colliders(&mut world.colliders);
        for target in ["brz", "camaro", "supra", "tank", "ae86"] {
            world.bodies[handle].set_linvel(vector![3.0, 0.0, 1.0], true);
            world.change_vehicle_for_player("test", target).unwrap();
            let expected = config_for_vehicle(target).unwrap();
            let body = &world.bodies[handle];
            assert_eq!(world.vehicles["test"].body, handle);
            assert_eq!(world.body_to_player[&handle], "test");
            assert_eq!(body.translation().x, 11.0);
            assert_eq!(body.translation().z, 22.0);
            assert!(body.rotation().angle_to(&parked.rotation) < 1.0e-5);
            assert!((body.mass() - expected.mass).abs() < expected.mass * 1.0e-5);
            assert_eq!(*body.linvel(), Vector::zeros());
            assert_eq!(world.colliders.len(), original_count);
            let shape = world.colliders[body.colliders()[0]].shape().as_cuboid().unwrap();
            assert_eq!(shape.half_extents, Vector::from(expected.chassis_half_extents));
            assert_eq!(world.wheels[&handle].len(), expected.wheels);
            for wheel in &world.wheels[&handle] { assert_eq!(wheel.radius, expected.wheel_radius); }
            assert_eq!(world.vehicles.len(), 1);
            assert_eq!(world.wheels.len(), 1);
        }
    }

    #[test]
    fn invalid_vehicle_change_does_not_remove_or_mutate_the_existing_car() {
        let mut world = flat_world();
        let handle = world.spawn_vehicle_for_player("test".into(), [0.0; 3], "ae86", "red").unwrap();
        let pose = *world.bodies[handle].position();
        let count = world.colliders.len();
        assert!(world.change_vehicle_for_player("test", "not-a-car").is_err());
        assert!(world.change_vehicle_for_player("not-the-owner", "supra").is_err());
        assert_eq!(*world.bodies[handle].position(), pose);
        assert_eq!(world.vehicles["test"].body, handle);
        assert_eq!(world.colliders.len(), count);
        assert_eq!(world.vehicles["test"].config.mass, config_for_vehicle("ae86").unwrap().mass);
    }

    #[test]
    fn a_vehicle_that_does_not_fit_is_rejected_before_changing_the_old_car() {
        let mut world = flat_world();
        let handle = world.spawn_vehicle_for_player("test".into(), [0.0; 3], "ae86", "red").unwrap();
        let old = world.vehicles["test"].config;
        let target = config_for_vehicle("tank").unwrap();
        assert!(target.chassis_half_extents[0] > old.chassis_half_extents[0]);
        let pose = *world.bodies[handle].position();
        let wall_x = pose.translation.x + (old.chassis_half_extents[0] + target.chassis_half_extents[0]) * 0.5;
        world.colliders.insert(ColliderBuilder::cuboid(0.02, 3.0, 0.5)
            .translation(vector![wall_x, pose.translation.y, pose.translation.z]).build());
        let error = world.change_vehicle_for_player("test", "tank").unwrap_err();
        assert!(error.contains("Not enough room"));
        assert_eq!(*world.bodies[handle].position(), pose);
        assert_eq!(world.vehicles["test"].config.mass, old.mass);
        assert_eq!(world.vehicles["test"].body, handle);
    }

    #[test]
    fn handling_com_does_not_move_the_collision_box_or_double_vehicle_mass() {
        for id in ["ae86", "gt86", "brz", "camaro", "supra", "tank"] {
            let mut world = flat_world();
            let handle = world.spawn_vehicle_for_player("test".into(), [0.0; 3], id, "red").unwrap();
            let config = world.vehicles["test"].config;
            let body = &world.bodies[handle];
            assert!((body.mass() - config.mass).abs() < config.mass * 1.0e-5);
            assert!((body.center_of_mass().y - 0.32 - config.center_of_mass_height).abs() < 1.0e-5);
            assert!((body.translation().y - config.nominal_chassis_y(0.32)).abs() < 1.0e-5);
            let collider = &world.colliders[body.colliders()[0]];
            assert!((collider.translation().y - body.translation().y
                - config.chassis_com_offset[1]).abs() < 1.0e-5);
        }
    }

    #[derive(Debug)]
    struct TurnSample {
        peak_roll_deg: f32,
        contact_loss_frames: usize,
        peak_lateral_g: f32,
    }

    fn cornering_sample(id: &str, steer: f32, legacy_com: bool) -> TurnSample {
        let mut world = flat_world();
        let handle = world.spawn_vehicle_for_player("test".into(), [0.0; 3], id, "red").unwrap();
        if legacy_com {
            let mut config = world.vehicles["test"].config;
            config.center_of_mass_height = config.nominal_chassis_y(0.0) + config.chassis_com_offset[1];
            world.bodies[handle].set_additional_mass_properties(config.mass_properties(), true);
            world.bodies[handle].recompute_mass_properties_from_colliders(&world.colliders);
        }
        for _ in 0..120 { world.step(SIMULATION_DT); }
        world.bodies[handle].set_linvel(vector![0.0, 0.0, 20.0], true);
        world.vehicles.get_mut("test").unwrap().steer = steer;
        let mut result = TurnSample { peak_roll_deg: 0.0, contact_loss_frames: 0, peak_lateral_g: 0.0 };
        for _ in 0..300 {
            let before = *world.bodies[handle].linvel();
            world.step(SIMULATION_DT);
            let body = &world.bodies[handle];
            let right = body.rotation() * Vector::x();
            let up = body.rotation() * Vector::y();
            let roll = right.y.atan2(up.y).to_degrees().abs();
            result.peak_roll_deg = result.peak_roll_deg.max(roll);
            result.contact_loss_frames += usize::from(world.wheels[&handle].iter().any(|w| !w.grounded));
            let acceleration = (body.linvel() - before) / SIMULATION_DT;
            let lateral_g = (body.rotation().inverse() * acceleration).x.abs() / 9.81;
            result.peak_lateral_g = result.peak_lateral_g.max(lateral_g);
        }
        result
    }

    #[test]
    fn sports_car_turns_reduce_roll_in_both_directions_without_losing_contact() {
        for id in ["ae86", "gt86", "brz", "camaro", "supra"] {
            for steer in [-0.2, 0.2] {
                let old = cornering_sample(id, steer, true);
                let new = cornering_sample(id, steer, false);
                println!("{id} steer={steer}: old={old:?}, new={new:?}");
                assert!(new.peak_roll_deg.is_finite());
                assert!(new.peak_roll_deg < old.peak_roll_deg * 0.75, "{id}: {old:?} -> {new:?}");
                assert!(new.peak_roll_deg < 4.0, "{id}: {new:?}");
                assert_eq!(new.contact_loss_frames, 0, "{id}: {new:?}");
                assert!(new.peak_lateral_g > 0.3, "{id}: turn did not exercise lateral grip");
            }
        }
    }

    #[test]
    fn impact_guard_still_settles_a_half_meter_drop_without_freezing_roll() {
        for id in ["ae86", "gt86", "brz", "camaro", "supra", "tank"] {
            let mut world = flat_world();
            let handle = world.spawn_vehicle_for_player("test".into(), [0.0; 3], id, "red").unwrap();
            let nominal_y = world.vehicles["test"].config.nominal_chassis_y(0.32);
            world.bodies[handle].set_translation(vector![0.0, nominal_y + 0.5, 0.0], true);
            for _ in 0..300 { world.step(SIMULATION_DT); }
            let body = &world.bodies[handle];
            assert!((body.translation().y - nominal_y).abs() < 0.03, "{id}");
            assert!((body.rotation() * Vector::y()).y > 0.99, "{id}");
            assert!(world.wheels[&handle].iter().all(|w| w.grounded), "{id}");
        }
    }

    #[test]
    fn a_scraping_chassis_does_not_add_a_second_tire_friction_model() {
        let mut world = flat_world();
        let handle = world.spawn_vehicle_for_player("test".into(), [0.0; 3], "ae86", "red").unwrap();
        // Isolate Rapier contacts: wheels must not contribute support or grip.
        world.wheels.clear();
        let config = world.vehicles["test"].config;
        let body = &mut world.bodies[handle];
        body.set_translation(vector![0.0, 0.32 + config.chassis_half_extents[1]
            - config.chassis_com_offset[1] + 0.001, 0.0], true);
        body.set_linvel(vector![10.0, 0.0, 0.0], true);
        let dt = 1.0 / 120.0;
        for _ in 0..120 { world.step_substep(dt); }
        // Only the configured linear damping may slow horizontal motion.
        // Average(0, 1.2) friction would cause a large extra speed loss here.
        let damping_only = 10.0 / (1.0 + config.linear_damping * dt).powi(120);
        assert!((world.bodies[handle].linvel().x - damping_only).abs() < 0.02);
        assert!((world.bodies[handle].translation().y
            - (0.32 + config.chassis_half_extents[1] - config.chassis_com_offset[1])).abs() < 0.03);
    }
}

#[cfg(test)]
mod editor_service_tests {
    use super::*;
    #[test]
    fn authored_bays_service_only_their_resource_and_require_a_stopped_vehicle() {
        for kind in ["fuel-station", "repair-shop", "service-center"] {
            let mut value:serde_json::Value=serde_json::from_str(include_str!("assets/blocks/road_precision_colliders.json")).unwrap();
            value["authored_layout"]=serde_json::json!({"format":"avenlab-world-layout","version":1,"map_id":"road_precision","title":"Service test","base":"replace","ground":true,"repeat":false,"objects":[{
                "id":"test-bay","name":"Service bay","piece":kind,"position":[0,0,0],"size":[14,5,16],"yaw":90,"color":"#82b3a0","locked":false,"solid":false,"parts":[{"shape":"box","position":[0,0,0],"size":[1,1,1],"solid":false}]
            }]});
            let mut world=PhysicsWorld::from_editor_document(serde_json::from_value(value).unwrap()).unwrap();
            let handle=world.spawn_vehicle_for_player("test".into(),[0.0;3],"brz","red").unwrap();
            world.bodies[handle].set_translation(vector![0.0,1.0,0.0],true);
            let state=&mut world.vehicles.get_mut("test").unwrap().powertrain;
            state.fuel_liters=1.0; state.condition=0.5;state.nos_remaining_s=0.0;
            world.service_authored_bays(1.0);
            let state=&world.vehicles["test"].powertrain;
            assert_eq!(state.fuel_liters,if kind=="repair-shop" {1.0} else {4.0});
            assert_eq!(state.nos_remaining_s,if kind=="repair-shop" {0.0}else{1.5});
            assert!((state.condition-if kind=="fuel-station" {0.5} else {0.56}).abs()<0.0001);
            let fuel=state.fuel_liters; let condition=state.condition;
            world.bodies[handle].set_linvel(vector![1.0,0.0,0.0],true);
            world.service_authored_bays(1.0);
            assert_eq!(world.vehicles["test"].powertrain.fuel_liters,fuel);
            assert_eq!(world.vehicles["test"].powertrain.condition,condition);
            world.bodies[handle].set_linvel(Vector::zeros(),true);
            world.asset_health.insert("test-bay".into(),0.0);
            world.service_authored_bays(1.0);
            assert_eq!(world.vehicles["test"].powertrain.nos_remaining_s,if kind=="repair-shop"{0.0}else{1.5});
            world.bodies[handle].set_translation(vector![50.0,1.0,0.0],true);
            world.service_authored_bays(1.0);
            assert_eq!(world.vehicles["test"].powertrain.fuel_liters,fuel);
            assert_eq!(world.vehicles["test"].powertrain.condition,condition);
        }
    }
}

#[cfg(test)]
mod combat_structure_tests {
    use super::*;
    #[test]
    fn practice_wall_loses_health_and_collision_after_server_hits() {
        let mut value:serde_json::Value=serde_json::from_str(include_str!("assets/blocks/coastal_district_colliders.json")).unwrap();
        value["team_spawns"]=serde_json::json!({"red":[{"chunk":[0,0],"local":[0,0],"yaw":0,"surface_y":0}],"blue":[{"chunk":[0,0],"local":[10,0],"yaw":0,"surface_y":0}]});
        value["authored_layout"]=serde_json::json!({"format":"avenlab-world-layout","version":1,"map_id":"coastal_district","title":"Combat test","base":"replace","ground":true,"repeat":false,"objects":[{"id":"test-wall","name":"Practice wall","piece":"wall","position":[0,0,-20],"size":[8,4,0.5],"yaw":0,"color":"#888888","locked":false,"solid":true,"parts":[{"shape":"box","position":[0,0.5,0],"size":[1,1,1],"solid":true}],"destruction":{"enabled":true,"hp":40,"smallArms":1,"cannon":1,"bomb":1.5,"rubble":"clear"}}]});
        let mut physics=PhysicsWorld::from_editor_document(serde_json::from_value(value).unwrap()).unwrap();
        physics.spawn_vehicle_for_player("shooter".into(),[0.0;3],"brz","red").unwrap();
        let pose=crate::state::CombatPose{enabled:true,fire:true,yaw:0.0,pitch:0.0,x:0.0,y:1.0,z:0.0,role:"assault".into(),..Default::default()};
        for seq in 0..300 {physics.combat_tick("shooter",seq,Some(&pose));}
        assert_eq!(physics.asset_health.get("test-wall"),Some(&0.0));
        for (_,body) in physics.bodies.iter().filter(|(_,body)|body.user_data==1) {
            assert!(body.colliders().iter().all(|h|!physics.colliders[*h].is_enabled()));
        }
    }
}

#[cfg(test)]mod ram_structure_tests{
 use super::*;
 #[test]fn ram_damages_destructible_walls_once_and_protects_permanent_land(){
  fn charge(piece:&str,enabled:bool)->Option<f32>{
   let mut value:serde_json::Value=serde_json::from_str(include_str!("assets/blocks/coastal_district_colliders.json")).unwrap();
   value["team_spawns"]=serde_json::json!({"red":[{"chunk":[0,0],"local":[0,0],"yaw":0,"surface_y":0}],"blue":[]});
   value["authored_layout"]=serde_json::json!({"format":"avenlab-world-layout","version":1,"map_id":"coastal_district","title":"Ram range","base":"replace","ground":true,"repeat":false,"objects":[{"id":"ram-wall","name":"Ram wall","piece":piece,"position":[0,0,10],"size":[8,4,0.5],"yaw":0,"color":"#888888","locked":false,"solid":true,"parts":[{"shape":"box","position":[0,0.5,0],"size":[1,1,1],"solid":true}],"destruction":{"enabled":enabled,"hp":200,"smallArms":1,"cannon":1,"bomb":1.5,"rubble":"clear"}}]});
   let mut w=PhysicsWorld::from_editor_document(serde_json::from_value(value).unwrap()).unwrap();w.spawn_vehicle_for_player("tank".into(),[0.0;3],"tank","red").unwrap();
   w.vehicles.get_mut("tank").unwrap().powertrain.engine_requested=true;
   for _ in 0..180{w.step(SIMULATION_DT);}
   {let v=w.vehicles.get_mut("tank").unwrap();v.powertrain.gear=1;v.ram.remaining=crate::ram::DURATION;v.ram.cooldown=crate::ram::COOLDOWN;}
   for _ in 0..180{w.step(SIMULATION_DT);}
   w.asset_health.get("ram-wall").copied()
  }
  assert_eq!(charge("wall",true),Some(50.0));
  assert_eq!(charge("wall",false),None);
  assert_eq!(charge("coastal-land-bridge",false),None);
 }
}

#[cfg(test)]mod barrier_weight_tests{
 use super::*;
 fn impact(vehicle:&str,destructible:bool,speed:f32)->Option<f32>{
  let mut value:serde_json::Value=serde_json::from_str(include_str!("assets/blocks/coastal_district_colliders.json")).unwrap();
  value["team_spawns"]=serde_json::json!({"red":[{"chunk":[0,0],"local":[0,0],"yaw":0,"surface_y":0}],"blue":[]});
  value["authored_layout"]=serde_json::json!({"format":"avenlab-world-layout","version":1,"map_id":"coastal_district","title":"Rail impact range","base":"replace","ground":true,"repeat":false,"objects":[{"id":"edge-rail","name":"Bridge edge rail","piece":"barrier","position":[0,0,8],"size":[16,2,0.5],"yaw":0,"color":"#888888","locked":false,"solid":true,"parts":[{"shape":"box","position":[0,0.5,0],"size":[1,1,1],"solid":true}],"destruction":{"enabled":destructible,"hp":100,"smallArms":1,"cannon":1,"bomb":1.5,"rubble":"clear"}}]});
  let mut w=PhysicsWorld::from_editor_document(serde_json::from_value(value).unwrap()).unwrap();let body=w.spawn_vehicle_for_player("driver".into(),[0.0;3],vehicle,"red").unwrap();
  for _ in 0..180{w.step(SIMULATION_DT);}
  w.bodies[body].set_linvel(Vector::new(0.0,0.0,speed),true);
  for _ in 0..120{w.step(SIMULATION_DT);}
  let hp=w.asset_health.get("edge-rail").copied();
  if hp==Some(0.0){assert!(w.bodies.iter().filter(|(_,b)|b.user_data==1).all(|(_,b)|b.colliders().iter().all(|h|!w.colliders[*h].is_enabled())));}
  hp
 }
 #[test]fn heavy_tank_breaks_an_authored_edge_rail_without_ram_while_light_car_does_less(){
  assert_eq!(impact("tank",true,10.0),Some(0.0));
  assert!(impact("brz",true,10.0).unwrap_or(100.0)>50.0);
  assert_eq!(impact("tank",false,10.0),None);
  assert_eq!(impact("tank",true,0.0),None);
 }
}

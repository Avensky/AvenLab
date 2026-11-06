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
use std::collections::{HashMap, HashSet};
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
    pub tire_thermals: bool,
    pub(crate) tire_sample_elapsed: f32,
    pub barrages: HashMap<String,crate::tank_barrage::Barrage>,
    pub trusted_heroes: HashMap<String,String>,
    pub guard_boosts: HashMap<String,crate::guard_boost::GuardBoostState>,
    pub(crate) guard_impact_directions: HashMap<String,Vector<Real>>,
    pub support: crate::support::SupportState,
    pub ctf_carriers: HashSet<String>,
    pub(crate) dislodged_carriers: HashSet<String>,
    pub(crate) ctf_reset_players: HashSet<String>,
    pub vehicle_health:HashMap<String,crate::vehicle_health::VehicleHealth>,
    barrier_impacts:HashMap<(RigidBodyHandle,RigidBodyHandle),f32>,
    pub asset_health: HashMap<String,f32>,
    pub combat_poses: HashMap<String,crate::state::CombatPose>,
    tank_colliders: HashMap<String,(ColliderHandle,ColliderHandle)>,
    pub(crate) combat_sequences: HashMap<String,(u32,std::time::Instant)>,
    pub(crate) combat_cooldowns: HashMap<String,f32>,
    pub gravity: Vector<Real>, // gravity vector
    pub pipeline: PhysicsPipeline, // physics pipeline
    pub island_manager: IslandManager, // manages islands of bodies
    pub broad_phase: DefaultBroadPhase, // broad-phase collision detection
    pub narrow_phase: NarrowPhase, // collision detection
    pub bodies: RigidBodySet, // for rigid bodies
    pub colliders: ColliderSet, // for collision shapes
    pub block_world: BlockColliderWorld, // for block-based colliders
    chunks_ready: bool,
    service_bays: Vec<usize>,
    serviced_home: std::collections::HashSet<String>,
    pub(crate) coast:Option<crate::harbor::Coast>,
    pub bridge_motion: Option<crate::harbor::BridgeMotion>,
    bridge_tick: u64,
    drawbridges: Vec<(RigidBodyHandle, Isometry<Real>)>,
    has_impact_barriers: bool,
    map_json: std::sync::OnceLock<String>,
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

pub(crate) fn vehicle_collision_groups(downed: bool) -> InteractionGroups {
    InteractionGroups::new(GROUP_CHASSIS, if downed { GROUP_GROUND } else { GROUP_GROUND | GROUP_CHASSIS })
}

// Playtest tuning for hull and mechanical wear. Rapier resolves the full shove.
const FRIENDLY_CRASH_DAMAGE_FACTOR: f32 = 0.20;
const FRIENDLY_SHOVE_WINDOW_S: f32 = 0.45;

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

    fn install_map(&mut self, map: Arc<BlockColliderFile>) {
        self.drawbridges.clear();
        self.bridge_tick=0;
        self.bridge_motion=map.authored_layout.as_ref().filter(|l|
            l.objects.iter().any(|o|o.piece=="bridge-lever") && l.objects.iter().any(|o|o.piece=="canal-lift")).map(|_|Default::default());
        self.service_bays.clear();
        self.serviced_home.clear();
        self.coast=crate::harbor::Coast::from_map(&map);
        self.has_impact_barriers = false;
        if let Some(layout) = &map.authored_layout {
            for (index, object) in layout.objects.iter().enumerate() {
                if matches!(object.piece.as_str(), "fuel-station" | "repair-shop" | "service-center") {
                    self.service_bays.push(index);
                }
                self.has_impact_barriers |= !layout.repeat && object.destruction.as_ref().is_some_and(|d| d.enabled) && matches!(object.piece.as_str(), "barrier" | "highway-guardrail" | "breakaway-glass" | "downtown-metal-barrier");
            }
        }
        self.active_map = Some(map);
    }

    /// Rebuild the small world index at query boundaries. Repeated incremental
    /// rebalance of overlapping city/vehicle AABBs can create very long combat
    /// ticks. A rebuild has predictable cost and still includes every collider.
    fn synchronize_queries(&mut self) {
        self.query_pipeline.update(&self.colliders);
    }

    pub fn active_map_id(&self) -> Option<&str> {
        self.active_map
            .as_ref()
            .map(|map| map.map_id.as_str())
    }

    /// Map data is identical for peers joining the same tile set. Only the
    /// room envelope is per delivery, including after an editor replacement.
    pub fn map_snapshot_packet(&self, room_id: usize) -> String {
        let data = self.map_json.get_or_init(|| serde_json::json!(self.map_snapshot()).to_string());
        format!(r#"{{"type":"map_snapshot","world_id":{room_id},"data":{data}}}"#)
    }

    pub fn map_snapshot(&self) -> Option<MapSnapshot> {
        let map = self.active_map.as_ref()?;

        Some(map.snapshot(&self.block_world))
    }

    /// Flags use authored team spawn anchors in the same coordinate system as bodies.
    pub fn ctf_bases(&self) -> Result<[[f32;3];2], String> {
        let map=self.active_map.as_ref().ok_or("Select a map before preparing CTF")?;
        let point=|team: &str, spawns:&Vec<crate::world::block_colliders::MapSpawnPoint>|->Result<[f32;3],String>{
            if let Some(marker) = map.dock_flag(team) {
                let [x, z] = map.authored_anchor();
                let [mx, y, mz] = marker.position;
                return Ok([x as f32 * map.cell[0] + mx, y + 1.0, z as f32 * map.cell[1] + mz]);
            }
            let p=spawns.first().ok_or("This map needs authored red and blue spawn zones for CTF")?;
            Ok([p.chunk[0] as f32*map.cell[0]+p.local[0],p.surface_y.unwrap_or(map.surface.road_y)+1.0,p.chunk[1] as f32*map.cell[1]+p.local[1]])
        };
        Ok([point("red", &map.team_spawns.red)?, point("blue", &map.team_spawns.blue)?])
    }
    /// Claim each authored home pad once, independently of where a car drove
    /// during warmup. Validate the entire formation before touching any body.
    fn kickoff_formation(&self) -> Result<Vec<(String, Isometry<Real>, Real)>, String> {
        let map = self.active_map.as_ref().ok_or("No CTF map selected")?;
        let mut drivers: Vec<_> = self.vehicles.iter().collect();
        drivers.sort_unstable_by_key(|(id, _)| id.as_str());
        let mut pads = [map.team_spawns.red.iter(), map.team_spawns.blue.iter()];
        let mut formation = Vec::with_capacity(drivers.len());
        for (id, vehicle) in drivers {
            if !self.bodies.contains(vehicle.body) { return Err(format!("Missing body for {id}")); }
            let team = match vehicle.team.as_str() {
                "red" => 0, "blue" => 1, _ => return Err("Unknown CTF team".into()),
            };
            let pad = pads[team].next().ok_or_else(|| format!("Too few {} home pads", vehicle.team))?;
            let road = pad.surface_y.unwrap_or(map.surface.road_y);
            let config = vehicle.config;
            let y = config.spawn_height(road);
            let [x,z] = pad.world_xz(map.cell);
            let pose = Isometry::new(vector![x,y,z], vector![0.0,pad.yaw,0.0]);
            formation.push((id.clone(),pose,road));
        }
        Ok(formation)
    }

    /// Start is a single world transition: no warm-up health, fuel or held inputs
    /// survive into the scored round. Each car begins on a separate pad at its own base.
    pub fn prepare_ctf_round(&mut self) -> Result<(), String> {
        if self.vehicles.is_empty(){return Err("Spawn both teams before starting.".into());}
        let formation = self.kickoff_formation()?;
        for (id,pose,road) in formation {
            let v = self.vehicles.get_mut(&id).unwrap();
            self.spawn_poses.insert(id.clone(), (pose,road));
            let body = self.bodies.get_mut(v.body).unwrap();
            body.set_enabled(true);
            body.set_position(pose,true);
            body.set_linvel(Vector::zeros(),true);
            body.set_angvel(Vector::zeros(),true);
            body.reset_forces(true);
            body.reset_torques(true);
            for handle in body.colliders() {
                if let Some(collider) = self.colliders.get_mut(*handle) { collider.set_collision_groups(vehicle_collision_groups(false)); collider.set_enabled(true); }
            }
            v.powertrain=Powertrain::new(v.config.resources);v.cockpit=crate::cockpit::Cockpit::default();v.ram=crate::ram::RamState::default();
            v.throttle=0.0;v.steer=0.0;v.brake=0.0;v.handbrake=0.0;v.pitch=0.0;v.yaw=0.0;v.roll=0.0;v.ascend=0.0;
            v.player_flags=0;v.vehicle_flags=VehicleStateFlags::ENGINE_ON;v.steer_angle=0.0;v.steer_rate=0.0;v.steering=SteeringState::default();
            self.vehicle_health.insert(id,crate::vehicle_health::VehicleHealth::new(v.config.hull_hp));
            let (handle,config) = (v.body,v.config);
            self.register_vehicle(handle,config);
        }
        self.barrages.clear();self.guard_boosts.clear();self.guard_impact_directions.clear();self.support.reset();
        self.combat_poses.clear();self.combat_sequences.clear();self.combat_cooldowns.clear();self.ctf_carriers.clear();self.dislodged_carriers.clear();self.ctf_reset_players.clear();self.falling_seconds.clear();
        self.update_loaded_blocks_around_players();
        self.refresh_vehicle_wheel_snapshots();
        self.bodies.propagate_modified_body_positions_to_colliders(&mut self.colliders);self.query_pipeline.update(&self.colliders);Ok(())
    }

    /// Fresh isolated editor physics, constructed before replacing its old runtime.
    pub fn from_editor_document(file: crate::world::block_colliders::BlockColliderFile) -> anyhow::Result<Self> {
        let file=crate::world::block_colliders::validate_block_collider_file(file)?;
        let mut world=Self::new();world.block_world.tile_size=Some(file.cell);world.install_map(Arc::new(file));world.update_loaded_blocks_around_players();Ok(world)
    }

    pub fn for_harbor_room(world:usize,map:&str)->anyhow::Result<Self>{
        let file=Self::map_definition_path(map)?;
        let mut file=load_block_collider_file(file.to_string_lossy().to_string())?;
        crate::harbor::place_services(world,&mut file);
        Self::from_editor_document(file)
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
        self.barrages.clear();
        self.map_json.take();
        self.chunks_ready = false;
        self.install_map(requested);

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
        // Both current layout modes use a fixed initial tile set. Reconcile only
        // after loading a map or explicitly adding/removing a tile.
        if self.chunks_ready { return; }
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

        let mut ready = true;
        for (bx, bz) in wanted {
            if let Err(error) = self.load_block(bx, bz) {
                ready = false;
                eprintln!(
                    "⚠️ Failed to load map chunk ({bx},{bz}): {error}"
                );
            }
        }
        self.chunks_ready = ready;
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

        if let Some(layout)=file.authored_layout.as_ref() {
            for handle in &handles {
                let body=&self.bodies[*handle];
                if body.user_data.checked_sub(1).and_then(|i|layout.objects.get(i as usize)).is_some_and(|o|o.piece=="canal-lift") {
                    self.drawbridges.push((*handle,*body.position()));
                }
            }
        }
        // Restore destruction only for newly created bodies, before their first tick.
        if let Some(layout) = file.authored_layout.as_ref().filter(|layout| !layout.repeat && !self.asset_health.is_empty()) {
            for handle in &handles {
                let body = &self.bodies[*handle];
                let object = body.user_data.checked_sub(1).and_then(|i| layout.objects.get(i as usize));
                if object.is_some_and(|o| self.asset_health.get(&o.id) == Some(&0.0)) {
                    for collider in body.colliders() { self.colliders[*collider].set_enabled(false); }
                }
            }
        }
        self.map_json.take();
        self.chunks_ready = false;
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

    pub fn operate_bridge(&mut self,player:&str,command:&str,tick:u64)->Result<(),String>{
        let vehicle=self.vehicles.get(player).ok_or("Deploy a vehicle to use the bridge lever.")?;
        if self.is_defeated(player){return Err("Recover your vehicle first.".into());}
        let p=self.bodies[vehicle.body].translation();
        let map=self.active_map.as_ref().ok_or("No active map.")?;
        let layout=map.authored_layout.as_ref().ok_or("No bridge lever on this map.")?;
        let [cx,cz]=map.authored_anchor();
        let nearby=layout.objects.iter().filter(|o|o.piece=="bridge-lever").any(|o|{
            let [x,y,z]=o.position;
            (p.x-x-cx as f32*map.cell[0]).hypot(p.z-z-cz as f32*map.cell[1])<=14.0 && (p.y-y).abs()<=4.0
        });
        if !nearby{return Err("Drive to a bridge lever on either bank.".into());}
        let bridge=self.bridge_motion.as_mut().ok_or("No controlled drawbridge.")?;
        match command{
            "repair"=>{
                let Some(id)=bridge.broken.as_deref()else{return Ok(())};
                let index=layout.objects.iter().position(|o|o.id==id).ok_or("Damaged span unavailable.")?;
                self.asset_health.remove(id);
                for (handle,_) in &self.drawbridges {
                    if let Some(body)=self.bodies.get(*handle).filter(|body|body.user_data==(index+1) as u128) {
                        for collider in body.colliders(){self.colliders[*collider].set_enabled(true);}
                    }
                }
                bridge.broken=None;bridge.select(tick,crate::harbor::RAMP_ANGLE);
                self.synchronize_queries();
            }
            "raise"|"lower"=>{
                if bridge.broken.is_some(){return Err("Repair the fallen span to release the lever.".into());}
                bridge.request(tick,if command=="raise"{crate::harbor::RAMP_ANGLE}else{0.})?;
            }
            _=>return Err("Unknown bridge control.".into()),
        }
        Ok(())
    }

    pub fn move_drawbridges(&mut self,tick:u64) {
        if self.drawbridges.is_empty(){return;}
        self.bridge_tick=tick;
        let angle=self.bridge_motion.as_ref().map_or_else(||crate::harbor::lift_angle(tick),|bridge|bridge.angle(tick));
        self.drawbridges.retain(|(id,base)|{
            let Some(body)=self.bodies.get_mut(*id) else{return false};
            let pose=*base * Isometry::rotation(vector![0.,0.,angle]);
            body.set_next_kinematic_position(pose);
            true
        });
    }

    pub fn unload_block(&mut self, bx: i32, by: i32) {
        self.map_json.take();
        self.chunks_ready = false;
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
        if old==new{return self.vehicles.contains_key(old);}
        if self.vehicles.contains_key(new){return false;}
        let Some(mut vehicle)=self.vehicles.remove(old) else{return false};
        vehicle.throttle=0.0;vehicle.steer=0.0;vehicle.brake=0.0;vehicle.handbrake=0.0;
        self.body_to_player.insert(vehicle.body,new.into());self.vehicles.insert(new.into(),vehicle);
        if self.serviced_home.remove(old) {self.serviced_home.insert(new.into());}
        self.barrages.remove(old);
        if let Some(v)=self.trusted_heroes.remove(old){self.trusted_heroes.insert(new.into(),v);}
        if let Some(mut v)=self.guard_boosts.remove(old){v.remaining=0.0;v.dive_remaining=0.0;if v.kind!="tank_barrier"{v.shield_hp=0.0;}self.guard_boosts.insert(new.into(),v);}
        self.guard_impact_directions.remove(old);self.support.reassign(old,new);
        if let Some(v)=self.vehicle_health.remove(old){self.vehicle_health.insert(new.into(),v);}
        for health in self.vehicle_health.values_mut(){health.reassign_contributor(old,new);}
        for weapon in ["coax","basket"] {
            if let Some(v)=self.combat_cooldowns.remove(&format!("{old}:{weapon}")){self.combat_cooldowns.insert(format!("{new}:{weapon}"),v);}
        }
        if let Some(v)=self.combat_poses.remove(old){self.combat_poses.insert(new.into(),v);}
        if let Some(v)=self.tank_colliders.remove(old){self.tank_colliders.insert(new.into(),v);}
        if let Some(v)=self.combat_cooldowns.remove(old){self.combat_cooldowns.insert(new.into(),v);}
        if let Some(v)=self.spawn_poses.remove(old){self.spawn_poses.insert(new.into(),v);}
        if let Some(v)=self.falling_seconds.remove(old){self.falling_seconds.insert(new.into(),v);}
        self.ctf_carriers.remove(old);self.dislodged_carriers.remove(old);self.ctf_reset_players.remove(old);self.ctf_reset_players.insert(new.into());
        self.combat_sequences.remove(old);true
    }

    pub fn despawn_vehicle_for_player(&mut self, player_id: &str) {
        self.serviced_home.remove(player_id);
        self.barrages.remove(player_id);self.trusted_heroes.remove(player_id);self.guard_boosts.remove(player_id);self.guard_impact_directions.remove(player_id);self.support.clear_player(player_id);
        self.ctf_carriers.remove(player_id);self.dislodged_carriers.remove(player_id);self.ctf_reset_players.remove(player_id);
        self.vehicle_health.remove(player_id);
        for health in self.vehicle_health.values_mut(){health.remove_contributor(player_id);}
        self.combat_poses.remove(player_id);self.combat_sequences.remove(player_id);
        self.combat_cooldowns.remove(player_id);
        for weapon in ["coax","basket"]{self.combat_cooldowns.remove(&format!("{player_id}:{weapon}"));}
        self.tank_colliders.remove(player_id);
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
            barrages: HashMap::new(),trusted_heroes: HashMap::new(), guard_boosts: HashMap::new(), guard_impact_directions: HashMap::new(), support: Default::default(),
            ctf_carriers: HashSet::new(), dislodged_carriers: HashSet::new(), ctf_reset_players: HashSet::new(),
            combat_poses: HashMap::new(),tank_colliders: HashMap::new(),
            barrier_impacts:HashMap::new(),asset_health: HashMap::new(), combat_sequences: HashMap::new(), combat_cooldowns: HashMap::new(),
            gravity,
            tire_thermals: false, tire_sample_elapsed: 0.0,
            pipeline: PhysicsPipeline::new(),
            island_manager: IslandManager::new(),
            broad_phase: DefaultBroadPhase::new(),
            narrow_phase: NarrowPhase::new(),
            bodies,
            colliders,
            block_world: BlockColliderWorld::new(),
            chunks_ready: false,
            service_bays: Vec::new(),
            serviced_home: Default::default(),
            coast:None,
            drawbridges: Vec::new(), bridge_motion:None, bridge_tick:0,
            has_impact_barriers: false,
            map_json: Default::default(),
            active_map: None,
            joints: ImpulseJointSet::new(),
            multibody_joints: MultibodyJointSet::new(),
            ccd: CCDSolver::new(),
            query_pipeline: QueryPipeline::new(),
            wheels:  HashMap::new(),
            vehicles: HashMap::new(),
            body_to_player: HashMap::new(),
            vehicle_health:HashMap::new(),
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
        if self.is_defeated(player){return;}
        let Some(vehicle)=self.vehicles.get(player) else {return;};
        let body_handle=vehicle.body;let config=vehicle.config;
        let Some(body)=self.bodies.get(body_handle) else {return;};
        let hull=*body.position();
        let forward=hull.rotation*Vector::z();let hull_yaw=forward.x.atan2(forward.z);
        let entry=self.combat_sequences.entry(player.to_owned()).or_insert((seq,std::time::Instant::now()));
        if entry.0!=seq {*entry=(seq,std::time::Instant::now());}
        let fresh=entry.1.elapsed().as_millis()<=250;
        let spray=self.assigned_hero(player)==Some("cx30");
        let mut target=intent.map(|c|c.bounded()).unwrap_or_default();
        if self.assigned_hero(player)==Some("mechanic"){target.fire=false;target.ram=false;}
        if let Some(vehicle)=self.vehicles.get_mut(player){
            vehicle.ram.requested=target.ram&&fresh&&target.enabled;
            if !fresh||!target.enabled{vehicle.ram.cancel();}
        }
        let mut c=self.combat_poses.get(player).cloned().unwrap_or_else(||crate::state::CombatPose{yaw:hull_yaw+std::f32::consts::PI,ammo:1,..Default::default()});
        let barraging=self.barrages.contains_key(player);
        if barraging {
            target.fire=false;target.hull_locked=false;
            target.yaw=c.yaw;target.pitch=c.pitch;target.enabled=true;
        }
        let manual_lock=target.hull_locked && target.lock_target.is_some();
        let forward_assist=self.assigned_hero(player)==Some("brz");
        let hull_lock=target.hull_locked && (manual_lock || (!spray && !forward_assist));
        let (min_pitch,max_pitch)=if config.tracked {(-0.174533,0.349066)} else {
            (-std::f32::consts::FRAC_PI_4,std::f32::consts::FRAC_PI_4)
        };
        let locking = hull_lock && !c.hull_locked;
        if locking {
            let current = vector![-c.yaw.sin()*c.pitch.cos(), c.pitch.sin(), -c.yaw.cos()*c.pitch.cos()];
            let local = hull.rotation.inverse()*current;
            c.lock_yaw = local.x.atan2(local.z);
            c.lock_pitch = local.y.atan2(local.x.hypot(local.z)).clamp(min_pitch,max_pitch);
        }
        c.hull_locked=hull_lock;
        c.enabled=target.enabled&&fresh&&self.vehicles.get(player).is_some_and(|v|v.ram.stun_remaining<=0.0);c.fire=target.fire&&c.enabled;c.ram=target.ram&&c.enabled;
        let previous_target=c.assisted_target.take();
        if c.enabled && target.hull_locked && !manual_lock && forward_assist {
            let muzzle=hull*point![0.0,config.chassis_com_offset[1]+config.chassis_half_extents[1]+0.05,0.0];
            if let Some((id,aim))=self.forward_target(player,previous_target.as_deref(),muzzle,forward) {
                target.yaw=(-aim.x).atan2(-aim.z);target.pitch=aim.y.clamp(-1.0,1.0).asin();
                c.assisted_target=Some(id);
            }
        }
        if c.enabled && !c.hull_locked {
            let delta=(target.yaw-c.yaw).sin().atan2((target.yaw-c.yaw).cos());
            let rate=if config.tracked {2.6}else{3.0};
            c.yaw+=delta.clamp(-rate*SIMULATION_DT,rate*SIMULATION_DT);
            c.pitch+=(target.pitch-c.pitch).clamp(-0.8*SIMULATION_DT,0.8*SIMULATION_DT);
        }
        c.yaw=c.yaw.sin().atan2(c.yaw.cos());
        c.role=if config.tracked {"tank".into()}else{target.role.clone()};
        let mut direction=vector![-c.yaw.sin()*c.pitch.cos(),c.pitch.sin(),-c.yaw.cos()*c.pitch.cos()];
        if c.hull_locked {
            if let Some([yaw,pitch])=target.lock_target.filter(|_|c.enabled) {
                let slew=if config.tracked {2.6}else{3.0}*SIMULATION_DT;
                let delta=yaw-c.lock_yaw;
                c.lock_yaw+=delta.sin().atan2(delta.cos()).clamp(-slew,slew);
                c.lock_yaw=c.lock_yaw.sin().atan2(c.lock_yaw.cos());
                c.lock_pitch+=(pitch.clamp(min_pitch,max_pitch)-c.lock_pitch).clamp(-0.8*SIMULATION_DT,0.8*SIMULATION_DT);
            }
            direction=hull.rotation*vector![c.lock_yaw.sin()*c.lock_pitch.cos(),c.lock_pitch.sin(),c.lock_yaw.cos()*c.lock_pitch.cos()];
            c.yaw=(-direction.x).atan2(-direction.z);c.pitch=direction.y.clamp(-1.0,1.0).asin();
        }
        if config.tracked {
            let local=hull.rotation.inverse()*direction;
            let yaw=if c.hull_locked {c.lock_yaw}else{local.x.atan2(local.z)};
            let elevation=if c.hull_locked {c.lock_pitch}else{local.y.atan2((local.x*local.x+local.z*local.z).sqrt()).clamp(-0.174533,0.349066)};
            direction=hull.rotation*vector![yaw.sin()*elevation.cos(),elevation.sin(),yaw.cos()*elevation.cos()];
            c.yaw=(-direction.x).atan2(-direction.z);c.pitch=direction.y.clamp(-1.0,1.0).asin();
            c.x=0.0;c.y=config.nominal_wheel_center_y()-config.wheel_radius-0.0130596+1.65;c.z=1.05;
            self.update_tank_collision(player,body_handle,&hull,yaw,elevation,config.nominal_wheel_center_y()-config.wheel_radius-0.0130596);
        }else{
            // Live weapon origins belong to the selected server chassis. A
            // client/editor mount offset must never move a shot across cover.
            c.x=0.0;c.y=config.chassis_com_offset[1]+config.chassis_half_extents[1]+0.05;c.z=0.0;
        }
        if spray && target.hull_locked && !manual_lock {direction=forward;c.yaw=(-forward.x).atan2(-forward.z);c.pitch=forward.y.clamp(-1.0,1.0).asin();}
        c.weapon=if config.tracked {target.weapon.clone()}else if spray {"spray".into()}else{"primary".into()};
        let cannon=config.tracked && c.weapon=="cannon";
        let small_arms_range=if config.tracked&&c.weapon=="coax"{800.0}else{200.0};
        // All three timers advance while holstered: swapping never resets a reload.
        for key in [player.to_owned(),format!("{player}:coax"),format!("{player}:basket")] {
            if let Some(t)=self.combat_cooldowns.get_mut(&key){*t=(*t-SIMULATION_DT).max(0.0);}
        }
        let key=if config.tracked && !cannon {format!("{player}:{}",c.weapon)}else{player.to_owned()};
        let cooldown=self.combat_cooldowns.entry(key).or_insert(0.0);
        let shoot=c.fire&&*cooldown<=0.0;
        if shoot {c.shot_weapon=c.weapon.clone();*cooldown=if spray && c.shot%crate::support_spray::CAPACITY==crate::support_spray::CAPACITY-1 {crate::support_spray::RECHARGE}else if cannon {3.0}else if c.role=="medic" && !spray {0.6}else{0.1};c.shot=c.shot.wrapping_add(1);if cannon {c.cannon_shot=c.cannon_shot.wrapping_add(1);}}
        c.reload=*cooldown;c.ammo=if cannon {u8::from(*cooldown<=0.0)}else if spray {
            let used=c.shot%crate::support_spray::CAPACITY;
            if used==0 && *cooldown>0.0 {0} else {(crate::support_spray::CAPACITY-used) as u8}
        }else{255};
        c.cannon_reload=*self.combat_cooldowns.get(player).unwrap_or(&0.0);
        c.coax_reload=*self.combat_cooldowns.get(&format!("{player}:coax")).unwrap_or(&0.0);
        c.basket_reload=*self.combat_cooldowns.get(&format!("{player}:basket")).unwrap_or(&0.0);
        let breech=hull.transform_point(&point![c.x,c.y,c.z]);
        let (shot_breech,origin)=if config.tracked&&c.weapon=="basket" {
            // Measured visible thin barrel beside the cannon. Rotate its base
            // with Turret yaw, then pitch only the barrel around that base.
            let local_direction=hull.rotation.inverse()*direction;
            let yaw=local_direction.x.atan2(local_direction.z);
            let elevation=local_direction.y.atan2((local_direction.x*local_direction.x+local_direction.z*local_direction.z).sqrt());
            let turret_rotation=Rotation::from_axis_angle(&Vector::y_axis(),yaw);
            let gun_rotation=turret_rotation*Rotation::from_axis_angle(&Vector::x_axis(),-elevation);
            let visual_y=config.nominal_wheel_center_y()-config.wheel_radius-0.0130596;
            let pivot=vector![0.0,visual_y+1.30,0.10];
            let base=hull.transform_point(&Point::from(pivot+turret_rotation*vector![-0.3388,1.4641-1.30,1.2020-0.10]));
            // Tip includes 3.5 cm clearance, matching the frontend model rig.
            let tip=base+hull.rotation*(gun_rotation*vector![-0.3396-(-0.3388),1.4700-1.4641,1.3741-1.2020]);
            (base,tip)
        }else if config.tracked&&!cannon {
            // Match the roof MG baked into Turret: yaw follows the top section;
            // its physical exit does not move with the separate cannon pitch.
            let local_direction=hull.rotation.inverse()*direction;
            let yaw=local_direction.x.atan2(local_direction.z);
            let turret_rotation=Rotation::from_axis_angle(&Vector::y_axis(),yaw);
            let visual_y=config.nominal_wheel_center_y()-config.wheel_radius-0.0130596;
            let pivot=vector![0.0,visual_y+1.30,0.10];
            let base=hull.transform_point(&Point::from(pivot+turret_rotation*vector![-0.505,0.90,0.70]));
            let tip=hull.transform_point(&Point::from(pivot+turret_rotation*vector![-0.505,0.90,1.341]));
            (base,tip)
        }else if !config.tracked && !spray && c.role=="support" {
            // The M2 mesh is centered at its trunnion. Check cover along the
            // barrel before tracing out from its muzzle, just like the tank.
            let pivot=breech+hull.rotation*Vector::y()*0.2532;
            (pivot, pivot+direction*0.7596)
        }else{(breech,breech+if cannon {direction*4.1}else{Vector::zeros()})};
        let barrel_delta=origin-shot_breech;
        let barrel_length=barrel_delta.norm();
        if shoot{c.shot_origin=Some([origin.x,origin.y,origin.z]);if let Some(health)=self.vehicle_health.get_mut(player){health.spawn_protection_s=0.0;}}
        self.combat_poses.insert(player.to_owned(),c);
        if !shoot {return;}
        if cannon {if let Some(body)=self.bodies.get_mut(body_handle){body.apply_impulse_at_point(-direction*36000.0,origin,true);}}
        self.synchronize_queries();
        if spray {self.fire_support_spray(player,origin,direction);return;}
        let obstruction=if barrel_length>0.001 {self.query_pipeline.cast_ray_and_get_normal(&self.bodies,&self.colliders,&Ray::new(shot_breech,barrel_delta/barrel_length),barrel_length,true,QueryFilter::default().groups(vehicle_collision_groups(false)).exclude_rigid_body(body_handle)).map(|(h,i)|(h,shot_breech+(barrel_delta/barrel_length)*i.time_of_impact,0.0,i.normal))}else{None};
        let hit=if obstruction.is_some(){obstruction}else if cannon {
            crate::ballistics::trace(origin,direction,body_handle,&self.bodies,&self.colliders,&self.query_pipeline)
        }else{
            self.query_pipeline.cast_ray_and_get_normal(&self.bodies,&self.colliders,&Ray::new(origin,direction),small_arms_range,true,QueryFilter::default().groups(vehicle_collision_groups(false)).exclude_rigid_body(body_handle))
                .map(|(h,i)|(h,origin+direction*i.time_of_impact,0.0,i.normal))
        };
        let base_damage=if cannon {crate::vehicle_health::CANNON_DAMAGE} else {crate::vehicle_health::COAX_DAMAGE};
        let mut damage=base_damage;
        if self.guard_boosts.values().any(|g|g.kind=="tank_barrier" && g.active() && g.shield_hp>0.0) {
            let breech_end=obstruction.map_or(origin, |(_,p,_,_)|p);
            let mut block=self.screen_segment(player,shot_breech,breech_end,&mut damage).map(|(p,n,_)|(p,n,0.0));
            if block.is_none() && obstruction.is_none() {
                if cannon {
                    // Use the same piecewise-linear trajectory as the world raycast.
                    let end=hit.map_or(crate::ballistics::MAX_TIME,|(_,_,t,_)|t);
                    let mut previous=origin;
                    for step in 1..=(end/crate::ballistics::SEGMENT_DT).ceil() as u32 {
                        let t=(step as f32*crate::ballistics::SEGMENT_DT).min(end);
                        let start=(step-1) as f32*crate::ballistics::SEGMENT_DT;
                        let next=if t==end {hit.map_or_else(||crate::ballistics::position(origin,direction,t),|(_,p,_,_)|p)} else {crate::ballistics::position(origin,direction,t)};
                        if let Some((p,n,fraction))=self.screen_segment(player,previous,next,&mut damage) {
                            block=Some((p,n,start+(t-start)*fraction)); break;
                        }
                        previous=next;
                    }
                } else {
                    let end=hit.map_or(origin+direction*small_arms_range, |(_,p,_,_)|p);
                    block=self.screen_segment(player,origin,end,&mut damage).map(|(p,n,_)|(p,n,0.0));
                }
            }
            if let Some((p,n,t))=block {
                if let Some(c)=self.combat_poses.get_mut(player) {c.impact=Some([p.x,p.y,p.z]);c.impact_normal=Some([n.x,n.y,n.z]);c.impact_time=t;c.impact_static=false;}
                return;
            }
        }
        if let Some(c)=self.combat_poses.get_mut(player){c.impact=hit.map(|(_,p,_,_)|[p.x,p.y,p.z]);c.impact_time=hit.map(|(_,_,t,_)|t).unwrap_or(crate::ballistics::MAX_TIME);
            c.impact_normal=hit.map(|(_,_,_,n)|[n.x,n.y,n.z]);
            c.impact_static=hit.is_some_and(|(h,_,_,_)|self.colliders[h].parent().is_none_or(|b|self.bodies[b].is_fixed()));}
        let Some((handle,impact,_,_))=hit else {return;};
        let Some(parent)=self.colliders[handle].parent() else {return;};
        if let Some(victim)=self.body_to_player.get(&parent).cloned(){
            self.damage_vehicle(&victim,Some(player),damage,if cannon{"cannon"}else{"machine-gun"});
        }
        if cannon && self.bodies[parent].is_dynamic(){
            let mass=self.bodies[parent].mass();
            self.bodies[parent].apply_impulse_at_point(direction*(mass*2.8).min(80000.0)*(damage/base_damage),impact,true);
        }
        self.damage_authored_surface(parent,cannon,(if cannon{300.0}else{20.0})*(damage/base_damage));
    }

    pub(crate) fn damage_authored_surface(&mut self,parent:RigidBodyHandle,cannon:bool,damage:f32) {
        let index=self.bodies[parent].user_data as usize;if index==0{return;}
        let Some(layout)=self.active_map.as_ref().and_then(|m|m.authored_layout.as_ref()).filter(|l|!l.repeat) else{return;};
        let Some(object)=layout.objects.get(index-1) else{return;};
        if ["coastal-land","coastal-land-bridge"].contains(&object.piece.as_str()){return;}
        let Some(d)=object.destruction.as_ref().filter(|d|d.enabled) else{return;};
        let lift=object.piece=="canal-lift";
        if lift && self.bridge_motion.as_ref().is_some_and(|b|b.broken.is_some()){return;}
        let multiplier=if cannon {d.cannon}else{d.small_arms};
        let hp=self.asset_health.entry(object.id.clone()).or_insert(d.hp);
        *hp=(*hp-damage*multiplier).max(0.0);
        if lift && *hp==0.0 {
            if let Some(bridge)=self.bridge_motion.as_mut(){
                bridge.broken=Some(object.id.clone());bridge.select(self.bridge_tick,crate::harbor::RAMP_ANGLE);
            }
        }
        if *hp==0.0 {for h in self.bodies[parent].colliders().to_vec(){if let Some(c)=self.colliders.get_mut(h){c.set_enabled(false);}}self.query_pipeline.update(&self.colliders);}
    }
    pub(crate) fn barrier_yaw(&self,player:&str)->f32 {
        self.tank_colliders.get(player).and_then(|(turret,_)|self.colliders.get(*turret))
            .and_then(|c|c.position_wrt_parent()).map_or(0.0,|pose|{
                let front=pose.rotation*Vector::z();front.x.atan2(front.z)
            })
    }
    fn update_tank_collision(&mut self,player:&str,body:RigidBodyHandle,hull:&Isometry<Real>,yaw:f32,elevation:f32,visual_y:f32){
        let existing=self.tank_colliders.get(player).copied().filter(|(a,b)|self.colliders.contains(*a)&&self.colliders.contains(*b));
        let (turret,barrel)=existing.unwrap_or_else(||{
            let groups=self.bodies[body].colliders().first().map(|h|self.colliders[*h].collision_groups()).unwrap_or(InteractionGroups::all());
            let a=self.colliders.insert_with_parent(ColliderBuilder::cuboid(1.05,0.45,1.1).density(0.0).collision_groups(groups).build(),body,&mut self.bodies);
            // Query sensor: hittable barrel without snagging narrow bridges or levering the hull.
            let b=self.colliders.insert_with_parent(ColliderBuilder::cuboid(0.13,0.13,2.0).density(0.0).sensor(true).collision_groups(groups).build(),body,&mut self.bodies);
            self.tank_colliders.insert(player.to_owned(),(a,b));(a,b)
        });
        let yaw_q=Rotation::from_axis_angle(&Vector::y_axis(),yaw);
        let turret_pose=Isometry::from_parts(Translation::from(vector![0.0,visual_y+1.75,0.10]),yaw_q);
        let gun_q=yaw_q*Rotation::from_axis_angle(&Vector::x_axis(),-elevation);
        let pivot=vector![0.0,visual_y+1.30,0.10]+yaw_q*vector![0.0,0.35,0.95];
        let barrel_pose=Isometry::from_parts(Translation::from(pivot+gun_q*vector![0.0,0.0,2.0]),gun_q);
        for (handle, pose) in [(turret, turret_pose), (barrel, barrel_pose)] {
            if self.colliders[handle].position_wrt_parent() != Some(&pose) {
                let collider = &mut self.colliders[handle];
                collider.set_position_wrt_parent(pose);
                collider.set_position(hull * pose);
            }
        }
    }

    // ===========================================================================
    // Attach input to a player's vehicle (just stores it; actual forces are
    // applied in `step`).
    // ===========================================================================
    pub fn apply_player_input_packet(
        &mut self,
        player_id: &str,
        packet: impl std::borrow::Borrow<InputPacket>,
    ) {
        let packet = packet.borrow();
        if self.is_defeated(player_id){return;}
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

    /// Restore gauges only after the recorded spawn is clear and recovery succeeds.
    pub fn recover_vehicle_for_player(&mut self, player_id: &str) -> Result<(), String> {
        if self.is_defeated(player_id){return Err("Vehicle defeated. Wait for respawn.".into());}
        self.place_vehicle_at_spawn(player_id)?;
        self.barrages.remove(player_id);
        self.ctf_reset_players.insert(player_id.into());
        if let Some(vehicle) = self.vehicles.get_mut(player_id) {
            vehicle.powertrain.refill_gauges(vehicle.config.resources);
        }
        if let Some(health) = self.vehicle_health.get_mut(player_id) { health.hp = health.max_hp; }
        Ok(())
    }
    pub(crate) fn place_vehicle_at_spawn(&mut self, player_id: &str) -> Result<(), String> {
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
            QueryFilter::default().groups(vehicle_collision_groups(false)).exclude_rigid_body(handle)).is_some() {
            return Err("Spawn is occupied. Wait for the area to clear and reset again.".into());
        }
        let body = self.bodies.get_mut(handle).unwrap();
        body.set_position(pose, true); body.set_linvel(Vector::zeros(), true);
        body.set_angvel(Vector::zeros(), true); body.reset_forces(true); body.reset_torques(true);
        self.bodies.propagate_modified_body_positions_to_colliders(&mut self.colliders);
        self.query_pipeline.update(&self.colliders);
        if let Some(v)=self.vehicles.get_mut(player_id){v.ram.cancel();}
        if self.assigned_hero(player_id)!=Some("tank"){self.cancel_guard(player_id);}
        self.falling_seconds.remove(player_id);
        Ok(())
    }


    /// Automatic recovery may choose a central supported road or an authored
    /// home pad, ranked by distance from the actual downing position. Geometry
    /// and dynamic occupancy are checked before committing any relocation.
    pub(crate) fn place_vehicle_after_recovery(&mut self, player_id:&str) -> Result<(),String> {
        let vehicle=self.vehicles.get(player_id).ok_or("Vehicle unavailable")?;
        if vehicle.config.wheels==0 {return self.place_vehicle_at_spawn(player_id);}
        let handle=vehicle.body;let config=vehicle.config;
        let body=self.bodies.get(handle).ok_or("Vehicle body unavailable")?;
        let from=self.vehicle_health.get(player_id).and_then(|h|h.downed_position).unwrap_or_else(||[body.translation().x,body.translation().y,body.translation().z]);
        let map=self.active_map.as_ref().ok_or("Map unavailable")?;
        let spawns=if vehicle.team.eq_ignore_ascii_case("red"){&map.team_spawns.red}else{&map.team_spawns.blue};
        let mut candidates:Vec<(f32,f32,f32,f32)>=spawns.iter().map(|s|(s.chunk[0] as f32*map.cell[0]+s.local[0],s.chunk[1] as f32*map.cell[1]+s.local[1],s.surface_y.unwrap_or(map.surface.road_y),s.yaw)).collect();
        if map.dock_flag(&vehicle.team).is_none() {
            let center=self.ctf_bases().ok().map(|b|[(b[0][0]+b[1][0])*0.5,(b[0][2]+b[1][2])*0.5]).unwrap_or_else(||{
                let count=candidates.len().max(1) as f32;[candidates.iter().map(|c|c.0).sum::<f32>()/count,candidates.iter().map(|c|c.1).sum::<f32>()/count]
            });
            let mut central:Vec<(f32,f32,f32)>=self.block_world.debug_boxes.values().flat_map(|boxes|boxes.iter()).filter(|b|b.kind=="road"||b.kind=="intersection").map(|b|(b.center[0],b.center[2],b.center[1]+b.half_extents[1])).collect();
            if let Some(layout)=&map.authored_layout {
                if layout.ground {central.push((center[0],center[1],map.surface.road_y));}
                central.extend(layout.objects.iter().filter(|o|o.solid&&(o.road.is_some()||o.piece.contains("road")||o.piece.contains("bridge")||o.piece=="coastal-land")).map(|o|(o.position[0],o.position[2],o.position[1]+o.size[1])));
            }
            central.sort_by(|a,b|((a.0-center[0]).powi(2)+(a.1-center[1]).powi(2)).total_cmp(&((b.0-center[0]).powi(2)+(b.1-center[1]).powi(2))).then_with(||a.0.total_cmp(&b.0)).then_with(||a.1.total_cmp(&b.1)));
            // Only the nearest central road zone is a second recovery zone. Other
            // arbitrary road pieces must not turn into invisible spawn shortcuts.
            if let Some(point)=central.first(){candidates.push((point.0,point.1,point.2,0.0));}
        }
        candidates.sort_by(|a,b|((a.0-from[0]).powi(2)+(a.1-from[2]).powi(2)).total_cmp(&((b.0-from[0]).powi(2)+(b.1-from[2]).powi(2))));
        self.query_pipeline.update(&self.colliders);
        for (x,z,expected_y,yaw) in candidates {
            let ray=Ray::new(point![x,expected_y+3.0,z],-Vector::y());
            let Some((_,hit))=self.query_pipeline.cast_ray_and_get_normal(&self.bodies,&self.colliders,&ray,8.0,true,QueryFilter::only_fixed()) else{continue};
            if hit.normal.y<0.9||hit.time_of_impact<0.01{continue;}
            let road=ray.origin.y-hit.time_of_impact;
            let y=config.nominal_chassis_y(road).max(road+config.chassis_half_extents[1]-config.chassis_com_offset[1]+0.05);
            let pose=Isometry::new(vector![x,y,z],vector![0.0,yaw,0.0]);
            let bottom = y + config.chassis_com_offset[1] - config.chassis_half_extents[1];
            if self.coast.as_ref().is_some_and(|coast| coast.hazard(&pose.translation.vector, bottom).is_some()) { continue; }
            if !self.vehicle_pose_clear(handle,config,pose)||!self.vehicle_recovery_support(config,pose,road){continue;}
            let body=self.bodies.get_mut(handle).unwrap();body.set_position(pose,true);body.set_linvel(Vector::zeros(),true);body.set_angvel(Vector::zeros(),true);body.reset_forces(true);body.reset_torques(true);
            self.bodies.propagate_modified_body_positions_to_colliders(&mut self.colliders);self.query_pipeline.update(&self.colliders);self.falling_seconds.remove(player_id);return Ok(());
        }
        Err("Waiting for a safe central or home-base recovery zone.".into())
    }

    fn vehicle_pose_clear(&self,handle:RigidBodyHandle,config:crate::vehicle_state::VehicleConfig,pose:Isometry<Real>)->bool {
        let [hx,hy,hz]=config.chassis_half_extents;let [cx,cy,cz]=config.chassis_com_offset;
        self.query_pipeline.intersection_with_shape(&self.bodies,&self.colliders,&(pose*Isometry::translation(cx,cy,cz)),&*SharedShape::cuboid(hx,hy,hz),QueryFilter::default().groups(vehicle_collision_groups(false)).exclude_rigid_body(handle)).is_none()
    }

    fn vehicle_recovery_support(&self,config:crate::vehicle_state::VehicleConfig,pose:Isometry<Real>,road:f32)->bool {
        [(config.front_track_width*0.5,config.front_axle_z),(-config.front_track_width*0.5,config.front_axle_z),(config.rear_track_width*0.5,config.rear_axle_z),(-config.rear_track_width*0.5,config.rear_axle_z)].iter().all(|(x,z)|{
            let p=pose*point![*x,0.0,*z];let ray=Ray::new(point![p.x,p.y+2.0,p.z],-Vector::y());
            self.query_pipeline.cast_ray_and_get_normal(&self.bodies,&self.colliders,&ray,6.0,true,QueryFilter::only_fixed()).is_some_and(|(_,hit)|hit.time_of_impact>0.01&&hit.normal.y>0.7&&(ray.origin.y-hit.time_of_impact-road).abs()<0.8)
        })
    }

    /// A medic cannot revive a disabled vehicle inside another vehicle/wall, below
    /// the map or suspended high above support. No teleport or healing occurs
    /// on a failed validation.
    pub(crate) fn validate_revive_placement(&mut self,player_id:&str)->Result<(),String>{
        let vehicle=self.vehicles.get(player_id).ok_or("Vehicle unavailable")?;
        let handle=vehicle.body;let config=vehicle.config;let body=self.bodies.get(handle).ok_or("Vehicle body unavailable")?;
        let pose=*body.position();
        self.query_pipeline.update(&self.colliders);
        if !self.vehicle_pose_clear(handle,config,pose){return Err("The disabled vehicle is obstructed. Clear the area before reviving.".into());}
        if config.wheels==0 {
            return self.coast.as_ref()
                .and_then(|coast|coast.water_surface_at(pose.translation.x,pose.translation.z))
                .filter(|surface|(pose.translation.y-surface-2.0).abs()<6.0)
                .map(|_|()).ok_or_else(||"The vessel needs water support before revival.".into());
        }
        let origin=point![pose.translation.x,pose.translation.y+1.0,pose.translation.z];
        let Some((_,hit))=self.query_pipeline.cast_ray_and_get_normal(&self.bodies,&self.colliders,&Ray::new(origin,-Vector::y()),5.0,true,QueryFilter::only_fixed())else{return Err("The disabled vehicle needs safe ground support.".into())};
        if hit.normal.y<0.7||hit.time_of_impact<0.1||!self.vehicle_recovery_support(config,pose,origin.y-hit.time_of_impact){return Err("The disabled vehicle needs safe ground support.".into());}
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
        if self.vehicles.contains_key(&id){return Err("Vehicle already spawned".into());}
        let config = config_for_vehicle(vehicle_id).ok_or_else(|| {
            format!("Unknown vehicle id '{vehicle_id}'")
        })?;
        let [hx, hy, hz] = config.chassis_half_extents;


        let (spawn_x, spawn_z, spawn_yaw, road_surface_y) = if config.wheels == 0 {
            let map = self.active_map.as_ref().ok_or("No map selected")?;
            if !map.map_id.starts_with("harbor_canal_") {
                return Err("This watercraft needs an installed harbor canal environment".into());
            }
            let coast=self.coast.as_ref().ok_or("This environment has no navigable water")?;
            let z=if team=="red" {-235.0}else if team=="blue" {235.0}else {return Err("Unknown boat team".into())};
            let yaw=if team=="red" {0.0}else {std::f32::consts::PI};
            let berth_x=0.0;
            let water=coast.water_surface_at(berth_x,z).ok_or("Naval berth has no water")?;
            let half_length=config.chassis_half_extents[2];
            if coast.water_surface_at(berth_x,z-half_length).is_none() || coast.water_surface_at(berth_x,z+half_length).is_none() {
                return Err("Naval berth is too short for this hull".into());
            }
            if self.vehicles.values().any(|v|self.bodies.get(v.body).is_some_and(|b|{
                let p=b.translation();(p.x-berth_x).powi(2)+(p.z-z).powi(2)<170.0_f32.powi(2)
            })) {return Err("The naval berth is occupied. Wait for the ship to depart".into());}
            (berth_x,z,yaw,water)
        } else {
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
                    let [candidate_x,candidate_z] = spawn.world_xz(map.cell);
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

            let [spawn_x,spawn_z] = spawn.world_xz(map.cell);
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
        let spawn_y = if config.wheels==0 {road_surface_y+2.0} else {config.spawn_height(road_surface_y)};

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
            .collision_groups(vehicle_collision_groups(false))
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
        self.vehicle_health.insert(id.clone(),crate::vehicle_health::VehicleHealth::new(config.hull_hp));
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
        self.configure_vehicle_for_player(player_id, config)?;
        self.launch_from_dock_garage(player_id);
        Ok(())
    }

    fn launch_from_dock_garage(&mut self, player: &str) {
        let vehicle = &self.vehicles[player];
        let Some(map) = self.active_map.as_ref() else { return };
        if map.dock_flag(&vehicle.team).is_none() { return; }
        let id = if vehicle.team == "red" { "home-gas-west" } else { "home-gas-east" };
        let Some(bay) = self.service_bays.iter().map(|&i| &map.authored_layout.as_ref().unwrap().objects[i])
            .find(|o| o.id == id && o.piece == "service-center") else { return };
        let [x, z] = map.authored_anchor();
        let base = Isometry::new(vector![bay.position[0] + x as f32 * map.cell[0], bay.position[1],
            bay.position[2] + z as f32 * map.cell[1]], Vector::y() * bay.yaw.to_radians());
        let handle = vehicle.body;
        let inside = base.inverse_transform_point(&Point::from(*self.bodies[handle].translation()));
        if inside.x.abs() > bay.size[0] * 0.45 || inside.z.abs() > bay.size[2] * 0.5
            || !(0.0..bay.size[1]).contains(&inside.y) { return; }
        let config = vehicle.config;
        let pose = base * Isometry::translation(0.0, config.spawn_height(0.0), bay.size[2] * 0.24);
        if !self.vehicle_pose_clear(handle, config, pose) || !self.vehicle_recovery_support(config, pose, bay.position[1]) { return; }
        let body = &mut self.bodies[handle];
        body.set_position(pose, true);
        body.set_linvel(Vector::zeros(), true);
        body.set_angvel(Vector::zeros(), true);
        self.bodies.propagate_modified_body_positions_to_colliders(&mut self.colliders);
        self.synchronize_queries();
    }

    /// Editor tuning uses the same validated body/wheel rebuild as model swaps.
    pub fn configure_vehicle_for_player(&mut self, player_id: &str, config: crate::vehicle_state::VehicleConfig) -> Result<(), String> {
        if self.is_defeated(player_id){return Err("Wait for respawn before changing or editing a vehicle".into());}
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
            QueryFilter::default().groups(vehicle_collision_groups(false)).exclude_rigid_body(handle),
        ).is_some() {
            return Err("Not enough room for this vehicle. Move to an open area and try again.".to_string());
        }

        self.ctf_reset_players.insert(player_id.into());
        // All fallible validation is above: a rejected request leaves the old
        // vehicle intact. Reusing the handle also keeps ownership/team stable.
        if !config.tracked {
            if let Some((turret,barrel))=self.tank_colliders.remove(player_id) {
                self.colliders.remove(turret,&mut self.island_manager,&mut self.bodies,true);
                self.colliders.remove(barrel,&mut self.island_manager,&mut self.bodies,true);
            }
        }
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
        if let Some(guard)=self.guard_boosts.get_mut(player_id){guard.remaining=0.0;guard.shield_hp=0.0;}
        self.support.clear_player(player_id);
        vehicle.powertrain.reconfigure(previous.resources, config.resources);
        vehicle.ram.cancel();
        vehicle.config = config;
        if let Some(health)=self.vehicle_health.get_mut(player_id){health.set_chassis(config.hull_hp);}
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
        if self.is_defeated(player_id){return Err("Defeated vehicles cannot be serviced".into());}
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

    // Use the current body pose even when a shot arrives between physics ticks.
    // Home garages shelter their team. Neutral service garages shelter either.
    pub(crate) fn garage_protected(&self, player: &str) -> bool {
        let Some(v) = self.vehicles.get(player) else { return false };
        let Some(map) = self.active_map.as_ref() else { return false };
        let Some(layout) = map.authored_layout.as_ref() else { return false };
        let p = self.bodies[v.body].translation();
        for &(x,z) in self.block_world.loaded.keys() {
            if !map.includes_authored_tile(x,z) { continue; }
            for &i in &self.service_bays {
                let bay = &layout.objects[i];
                if bay.id == "home-gas-west" && v.team != "red" || bay.id == "home-gas-east" && v.team != "blue"
                    || self.asset_health.get(&bay.id) == Some(&0.0) { continue; }
                let dx=p.x-bay.position[0]-x as f32*map.cell[0];
                let dz=p.z-bay.position[2]-z as f32*map.cell[1];
                if dx.abs()+dz.abs()>bay.size[0]+bay.size[2]+4.0 { continue; }
                let (sin,cos)=bay.yaw.to_radians().sin_cos();
                if (dx*cos-dz*sin).abs() <= bay.size[0]*0.5+2.0 && (dx*sin+dz*cos).abs() <= bay.size[2]*0.5+2.0
                    && p.y >= bay.position[1]-0.15 && p.y <= bay.position[1]+bay.size[1] { return true; }
            }
        }
        false
    }

    /// Authored service bays use their local footprint, including rotation.
    /// Home bays restore all gauges once per stopped visit. Other service
    /// bays deliver their existing gradual fuel and repair rates.
    fn service_authored_bays(&mut self, dt: Real) {
        if self.service_bays.is_empty() { return; }
        let Some(map) = self.active_map.as_ref() else {return;};
        let Some(layout) = &map.authored_layout else {return;};
        let tile = self.block_world.tile_size.unwrap_or([1.0, 1.0]);
        let mut at_home=std::collections::HashSet::new();
        'vehicle: for (player,vehicle) in self.vehicles.iter_mut() {
            if self.vehicle_health.get(player).is_some_and(|h|h.defeated){continue;}
            let Some(body) = self.bodies.get(vehicle.body) else { continue; };
            let stopped = body.linvel().norm() <= 0.5;
            let p=body.translation();
            for &(bx, bz) in self.block_world.loaded.keys() {
            if !map.includes_authored_tile(bx,bz) {continue;}
            for &index in &self.service_bays {
                let bay = &layout.objects[index];
                if self.asset_health.get(&bay.id)==Some(&0.0){continue;}
                let dx=p.x-bay.position[0]-bx as f32*tile[0]; let dz=p.z-bay.position[2]-bz as f32*tile[1];
                let yaw=bay.yaw.to_radians();
                let x=dx*yaw.cos()-dz*yaw.sin(); let z=dx*yaw.sin()+dz*yaw.cos();
                if x.abs()>bay.size[0]*0.3 || z.abs()>bay.size[2]*0.325
                    || p.y<bay.position[1] || p.y>bay.position[1]+bay.size[1] { continue; }
                let state=&mut vehicle.powertrain;
                if bay.id.starts_with("home-gas-") && matches!(bay.piece.as_str(), "fuel-station" | "service-center") {
                    if self.serviced_home.contains(player) {
                        at_home.insert(player.clone());
                        continue 'vehicle;
                    }
                    if !stopped { continue 'vehicle; }
                    at_home.insert(player.clone());
                    let before=state.fuel_liters;
                    state.refill_gauges(vehicle.config.resources);
                    if let Some(health)=self.vehicle_health.get_mut(player) {
                        health.stats.gain_fuel(state.fuel_liters-before);
                        health.repair(health.max_hp-health.hp);
                    }
                    continue 'vehicle;
                }
                if !stopped { continue; }
                if bay.piece!="repair-shop" {
                    let before=state.fuel_liters;
                    state.fuel_liters=(state.fuel_liters+dt*3.0).min(vehicle.config.resources.fuel_capacity_liters);
                    if let Some(h)=self.vehicle_health.get_mut(player){h.stats.gain_fuel(state.fuel_liters-before);}
                }
                if bay.piece!="repair-shop" {state.nos_remaining_s=(state.nos_remaining_s+dt*1.5).min(vehicle.config.resources.nos_seconds);}
                if bay.piece!="fuel-station" {if let Some(h)=self.vehicle_health.get_mut(player){h.repair(h.max_hp*0.10*dt);}}
                if bay.piece!="fuel-station" { state.condition=(state.condition+dt*0.06).min(1.0);state.temperature_c=(state.temperature_c-dt*3.0).max(vehicle.config.resources.initial_temp_c); }
                continue 'vehicle; // Overlapping bays cannot multiply the service rate.
            }
            }
        }
        self.serviced_home=at_home;
    }

    pub fn step(&mut self, dt: Real) {
        if dt.is_finite()&&dt>0.0{self.advance_vehicle_lives(dt.min(0.1));}
        if dt.is_finite() && dt > 0.0 { self.service_authored_bays(dt.min(0.1)); }
        if !dt.is_finite() || dt <= 0.0 {
            return;
        }

        // Sample after respawn/service refills, before Ram and engine costs.
        // Manual service and chassis changes happen outside step and cannot be
        // mistaken for gameplay fuel gained or consumed.
        let fuel_before:Vec<_>=self.vehicles.values().map(|vehicle|(vehicle.body,vehicle.powertrain.fuel_liters)).collect();
        let step_started = std::time::Instant::now();
        for (player,vehicle) in self.vehicles.iter_mut(){
            if self.vehicle_health.get(player).is_some_and(|h|h.defeated){continue;}
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
                if let Some(health)=self.vehicle_health.get_mut(player){health.spawn_protection_s=0.0;}
                vehicle.powertrain.fuel_liters=(vehicle.powertrain.fuel_liters-crate::ram::FUEL_COST).max(0.0);
                if let Some(body) = self.bodies.get_mut(vehicle.body) {
                    // Ability-powered launch, once per activation, only grounded.
                    let forward = body.rotation()*Vector::z();
                    let speed = body.linvel().dot(&forward);
                    let delta = (vehicle.config.max_speed*crate::ram::SPEED_MULTIPLIER*if self.ctf_carriers.contains(player){crate::ctf::CARRIER_SPEED_FACTOR}else{1.0}-speed).clamp(0.0,12.0);
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
        self.synchronize_queries();

        // Recompute custom contacts and forces for each small integration step.
        // Bound catch-up work after a stall as well as the spring integration dt.
        let elapsed = dt.min(MAX_PHYSICS_SUBSTEP * MAX_PHYSICS_SUBSTEPS as Real);
        let count = ((elapsed / MAX_PHYSICS_SUBSTEP).ceil() as usize)
            .clamp(1, MAX_PHYSICS_SUBSTEPS);
        let substep_dt = elapsed / count as Real;
        for _ in 0..count {
            self.step_substep(substep_dt);
        }
        for (body,before) in fuel_before {
            let Some(id)=self.body_to_player.get(&body) else{continue};
            let Some(vehicle)=self.vehicles.get(id) else{continue};
            if let Some(h)=self.vehicle_health.get_mut(id){h.stats.burn_fuel(before-vehicle.powertrain.fuel_liters);}
        }
        self.settle_bottomed_chassis();
        let trace_now = self.refresh_vehicle_wheel_snapshots();
        self.populate_block_debug();
        if trace_now {
            println!("[physics] substeps={} step_ms={:.2} debug_boxes={}",
                count, step_started.elapsed().as_secs_f64() * 1000.0,
                self.debug_overlay.block_boxes.len());
        }
    }

    // A fully compressed strut can leave a little residual penetration after
    // Rapier's contact solve. Check the belly corners only on bottom-out or a
    // hard descent. Respect the actual supporting surface, including a moving
    // bridge or seabed, and leave pitch, roll and horizontal momentum intact.
    fn settle_bottomed_chassis(&mut self) {
        let mut moved=false;
        for vehicle in self.vehicles.values() {
            let handle=vehicle.body;
            let body=&self.bodies[handle];
            if body.is_sleeping() || !body.is_enabled() { continue; }
            if body.linvel().y > -2.0 && !self.wheels.get(&handle).is_some_and(|w|w.iter().any(|t|t.compression_ratio>0.94)) { continue; }
            let c=vehicle.config;
            let [hx,hy,hz]=c.chassis_half_extents;
            let [cx,cy,cz]=c.chassis_com_offset;
            let mut lift=0.0_f32;
            for x in [-hx,hx] { for z in [-hz,hz] {
                let belly=body.position()*point![cx+x,cy-hy,cz+z];
                let ray=Ray::new(belly+Vector::y()*0.20,-Vector::y());
                if let Some((_,hit))=self.query_pipeline.cast_ray_and_get_normal(&self.bodies,&self.colliders,
                    &ray,0.20,true,QueryFilter::exclude_dynamic().exclude_sensors().exclude_rigid_body(handle)) {
                    if hit.time_of_impact>0.0001 && hit.normal.y>0.8 {lift=lift.max(0.20-hit.time_of_impact);}
                }
            }}
            if lift > 0.001 {
                let body=&mut self.bodies[handle];
                body.set_translation(*body.translation()+Vector::y()*lift,true);
                moved=true;
            }
        }
        if moved {
            self.bodies.propagate_modified_body_positions_to_colliders(&mut self.colliders);
            self.synchronize_queries();
        }
    }

    /// Only authored, destructible rail/barrier pieces use mass-based impacts.
    /// No broad city collider scan and no damage from merely resting against one.
    fn apply_barrier_impacts(&mut self,motion:&HashMap<RigidBodyHandle,(Vector<Real>,Vector<Real>)>,dt:f32){
        if !self.has_impact_barriers {return;}
        self.barrier_impacts.retain(|_,t|{*t-=dt;*t>0.0});
        let Some(layout)=self.active_map.as_ref().and_then(|m|m.authored_layout.as_ref()).filter(|l|!l.repeat)else{return};
        let mut hits=HashMap::new();
        for v in self.vehicles.values(){
            let Some(body)=self.bodies.get(v.body)else{continue};
            let velocity=motion.get(&v.body).map(|(_,velocity)|velocity).unwrap_or(body.linvel());
            let speed=velocity.norm();
            if speed<3.0{continue;}
            for collider in body.colliders(){for pair in self.narrow_phase.contact_pairs_with(*collider){
                let other=if pair.collider1==*collider{pair.collider2}else{pair.collider1};
                let Some(target)=self.colliders.get(other).and_then(|c|c.parent())else{continue};
                if self.barrier_impacts.contains_key(&(v.body,target)){continue;}
                let Some(object)=self.bodies[target].user_data.checked_sub(1).and_then(|i|layout.objects.get(i as usize)).filter(|o|matches!(o.piece.as_str(), "barrier" | "highway-guardrail" | "breakaway-glass" | "downtown-metal-barrier"))else{continue};
                let pane = object.piece == "breakaway-glass";
                let rail = matches!(object.piece.as_str(),"highway-guardrail"|"downtown-metal-barrier") || pane;
                if pair.total_impulse_magnitude() < (if rail {140.0} else {1000.0}) {continue;}
                let Some(d)=object.destruction.as_ref().filter(|d|d.enabled)else{continue};
                let normal = self.bodies[target].rotation() * Vector::z();
                let normal_speed = velocity.dot(&normal);
                if rail && normal_speed.abs() < 3.0 { continue; }
                let impact_speed = if rail { normal_speed.abs() } else { speed };
                let damage = (0.5 * body.mass() * impact_speed.powi(2) / 5000.0).min(400.0);
                hits.insert((v.body,target),(object.id.clone(),d.hp,damage,rail,pane));
            }}
        }
        for ((source,target),(id,max_hp,damage,rail,pane)) in hits{
            self.barrier_impacts.insert((source,target),0.4);
            let hp=self.asset_health.entry(id).or_insert(max_hp);
            if *hp<=0.0 {continue;}
            *hp=(*hp-damage).max(0.0);
            if *hp==0.0{
                for h in self.bodies[target].colliders().to_vec(){if let Some(c)=self.colliders.get_mut(h){c.set_enabled(false);}}
                if rail {
                    let normal = self.bodies[target].rotation() * Vector::z();
                    if let (Some((_, velocity)), Some(body)) = (motion.get(&source), self.bodies.get_mut(source)) {
                        let before = velocity.dot(&normal);
                        let direction = normal * before.signum();
                        let current = *body.linvel();
                        // Glass gives way on contact. Carry speed into the ramp beyond it.
                        let through_speed = if pane { before.abs() * 0.85 } else { (before.abs()*0.35).min(2.5) };
                        let restored = (through_speed - current.dot(&direction)).max(0.0);
                        if restored > 0.0 { body.set_linvel(current + direction * restored, true); }
                    }
                }
            }
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
                if self.garage_protected(&victim_id) || self.vehicle_health.get(&victim_id).is_some_and(|h|h.defeated||h.spawn_protection_s>0.0){continue;}
                if let Some(victim)=self.vehicles.get_mut(&victim_id){
                    if victim.team==team{continue;}
                    victim.ram.stun_remaining=victim.ram.stun_remaining.max(crate::ram::STUN_SECONDS);
                    let bonus=((closing-3.5)*0.015).clamp(0.03,0.25);
                    victim.powertrain.condition=(victim.powertrain.condition-bonus).max(0.0);
                }
                self.damage_vehicle(&victim_id,Some(&source),crate::vehicle_health::RAM_DAMAGE,"ram");
            }else{
                let index=self.bodies[target].user_data as usize;
                let Some(object)=self.active_map.as_ref().and_then(|m|m.authored_layout.as_ref()).filter(|l|!l.repeat).and_then(|l|index.checked_sub(1).and_then(|i|l.objects.get(i)))else{continue;};
                if ["coastal-land","coastal-land-bridge"].contains(&object.piece.as_str()){continue;}
                self.damage_authored_surface(target,true,150.0);
            }
        }
    }

    fn step_substep(&mut self, dt: Real) {

        // Inputs were clamped once when attached to the vehicle. Steering
        // smoothing has one owner inside apply_vehicle_forces, not a second
        // rack integrator or a second control pass here.
        // Apply suspension + traction + tire forces exactly once per substep.
        self.apply_vehicle_forces(dt);
        // Ships have no wheels. Buoyancy, propeller thrust and rudder yaw have
        // one independent force owner, before the same Rapier integration.
        self.apply_watercraft_forces(dt);
        self.apply_naval_deck_brake();
        // Only multiplayer impacts can earn ultimate. Sample vehicle motion
        // before Rapier resolves a collision, so a ram that stops the attacker
        // still counts. Ordinary solo driving allocates no attribution table;
        // active Ram also samples pre-contact motion for authored structures.
        let impact_motion: HashMap<_, _> = if self.vehicles.len() > 1 || self.vehicles.values().any(|v|v.ram.active()) || self.has_impact_barriers {
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
        let mut impact_damage = Vec::new();
        for (handle, victim_id) in &self.body_to_player {
            let Some(health) = self.vehicle_health.get_mut(victim_id) else {continue};
            if health.defeated {continue;}
            health.friendly_shove_s = (health.friendly_shove_s-dt).max(0.0);
            let Some(body) = self.bodies.get(*handle) else {continue};
            let Some(target) = self.vehicles.get(victim_id) else {continue};
            let mut impact_impulse = 0.0_f32;
            let mut impact_source = None;
            let mut impact_direction = Vector::zeros();
            for collider in body.colliders() {
                for pair in self.narrow_phase.contact_pairs_with(*collider) {
                    let impulse = pair.total_impulse_magnitude();
                    let other = if pair.collider1 == *collider { pair.collider2 } else { pair.collider1 };
                    let other_body = self.colliders.get(other).and_then(|collider| collider.parent());
                    let rail = self.has_impact_barriers && other_body.and_then(|h| self.bodies[h].user_data.checked_sub(1))
                        .and_then(|i| self.active_map.as_ref()?.authored_layout.as_ref()?.objects.get(i as usize))
                        .is_some_and(|o| matches!(o.piece.as_str(), "highway-guardrail" | "breakaway-glass") && o.destruction.as_ref().is_some_and(|d| d.enabled));
                    let impulse = if rail { impulse * 0.2 } else { impulse };
                    // A genuine incoming ally shove also softens an immediate wall
                    // impact. Mere side-by-side contact cannot grant protection.
                    if impulse > body.mass()*3.5 {
                        if let Some((id,(pos,velocity))) = other_body.and_then(|h| self.body_to_player.get(&h).zip(impact_motion.get(&h))) {
                            let incoming = body.translation()-pos;
                            if self.vehicles.get(id).is_some_and(|v|v.team.eq_ignore_ascii_case(&target.team)) &&
                               velocity.dot(&incoming) > incoming.norm().max(0.1) {
                                health.friendly_shove_s = FRIENDLY_SHOVE_WINDOW_S;
                            }
                        }
                    }
                    if impulse > impact_impulse {
                        impact_impulse = impulse;
                        impact_source = other_body;
                        impact_direction = pair.manifolds.first().map(|m|if pair.collider1==*collider {m.data.normal}else{-m.data.normal}).unwrap_or(Vector::zeros());
                    }
                }
            }
            let contact_player = impact_source.and_then(|h|self.body_to_player.get(&h));
            let friendly = contact_player.and_then(|id|self.vehicles.get(id))
                .is_some_and(|v|v.team.eq_ignore_ascii_case(&target.team));
            let softened = friendly || (contact_player.is_none() && health.friendly_shove_s > 0.0);
            let scale = if softened { FRIENDLY_CRASH_DAMAGE_FACTOR } else { 1.0 };
            if impact_impulse > 0.0 && self.garage_protected(victim_id) { continue; }
            let vehicle = self.vehicles.get_mut(victim_id).unwrap();
            // Only an intact frontal guard braces impact wear. Its HP pool is
            // spent below; a second impact after a break receives normal wear.
            let mut forward=body.rotation()*Vector::z();forward.y=0.0;
            let mut toward=impact_direction;toward.y=0.0;
            let frontal_shield=self.guard_boosts.get(victim_id).is_some_and(|g|g.active()&&g.shield_hp>0.0)
                && toward.norm_squared()>0.0001 && forward.norm_squared()>0.0001
                && toward.normalize().dot(&forward.normalize())>=crate::guard_boost::GUARD_FRONT_DOT;
            let delta_v=impact_impulse/body.mass().max(1.0);
            let guarded_wear=frontal_shield&&self.guard_boosts.get(victim_id).is_some_and(|g|g.mobility_active());
            let dive=self.guard_boosts.get(victim_id).is_some_and(|g|g.dive_remaining>0.0);
            let damage = if dive {0.0} else {vehicle.powertrain.impact(if guarded_wear {crate::guard_boost::guarded_impact_delta_v(delta_v)}else{delta_v}, vehicle.config.resources, scale)};
            if frontal_shield {self.guard_impact_directions.insert(victim_id.clone(),impact_direction);}
            if damage > 0.0 {
                let attacker=impact_source.filter(|_|!friendly).and_then(|source|{
                    let (source_pos,source_velocity)=impact_motion.get(&source)?;
                    let (victim_pos,_)=impact_motion.get(&vehicle.body)?;
                    let toward=victim_pos-source_pos;
                    let source_id=self.body_to_player.get(&source)?;
                    (source_id!=victim_id&&toward.norm()>0.1&&source_velocity.dot(&toward.normalize())>1.0).then(||source_id.clone())
                });
                let maximum=self.vehicle_health.get(victim_id).map(|h|h.max_hp).unwrap_or(500.0);
                impact_damage.push((victim_id.clone(),attacker,damage*maximum));
            }
        }
        let guard_contacts=self.guard_contacts(&impact_motion);
        self.apply_queued_impact_damage(impact_damage);
        self.guard_impact_directions.clear();
        self.resolve_guard_contacts(guard_contacts);



        self.apply_barrier_impacts(&impact_motion,dt);
        self.apply_ram_bonus(&impact_motion);

        // Recovery is server-owned and independent of menus or held input.
        // Allow a brief fall before resetting to the authored spawn, not origin.
        let mut recover = Vec::new();
        let mut defeats = Vec::new();
        for (id, vehicle) in &self.vehicles {
            let Some(body) = self.bodies.get(vehicle.body) else { continue };
            let p = body.translation();
            if !p.iter().all(|v| v.is_finite()) {
                if !self.is_defeated(id) { recover.push(id.clone()); }
                continue;
            }
            if let Some(coast) = &self.coast {
                // Airborne wheel rays can reach below a jump. Use the hull itself.
                let bottom = body.colliders().first().and_then(|h| self.colliders.get(*h))
                    .map_or(p.y, |c| c.compute_aabb().mins.y);
                let reason = if vehicle.config.wheels==0 && coast.water_surface_at(p.x,p.z).is_some() {
                    None // Water is support for the boat, not a death trigger.
                } else { coast.hazard(p, bottom) };
                if let Some(reason) = reason {
                    if self.vehicle_health.get(id).is_some_and(|h| !h.lost_to_environment()) {
                        defeats.push((id.clone(), reason));
                    }
                }
            } else if !self.is_defeated(id) {
                let road = self.spawn_poses.get(id).map(|s| s.1).unwrap_or(0.0);
                let elapsed = self.falling_seconds.entry(id.clone()).or_default();
                if p.y < road - 20.0 {
                    *elapsed += dt;
                    if *elapsed >= 2.0 { recover.push(id.clone()); }
                } else { *elapsed = 0.0; }
            }
        }
        for (id, reason) in defeats { self.defeat_from_environment(&id, reason); }
        for id in recover { if self.recover_vehicle_for_player(&id).is_ok() { self.falling_seconds.remove(&id); } }

        self.repair_invalid_body_positions();
    }

    fn repair_invalid_body_positions(&mut self) {
        // RigidBodySet::iter_mut queues EVERY visited body as modified, even
        // for a read-only position check. Do not send an unchanged city through
        // Rapier's modification pass twice per tick. Allocate only on failure.
        let invalid: Vec<_> = self.bodies.iter().filter_map(|(handle, body)| {
            let pos = body.translation();
            (!pos.iter().all(|v| v.is_finite()) || pos.y.abs() > 10_000.0).then_some(handle)
        }).collect();
        for handle in invalid {
            let body = self.bodies.get_mut(handle).unwrap();
            // Emergency fallback only; ordinary recovery uses authored spawns.
            let pos = vector![0.0, 5.0, 0.0];
            body.set_translation(pos, true);
            body.set_linvel(Vector::zeros(), true);
            body.set_angvel(Vector::zeros(), true);
            println!("⚠️ Reset exploding body back to {:?}", pos);
        }
    }

    /// Contact damage is simultaneous: validate every source before the first
    /// defeat is applied, so reciprocal lethal hits do not depend on HashMap
    /// iteration order. Weapon/Ram calls retain their live-attacker gate.
    pub(crate) fn apply_queued_impact_damage(&mut self, hits: Vec<(String, Option<String>, f32)>) {
        let accepted: Vec<_> = hits.into_iter().filter(|(victim, attacker, _)| {
            let Some(target) = self.vehicles.get(victim) else { return false; };
            if self.is_defeated(victim) { return false; }
            attacker.as_ref().is_none_or(|source| {
                self.vehicles.get(source).is_some_and(|attacker| {
                    source != victim && !self.is_defeated(source)
                        && !attacker.team.eq_ignore_ascii_case(&target.team)
                })
            })
        }).collect();
        for (victim, attacker, damage) in accepted {
            self.apply_validated_vehicle_damage(&victim,attacker.as_deref(),damage,"impact");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::suspension_contact::cast_wheel_ground;

    #[test]
    fn position_safety_repairs_bad_bodies_without_changing_valid_or_sleeping_ones() {
        let mut world = PhysicsWorld::new();
        let valid = world.bodies.insert(RigidBodyBuilder::fixed().translation(vector![12.0, 3.0, 9.0]).build());
        let sleeping = world.bodies.insert(RigidBodyBuilder::dynamic().translation(vector![4.0, 2.0, 8.0]).sleeping(true).build());
        for bad in [vector![f32::NAN, 0.0, 0.0], vector![0.0, 10_001.0, 0.0], vector![0.0, 0.0, f32::INFINITY]] {
            let handle = world.bodies.insert(RigidBodyBuilder::dynamic().translation(bad).linvel(vector![3.0, 1.0, 2.0]).build());
            world.repair_invalid_body_positions();
            assert_eq!(*world.bodies[handle].translation(), vector![0.0, 5.0, 0.0]);
            assert_eq!(*world.bodies[handle].linvel(), Vector::zeros());
        }
        assert_eq!(*world.bodies[valid].translation(), vector![12.0, 3.0, 9.0]);
        assert_eq!(*world.bodies[sleeping].translation(), vector![4.0, 2.0, 8.0]);
        assert!(world.bodies[sleeping].is_sleeping());
    }

    #[test]
    fn peer_setup_reuses_the_map_and_invalidates_after_tile_changes() {
        let mut world = PhysicsWorld::new();
        world.select_map("streaming_endless_city").unwrap();
        let before = world.map_snapshot_packet(7);
        let cached = world.map_json.get().unwrap().as_ptr();
        for _ in 0..6 {
            world.update_loaded_blocks_around_players();
            assert_eq!(world.map_snapshot_packet(7), before);
            assert_eq!(world.map_json.get().unwrap().as_ptr(), cached);
        }
        let full: serde_json::Value = serde_json::from_str(&before).unwrap();
        let legacy = serde_json::json!({"type":"map_snapshot","world_id":7,"data":world.map_snapshot()}).to_string();
        assert_eq!(full, serde_json::from_str::<serde_json::Value>(&legacy).unwrap());
        let tile = *world.block_world.loaded.keys().next().unwrap();
        world.unload_block(tile.0,tile.1);
        assert!(world.map_json.get().is_none());
        let partial: serde_json::Value = serde_json::from_str(&world.map_snapshot_packet(8)).unwrap();
        assert_eq!(partial["world_id"], 8);
        assert_eq!(partial["data"]["chunks"].as_array().unwrap().len()+1, full["data"]["chunks"].as_array().unwrap().len());
        world.update_loaded_blocks_around_players();
        assert_eq!(world.map_snapshot_packet(7), before);
    }

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
    fn camaro_launch_transfers_weight_and_nitrous_improves_grounded_acceleration() {
        fn launch(nos: bool) -> (f32, f32, f32) {
            let mut world = crate::support::tests::blank_world();
            let handle = world.spawn_vehicle_for_player("driver".into(), [0.;3], "camaro", "red").unwrap();
            world.vehicles.get_mut("driver").unwrap().powertrain.engine_requested = true;
            for _ in 0..150 { world.step(SIMULATION_DT); }
            let car = world.vehicles.get_mut("driver").unwrap();
            car.throttle = 1.;
            car.powertrain.boost_requested = nos;
            let mut peak_pitch = 0.0f32;
            for _ in 0..180 {
                world.step(SIMULATION_DT);
                let forward = world.bodies[handle].rotation() * Vector::z();
                peak_pitch = peak_pitch.max(forward.y.asin().to_degrees());
            }
            (world.bodies[handle].linvel().norm(), peak_pitch, world.vehicles["driver"].powertrain.nos_remaining_s)
        }
        let base = launch(false);
        let boosted = launch(true);
        assert!(base.1 > 0.15 && boosted.1 > base.1 && boosted.1 < 6.0, "launch pitch: {base:?}, {boosted:?}");
        assert!(boosted.0 > base.0 * 1.05 && boosted.2 < base.2-2., "launch speeds: {base:?}, {boosted:?}");
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
        world.vehicles.get_mut("target").unwrap().team = "blue".into();
        for vehicle in world.vehicles.values_mut() { vehicle.powertrain.engine_requested = false; }
        for _ in 0..120 { world.step(SIMULATION_DT); }
        // Test the impact attribution after protection, not the spawn shield.
        for health in world.vehicle_health.values_mut() {
            health.advance(crate::vehicle_health::SPAWN_PROTECTION_SECONDS);
        }
        assert_eq!(world.vehicles["attacker"].powertrain.ultimate_fraction,0.0);
        assert_eq!(world.vehicles["target"].powertrain.condition,1.0);
        let initial_hp = world.vehicle_health["target"].hp;
        world.bodies[attacker].set_linvel(vector![0.0,0.0,18.0],true);
        for _ in 0..100 {
            world.step(SIMULATION_DT);
            if world.vehicle_health["target"].hp < initial_hp { break; }
        }
        let target_health = &world.vehicle_health["target"];
        let dealt = (initial_hp - target_health.hp) / target_health.max_hp;
        assert!(dealt>0.0001,"test needs a damaging ram: attacker={:?}, target={:?}, target HP={}",world.bodies[attacker].translation(),world.bodies[target].translation(),target_health.hp);
        assert_eq!(target_health.last_attacker.as_deref(),Some("attacker"));
        assert!((world.vehicles["attacker"].powertrain.ultimate_fraction-dealt).abs()<1.0e-5);
        assert_eq!(world.vehicles["target"].powertrain.ultimate_fraction,0.0);
        assert_ne!(attacker,target);
    }

    #[test]
    fn friendly_contact_keeps_the_push_and_scales_crash_wear_on_both_cars() {
        let crash = |team: &str, target_hp: f32| {
            let mut w=flat_world();
            let a=w.spawn_vehicle_for_player("a".into(),[0.0;3],"brz","red").unwrap();
            let y=w.bodies[a].translation().y;
            w.bodies[a].set_translation(vector![0.0,y,-12.0],true);
            let b=w.spawn_vehicle_for_player("b".into(),[0.0;3],"brz","red").unwrap();
            w.vehicles.get_mut("b").unwrap().team=team.into();
            for _ in 0..120 { w.step(SIMULATION_DT); }
            for h in w.vehicle_health.values_mut(){h.spawn_protection_s=0.0;}
            w.vehicle_health.get_mut("b").unwrap().hp=target_hp;
            w.bodies[a].set_linvel(vector![0.0,0.0,27.0],true);
            for _ in 0..100 {
                w.step(SIMULATION_DT);
                if w.vehicle_health["b"].hp<target_hp {break;}
            }
            let wear=[1.0-w.vehicles["a"].powertrain.condition,1.0-w.vehicles["b"].powertrain.condition];
            (w.bodies[b].linvel().z, target_hp-w.vehicle_health["b"].hp,
             wear,w.vehicle_health["a"].stats.damage_dealt,w.vehicle_health["a"].kills)
        };
        let enemy=crash("blue",500.0);
        let ally=crash("red",500.0);
        assert!(enemy.0>1.0 && enemy.1>1.0 && enemy.3>0.0);
        assert!((ally.0-enemy.0).abs()<0.01,"impact impulse must be preserved");
        assert!((ally.1-enemy.1*FRIENDLY_CRASH_DAMAGE_FACTOR).abs()<0.05);
        for i in 0..2 {assert!((ally.2[i]-enemy.2[i]*FRIENDLY_CRASH_DAMAGE_FACTOR).abs()<0.001);}
        assert_eq!(ally.3,0.0);
        let low=crash("red",1.0);
        assert_eq!(low.1,1.0);assert_eq!(low.4,0);
    }

    #[test]
    fn only_recent_friendly_shoves_reduce_wall_damage() {
        fn hit_wall(shove_remaining: f32) -> f32 {
            let mut w=flat_world();
            let h=w.spawn_vehicle_for_player("driver".into(),[0.0;3],"brz","red").unwrap();
            for _ in 0..120 {w.step(SIMULATION_DT);}
            let p=*w.bodies[h].translation();
            w.colliders.insert(ColliderBuilder::cuboid(8.0,4.0,0.2)
                .translation(vector![p.x,2.0,p.z+4.0]).friction(0.0).build());
            let health=w.vehicle_health.get_mut("driver").unwrap();
            health.spawn_protection_s=0.0;health.friendly_shove_s=shove_remaining;
            let start=health.hp;
            w.bodies[h].set_linvel(vector![0.0,0.0,24.0],true);
            for _ in 0..60 {
                w.step(SIMULATION_DT);
                if w.vehicle_health["driver"].hp<start {break;}
            }
            start-w.vehicle_health["driver"].hp
        }
        let ordinary=hit_wall(0.0);
        assert!(ordinary>10.0);
        assert!((hit_wall(FRIENDLY_SHOVE_WINDOW_S)-ordinary*FRIENDLY_CRASH_DAMAGE_FACTOR).abs()<0.2);
        assert!((hit_wall(0.01)-ordinary).abs()<0.2);
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
    fn home_bay_replenishes_once_until_the_vehicle_leaves() {
        let mut world=PhysicsWorld::for_harbor_room(2,"harbor_canal_fleet").unwrap();
        let handle=world.spawn_vehicle_for_player("driver".into(),[0.;3],"brz","red").unwrap();
        let bay=world.active_map.as_ref().unwrap().authored_layout.as_ref().unwrap()
            .objects.iter().find(|o|o.id=="home-gas-west").unwrap().position;
        let center=vector![bay[0],bay[1]+1.,bay[2]];
        world.bodies[handle].set_translation(center,true);
        let train=&mut world.vehicles.get_mut("driver").unwrap().powertrain;
        train.ultimate_fraction=0.; train.fuel_liters=3.; train.nos_remaining_s=0.;
        world.vehicle_health.get_mut("driver").unwrap().hp=3.;
        world.bodies[handle].set_linvel(vector![2.,0.,0.],true);
        world.service_authored_bays(SIMULATION_DT);
        assert_eq!(world.vehicles["driver"].powertrain.fuel_liters,3.);
        world.bodies[handle].set_linvel(Vector::zeros(),true);
        world.service_authored_bays(SIMULATION_DT);
        let car=&world.vehicles["driver"];
        assert_eq!(car.powertrain.fuel_liters,car.config.resources.fuel_capacity_liters);
        assert_eq!(car.powertrain.nos_remaining_s,car.config.resources.nos_seconds);
        assert_eq!(car.powertrain.ultimate_fraction,1.);
        assert_eq!(world.vehicle_health["driver"].hp,world.vehicle_health["driver"].max_hp);
        world.vehicles.get_mut("driver").unwrap().powertrain.ultimate_fraction=0.;
        world.bodies[handle].set_linvel(vector![2.,0.,0.],true);
        world.service_authored_bays(SIMULATION_DT);
        world.bodies[handle].set_linvel(Vector::zeros(),true);
        world.service_authored_bays(SIMULATION_DT);
        assert_eq!(world.vehicles["driver"].powertrain.ultimate_fraction,0.);
        world.bodies[handle].set_translation(center+vector![0.,0.,30.],true);
        world.service_authored_bays(SIMULATION_DT);
        world.bodies[handle].set_translation(center,true);
        world.service_authored_bays(SIMULATION_DT);
        assert_eq!(world.vehicles["driver"].powertrain.ultimate_fraction,1.);
    }

    #[test]
    fn recovery_is_edge_triggered_and_refills_gauges() {
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
        let config=world.vehicles["recover-test"].config.resources;
        assert_eq!(train.fuel_liters,config.fuel_capacity_liters); assert_eq!(train.nos_remaining_s,config.nos_seconds);
        assert_eq!(train.condition,1.0); assert_eq!(train.temperature_c,config.initial_temp_c); assert_eq!(train.ultimate_fraction,1.0);
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
        world.install_map(Arc::new(map));
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
    fn harbor_exchange_brz_drives_both_tunnels_and_climbs_the_viaduct() {
        for (x, target_z, raised) in [(-66., 90., false), (62., 90., false), (84., -38., true)] {
            let mut world = PhysicsWorld::new();
            world.select_map("harbor_exchange").unwrap();
            let h = world.spawn_vehicle_for_player("exchange-driver".into(), [0.; 3], "brz", "red").unwrap();
            world.bodies[h].set_translation(vector![x, 0.895, -98.], true);
            world.bodies[h].set_rotation(Rotation::identity(), true);
            world.bodies.propagate_modified_body_positions_to_colliders(&mut world.colliders);
            world.query_pipeline.update(&world.colliders);
            world.vehicles.get_mut("exchange-driver").unwrap().powertrain.engine_requested = true;
            for _ in 0..180 { world.step(SIMULATION_DT); }
            world.vehicles.get_mut("exchange-driver").unwrap().throttle = 0.45;
            let mut arrived = false;
            for _ in 0..2400 {
                world.step(SIMULATION_DT);
                let p = world.bodies[h].translation();
                assert!(!world.is_defeated("exchange-driver") && (p.x - x).abs() < 3. && p.y > 0. && p.y < 12., "lost route: {p:?}");
                if p.z >= target_z {
                    assert!(!raised || p.y > 9.);
                    arrived = true; break;
                }
            }
            assert!(arrived, "BRZ did not finish corridor at x={x}: {:?}", world.bodies[h].translation());
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

    #[test]
    fn harbor_glass_run_reaches_the_opposite_roof() {
        let mut world=PhysicsWorld::new();
        world.select_map("harbor_canal_fleet").unwrap();
        let handle=world.spawn_vehicle_for_player("jumper".into(),[0.;3],"brz","blue").unwrap();
        let config=world.vehicles["jumper"].config;
        let start=Isometry::translation(119.,config.spawn_height(0.),-168.);
        world.bodies[handle].set_position(start,true);
        for _ in 0..100 {world.step(SIMULATION_DT);}
        let mut crossed=false;
        let mut landed=false;
        for _ in 0..960 {
            world.vehicles.get_mut("jumper").unwrap().throttle=1.;
            world.step(SIMULATION_DT);
            let p=world.bodies[handle].translation();
            if (-99.0..-90.0).contains(&p.z) && p.y>4.0 && world.wheels[&handle].iter().all(|w|!w.grounded) {crossed=true;}
            if (-87.0..-65.0).contains(&p.z) && (2.4..3.9).contains(&p.y) && world.wheels[&handle].iter().all(|w|w.grounded) {landed=true;break;}
            if p.z> -58.0 {break;}
        }
        assert_eq!(world.asset_health.get("shortcut-glass-east"),Some(&0.0));
        assert!(crossed && landed,"airborne across road={crossed}, on roof={landed}, end={:?}",world.bodies[handle].translation());
    }

    // Real BRZ on the installed fixture: accelerate with the existing powertrain,
    // then observe suspension takeoff and roof contact. No scripted launch force.
    #[test]
    fn road_jump_lab_brz_proves_takeoff_landing_and_an_open_gap() {
        for (label, throttle, boost) in [("unboosted",1.0,false),("nos",1.0,true),("slow",0.10,false)] {
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
        for id in ["ae86", "gt86", "brz", "camaro", "supra", "cx30", "mini", "fortuner", "landcruiser", "sierra", "tank"] {
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
        for id in ["ae86", "gt86", "brz", "camaro", "supra", "cx30", "mini", "fortuner", "landcruiser", "sierra", "tank"] {
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
        for id in ["ae86", "gt86", "brz", "camaro", "supra", "cx30", "mini", "fortuner", "landcruiser", "sierra", "tank"] {
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
    fn garage_immunity_follows_the_rotated_bay_and_expires_on_exit_or_destruction() {
        let mut world=PhysicsWorld::new();
        world.select_map("harbor_canal_fleet").unwrap();
        let handle=world.spawn_vehicle_for_player("home".into(),[0.;3],"camaro","blue").unwrap();
        let enemy=world.spawn_vehicle_for_player("away".into(),[0.;3],"brz","red").unwrap();
        let map=world.active_map.as_ref().unwrap();
        let bay=map.authored_layout.as_ref().unwrap().objects.iter().find(|o|o.id=="home-gas-east").unwrap().clone();
        for h in world.vehicle_health.values_mut() {h.spawn_protection_s=0.0;}
        let point=vector![bay.position[0],bay.position[1]+1.,bay.position[2]];
        world.bodies[handle].set_translation(point,true);
        let hp=world.vehicle_health["home"].hp;
        world.damage_vehicle("home",Some("away"),75.,"cannon");
        assert_eq!(world.vehicle_health["home"].hp,hp);
        let enemy_hp=world.vehicle_health["away"].hp;
        world.damage_vehicle("away",Some("home"),75.,"coax");
        assert_eq!(world.vehicle_health["away"].hp,enemy_hp);
        world.bodies[enemy].set_translation(point,true);
        assert!(!world.garage_protected("away"));
        world.asset_health.insert(bay.id.clone(),0.);
        assert!(!world.garage_protected("home"));
        world.asset_health.remove(&bay.id);
        world.bodies[handle].set_translation(point+Vector::x()*(bay.size[0]*0.5+2.1),true);
        world.damage_vehicle("home",None,75.,"impact");
        assert!(world.vehicle_health["home"].hp<hp);
    }

    #[test]
    fn hard_landing_keeps_the_hull_above_the_road_and_wheels_within_their_strut_travel() {
        let mut w=crate::support::tests::blank_world();
        let h=w.spawn_vehicle_for_player("drop".into(),[0.;3],"enforcer","red").unwrap();
        let cfg=w.vehicles["drop"].config;
        w.bodies[h].set_translation(vector![0.,4.,0.],true);
        w.bodies[h].set_linvel(vector![0.,-8.,0.],true);
        let mut deepest=0.0_f32;
        for _ in 0..200 {
            w.step(SIMULATION_DT);
            let body=&w.bodies[h];
            for x in [-1.,1.] {for z in [-1.,1.] {
                let p=body.position()*point![cfg.chassis_com_offset[0]+x*cfg.chassis_half_extents[0],
                    cfg.chassis_com_offset[1]-cfg.chassis_half_extents[1],cfg.chassis_com_offset[2]+z*cfg.chassis_half_extents[2]];
                deepest=deepest.min(p.y);
            }}
            for wheel in &w.wheels[&h] {
                let mount=body.position()*wheel.offset;
                let length=mount.y-wheel.world_center[1];
                assert!(length>=wheel.rest_length-0.001 && length<=wheel.full_droop_length()+0.001);
            }
        }
        // Rapier is a contact solver with a small numerical tolerance.
        assert!(deepest>=-0.02,"hull penetrated flat floor by {} m",-deepest);
    }

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
            world.vehicle_health.get_mut("test").unwrap().hp=200.0;
            world.service_authored_bays(1.0);
            let state=&world.vehicles["test"].powertrain;
            assert_eq!(state.fuel_liters,if kind=="repair-shop" {1.0} else {4.0});
            assert_eq!(state.nos_remaining_s,if kind=="repair-shop" {0.0}else{1.5});
            assert!((state.condition-if kind=="fuel-station" {0.5} else {0.56}).abs()<0.0001);
            let fuel=state.fuel_liters; let condition=state.condition;
            let hp=world.vehicle_health["test"].hp;assert_eq!(hp,if kind=="fuel-station"{200.0}else{250.0});
            let stats=&world.vehicle_health["test"].stats;
            assert_eq!(stats.healing_done,if kind=="fuel-station"{0.0}else{50.0});
            assert_eq!(stats.self_healing,stats.healing_done);
            assert_eq!(stats.gas_gained_liters,if kind=="repair-shop"{0.0}else{3.0});
            world.bodies[handle].set_linvel(vector![1.0,0.0,0.0],true);
            world.service_authored_bays(1.0);
            assert_eq!(world.vehicles["test"].powertrain.fuel_liters,fuel);
            assert_eq!(world.vehicles["test"].powertrain.condition,condition);
            assert_eq!(world.vehicle_health["test"].hp,hp);
            world.bodies[handle].set_linvel(Vector::zeros(),true);
            world.asset_health.insert("test-bay".into(),0.0);
            world.service_authored_bays(1.0);
            assert_eq!(world.vehicles["test"].powertrain.nos_remaining_s,if kind=="repair-shop"{0.0}else{1.5});
            assert_eq!(world.vehicle_health["test"].hp,hp);
            world.bodies[handle].set_translation(vector![50.0,1.0,0.0],true);
            world.service_authored_bays(1.0);
            assert_eq!(world.vehicles["test"].powertrain.fuel_liters,fuel);
            assert_eq!(world.vehicles["test"].powertrain.condition,condition);
            assert_eq!(world.vehicle_health["test"].hp,hp);
            world.vehicle_health.get_mut("test").unwrap().defeated=true;
            world.asset_health.clear();world.bodies[handle].set_translation(vector![0.0,1.0,0.0],true);world.service_authored_bays(1.0);
            assert_eq!(world.vehicle_health["test"].hp,hp,"a repair bay cannot revive a defeated vehicle");
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
        physics.unload_block(0, 0);
        physics.update_loaded_blocks_around_players();
        let wall = physics.bodies.iter().find(|(_, body)| body.user_data == 1).unwrap().1;
        assert!(wall.colliders().iter().all(|h| !physics.colliders[*h].is_enabled()));
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
 fn impact(vehicle:&str,destructible:bool,speed:f32,rail_kind:&str)->Option<f32>{
  let hp=match rail_kind {"highway-guardrail"=>5, "breakaway-glass"=>3, _=>100};
  let mut value:serde_json::Value=serde_json::from_str(include_str!("assets/blocks/coastal_district_colliders.json")).unwrap();
  value["team_spawns"]=serde_json::json!({"red":[{"chunk":[0,0],"local":[0,0],"yaw":0,"surface_y":0}],"blue":[]});
  value["authored_layout"]=serde_json::json!({"format":"avenlab-world-layout","version":1,"map_id":"coastal_district","title":"Rail impact range","base":"replace","ground":true,"repeat":false,"objects":[{"id":"edge-rail","name":"Bridge edge rail","piece":rail_kind,"position":[0,0,8],"size":[16,2,0.5],"yaw":0,"color":"#888888","locked":false,"solid":true,"parts":[{"shape":"box","position":[0,0.5,0],"size":[1,1,1],"solid":true}],"destruction":{"enabled":destructible,"hp":hp,"smallArms":1,"cannon":1,"bomb":1.5,"rubble":"clear"}}]});
  let mut w=PhysicsWorld::from_editor_document(serde_json::from_value(value).unwrap()).unwrap();let body=w.spawn_vehicle_for_player("driver".into(),[0.0;3],vehicle,"red").unwrap();
  for _ in 0..180{w.step(SIMULATION_DT);}
  w.bodies[body].set_linvel(Vector::new(0.0,0.0,speed),true);
  for _ in 0..120{w.step(SIMULATION_DT);}
  let hp=w.asset_health.get("edge-rail").copied();
  if hp==Some(0.0){assert!(w.bodies.iter().filter(|(_,b)|b.user_data==1).all(|(_,b)|b.colliders().iter().all(|h|!w.colliders[*h].is_enabled())));}
  hp
 }
 #[test]fn heavy_tank_breaks_an_authored_edge_rail_without_ram_while_light_car_does_less(){
  assert_eq!(impact("tank",true,10.0,"barrier"),Some(0.0));
  assert!(impact("brz",true,10.0,"barrier").unwrap_or(100.0)>50.0);
  assert_eq!(impact("tank",false,10.0,"barrier"),None);
  assert_eq!(impact("tank",true,0.0,"barrier"),None);
  assert_eq!(impact("brz",true,10.0,"breakaway-glass"),Some(0.0));
  assert_eq!(impact("brz",true,2.5,"breakaway-glass"),None);
  assert_eq!(impact("brz",true,2.5,"highway-guardrail"),None);
  assert_eq!(impact("brz",true,10.0,"highway-guardrail"),Some(0.0));
 }
}

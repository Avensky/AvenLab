//! Rigid-body inertia, mass center and nominal ride geometry.
use rapier3d::prelude::*;

/// Body-local dimensions and wheel geometry in meters, with mass in kilograms.
/// Forward is +Z, right is +X, and up is +Y.
#[derive(Clone, Copy, Debug)]
pub struct ChassisGeometry {
    pub mass: f32,
    pub chassis_half_extents: [f32; 3],
    pub chassis_com_offset: [f32; 3],
    pub center_of_mass_height: f32,
    pub wheel_y: f32,
    pub wheel_radius: f32,
    pub suspension_rest_length: f32,
    pub suspension_max_length: f32,
    pub suspension_sag: f32,
    pub front_axle_z: f32,
    pub rear_axle_z: f32,
}

impl ChassisGeometry {
    pub fn spawn_height(&self, road_y: Real) -> Real {
        self.nominal_chassis_y(road_y)
            .max(road_y + self.chassis_half_extents[1] - self.chassis_com_offset[1] + 0.05)
    }

    /// Handling mass is independent of collision/visual origins. The cuboid
    /// inertia is a finite approximation about this COM, not a rotation lock.
    pub fn mass_properties(&self) -> MassProperties {
        let [hx, hy, hz] = self.chassis_half_extents;
        let local_com = point![
            self.chassis_com_offset[0],
            self.center_of_mass_height - self.nominal_chassis_y(0.0),
            self.chassis_com_offset[2],
        ];
        MassProperties::new(
            local_com,
            self.mass,
            self.mass / 3.0 * vector![hy * hy + hz * hz, hx * hx + hz * hz, hx * hx + hy * hy,],
        )
    }

    /// Static body-local wheel-center Y for aligning imported visual assets.
    /// The existing body pose and runtime suspension remain authoritative.
    pub fn nominal_wheel_center_y(&self) -> f32 {
        self.wheel_y - self.suspension_rest_length - self.suspension_max_length
            + self.suspension_sag
    }

    /// Nominal body-origin height that gives each upright wheel its target sag.
    /// mount_y = body_y + wheel_y; center_y = road_y + radius;
    /// mount_y - center_y = full_droop - sag. Solve once for body_y.
    /// This is a spawn estimate; Rapier still resolves axle load/pitch at runtime.
    pub fn nominal_chassis_y(&self, road_y: f32) -> f32 {
        road_y + self.wheel_radius + self.suspension_rest_length + self.suspension_max_length
            - self.suspension_sag
            - self.wheel_y
    }

    /// Front-to-rear axle distance used by Ackermann and tire physics.
    #[inline]
    pub fn wheelbase(&self) -> f32 {
        (self.front_axle_z - self.rear_axle_z).abs()
    }
}

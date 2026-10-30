//! Decorative placements carry approved visual references, never vehicle bodies.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VehiclePlacement { pub asset: VehicleAsset, pub lod: VehicleLod }
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all="snake_case")]
pub enum VehicleAsset { Ae86, Brz, Camaro, Supra, Tank }
impl VehicleAsset {
    pub fn id(self) -> &'static str { match self {
        Self::Ae86=>"ae86", Self::Brz=>"brz", Self::Camaro=>"camaro", Self::Supra=>"supra", Self::Tank=>"tank",
    }}
}
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all="snake_case")]
pub enum VehicleLod { Auto, Proxy, Full }

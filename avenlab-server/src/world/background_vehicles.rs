//! Decorative placements carry approved visual references, never vehicle bodies.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VehiclePlacement { pub asset: VehicleAsset, pub lod: VehicleLod }
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all="snake_case")]
pub enum VehicleAsset { Ae86, Brz, Camaro, Supra, Cx30, Fortuner, #[serde(rename="landcruiser")] LandCruiser, Sierra, Mini, Tank, Enforcer, Interceptor, Charger70, Skyline34, Timecar }
impl VehicleAsset {
    pub fn id(self) -> &'static str { match self {
        Self::Ae86=>"ae86", Self::Brz=>"brz", Self::Camaro=>"camaro", Self::Supra=>"supra", Self::Cx30=>"cx30", Self::Fortuner=>"fortuner", Self::LandCruiser=>"landcruiser", Self::Sierra=>"sierra", Self::Mini=>"mini", Self::Tank=>"tank",
        Self::Enforcer=>"enforcer", Self::Interceptor=>"interceptor", Self::Charger70=>"charger70", Self::Skyline34=>"skyline34", Self::Timecar=>"timecar",
    }}
}
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all="snake_case")]
pub enum VehicleLod { Auto, Proxy, Full }

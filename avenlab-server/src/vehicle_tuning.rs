//! Bounded editor-only tuning. Omitted fields always come from the factory
//! config, so restoring a preset cannot retain hidden values from an old tune.
use crate::vehicle_state::VehicleConfig;
use serde_json::{Map, Value};

pub fn validated_config(mut c: VehicleConfig, patch: &Map<String, Value>) -> Result<VehicleConfig, String> {
    if let Some(stages)=patch.get("mod_stages") {
        if patch.len()!=1 {return Err("Mod stages cannot be mixed with raw tuning fields.".into());}
        let stages=stages.as_object().ok_or("Mod stages must be an object.")?;
        let catalog:Value=serde_json::from_str(include_str!("assets/vehicle-mods.json")).map_err(|_|"Invalid mod catalog")?;
        let mut factors=std::collections::BTreeMap::<String,f64>::new();
        for (id,value) in stages {
            let stage=value.as_u64().filter(|v|*v<=3).ok_or("Mod stage must be an integer from 0 to 3.")?;
            let effects=catalog.get(id).and_then(|p|p["effects"].as_object()).ok_or("Unknown mod part.")?;
            for (stat,amount) in effects {*factors.entry(stat.clone()).or_insert(1.0)+=amount.as_f64().ok_or("Invalid mod effect")?*stage as f64;}
        }
        let mut resolved=Map::new();
        for (stat,factor) in factors {
            let stock=match stat.as_str(){"engine_force"=>c.engine_force,"max_speed"=>c.max_speed,"mu_base"=>c.mu_base,"brake_force"=>c.brake_force,"mass"=>c.mass,"suspension_damping_ratio"=>c.suspension_damping_ratio,"cooling_multiplier"=>c.resources.cooling_multiplier,_=>return Err("Unsupported mod stat".into())};
            resolved.insert(stat,serde_json::json!(stock as f64*factor));
        }
        return validated_config(c,&resolved);
    }
    let tracked=c.tracked;
    for (key, value) in patch {
        if key == "abs_enabled" || key == "tcs_enabled" {
            let enabled = value.as_bool().ok_or("Assist values must be boolean.")?;
            if key == "abs_enabled" { c.abs_enabled = enabled; } else { c.tcs_enabled = enabled; }
            continue;
        }
        let (target, min, max): (&mut f32, f32, f32) = match key.as_str() {
            "mass" => (&mut c.mass, 300.0, 60000.0),
            "engine_force" => (&mut c.engine_force, 0.0, 200000.0),
            "cooling_multiplier" => (&mut c.resources.cooling_multiplier, 0.25, 32.0),
            "brake_force" => (&mut c.brake_force, 100.0, 300000.0),
            "max_speed" => (&mut c.max_speed, 2.0, 150.0),
            "linear_damping" => (&mut c.linear_damping, 0.0, 5.0),
            "angular_damping" => (&mut c.angular_damping, 0.0, 10.0),
            "mu_base" => (&mut c.mu_base, 0.1, 3.0),
            "load_sensitivity" => (&mut c.load_sensitivity, 0.0, 1.0),
            "max_steer_angle" => (&mut c.max_steer_angle, if tracked {0.0}else{0.05}, 1.2),
            "ackermann" => (&mut c.ackermann, 0.0, 1.0),
            "wheel_radius" => (&mut c.wheel_radius, 0.15, 1.5),
            "suspension_rest_length" => (&mut c.suspension_rest_length, 0.01, 1.5),
            "suspension_max_length" => (&mut c.suspension_max_length, 0.02, 1.5),
            "suspension_sag" => (&mut c.suspension_sag, 0.01, 1.0),
            "suspension_damping_ratio" => (&mut c.suspension_damping_ratio, 0.1, 3.0),
            "arb_front" => (&mut c.arb_front, 0.0, 200000.0),
            "arb_rear" => (&mut c.arb_rear, 0.0, 200000.0),
            "center_of_mass_height" => (&mut c.center_of_mass_height, 0.05, 3.0),
            _ => return Err(format!("Unsupported tuning field: {key}")),
        };
        let n = value.as_f64().ok_or_else(|| format!("{key} must be a number."))?;
        if !n.is_finite() || n < min as f64 || n > max as f64 {
            return Err(format!("{key} must be between {min} and {max}."));
        }
        *target = n as f32;
    }
    if tracked {c.max_steer_angle=0.0;c.ackermann=0.0;}
    if c.suspension_sag >= c.suspension_max_length {
        return Err("Suspension sag must be smaller than suspension travel.".into());
    }
    let clearance = c.nominal_chassis_y(0.0) + c.chassis_com_offset[1] - c.chassis_half_extents[1];
    if clearance < 0.05 { return Err("Raise the suspension or wheel radius to retain 5 cm chassis clearance.".into()); }
    Ok(c)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vehicle_setup::AE86;
    #[test]
    fn staged_mods_are_bounded_and_factory_relative() {
        let patch=serde_json::json!({"mod_stages":{"turbo":3,"tires":2,"weight":1}});
        let a=validated_config(AE86,patch.as_object().unwrap()).unwrap();
        let b=validated_config(AE86,patch.as_object().unwrap()).unwrap();
        assert!((a.engine_force-AE86.engine_force*1.36).abs()<0.01);
        assert_eq!(a.engine_force,b.engine_force);
        assert!((a.mu_base-AE86.mu_base*1.16).abs()<0.001);
        assert_eq!(validated_config(AE86,serde_json::json!({"mod_stages":{}}).as_object().unwrap()).unwrap().engine_force,AE86.engine_force);
        for invalid in [serde_json::json!({"mod_stages":{"turbo":4}}),serde_json::json!({"mod_stages":{"turbo":-1}}),serde_json::json!({"mod_stages":{"turbo":1.5}}),serde_json::json!({"mod_stages":{"unknown":1}}),serde_json::json!({"mod_stages":{},"engine_force":1000})]{assert!(validated_config(AE86,invalid.as_object().unwrap()).is_err());}
    }
    #[test]
    fn intercooler_stages_increase_cooling_and_restore_stock() {
        let patch = serde_json::json!({"mod_stages":{"intercooler":3}});
        let tuned = validated_config(AE86, patch.as_object().unwrap()).unwrap();
        assert!((tuned.resources.cooling_multiplier - AE86.resources.cooling_multiplier * 1.3).abs() < 0.0001);
        assert_eq!(tuned.engine_force, AE86.engine_force);
        let restored = validated_config(AE86, serde_json::json!({"mod_stages":{"intercooler":0}}).as_object().unwrap()).unwrap();
        assert_eq!(restored.resources.cooling_multiplier, AE86.resources.cooling_multiplier);
        assert!(validated_config(AE86, serde_json::json!({"cooling_multiplier":33}).as_object().unwrap()).is_err());
    }
    #[test]
    fn rejects_bad_fields_ranges_and_sag() {
        for patch in [serde_json::json!({"mass":0}), serde_json::json!({"mass":"heavy"}),
            serde_json::json!({"chassis_half_extents":[1,1,1]}),
            serde_json::json!({"suspension_sag":1.0,"suspension_max_length":0.2})] {
            assert!(validated_config(AE86, patch.as_object().unwrap()).is_err());
        }
    }
    #[test]
    fn applies_supported_fields_without_mutating_factory() {
        let c = validated_config(AE86, serde_json::json!({"mass":1500,"abs_enabled":false}).as_object().unwrap()).unwrap();
        assert_eq!(c.mass,1500.0); assert!(!c.abs_enabled); assert_eq!(c.engine_force, AE86.engine_force);
        assert_ne!(AE86.mass,1500.0);
    }
}

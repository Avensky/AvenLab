//! Self-contained AI v1 input, little endian. Same authoritative pipeline as
//! JSON. A malformed or newer packet is discarded before replacing held input.
use crate::state::{CombatPose, InputPacket};

struct Reader<'a>(&'a [u8]);

impl Reader<'_> {
    fn bytes<const N: usize>(&mut self) -> Option<[u8; N]> {
        let (value, tail) = self.0.split_first_chunk::<N>()?;
        self.0 = tail;
        Some(*value)
    }
    fn float(&mut self) -> Option<f32> {
        let n = f32::from_le_bytes(self.bytes()?);
        n.is_finite().then_some(n)
    }
    fn mask(&mut self) -> Option<u32> { Some(u32::from_le_bytes(self.bytes()?)) }
}

pub fn decode(data: &[u8]) -> Option<InputPacket> {
    if !(32..=78).contains(&data.len()) { return None; }
    let mut r = Reader(data);
    let [b'A', b'I', 1, fields] = r.bytes()? else { return None; };
    if fields & !31 != 0 { return None; }
    let mut p = InputPacket {
        r#type: "input".into(), seq: r.mask()?, dt: r.float()?, throttle: r.float()?,
        steer: r.float()?, brake: r.float()?, handbrake: r.float()?,
        vehicleMask: u16::from_le_bytes(r.bytes()?), playerMask: u16::from_le_bytes(r.bytes()?),
        cockpit_mask: None, parking_brake: None, cabin_mask: None, debug_mask: None, combat: None,
    };
    if fields & 1 != 0 { p.cockpit_mask = Some(r.mask()?); }
    if fields & 2 != 0 { p.parking_brake = Some(r.float()?); }
    if fields & 4 != 0 { p.cabin_mask = Some(r.mask()?); }
    if fields & 8 != 0 { p.debug_mask = Some(r.mask()?); }
    if fields & 16 != 0 {
        let [actions, mount] = r.bytes()?;
        if actions & !31 != 0 || mount & !15 != 0 { return None; }
        let weapon = ["cannon", "coax", "basket"].get((mount & 3) as usize)?;
        let role = ["assault", "support", "medic"].get((mount >> 2) as usize)?;
        p.combat = Some(CombatPose {
            enabled: actions & 1 != 0, fire: actions & 2 != 0, ram: actions & 4 != 0,
            hull_locked: actions & 8 != 0, weapon: (*weapon).into(), role: (*role).into(),
            yaw: r.float()?, pitch: r.float()?, x: r.float()?, y: r.float()?, z: r.float()?,
            lock_target: if actions & 16 != 0 { Some([r.float()?, r.float()?]) } else { None },
            ..Default::default()
        });
    }
    r.0.is_empty().then_some(p)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_browser_vectors_decode_and_invalid_samples_do_not_replace_input() {
        let cases: serde_json::Value=serde_json::from_str(include_str!("../tests/fixtures/packed-input-v1.json")).unwrap();
        for case in cases.as_array().unwrap() {
            let text=case["hex"].as_str().unwrap();
            let bytes: Vec<u8>=(0..text.len()).step_by(2).map(|i|u8::from_str_radix(&text[i..i+2],16).unwrap()).collect();
            let p=decode(&bytes).unwrap();
            let legacy: InputPacket=serde_json::from_value(case["input"].clone()).unwrap();
            assert_eq!((p.seq,p.dt,p.throttle,p.steer,p.brake,p.handbrake),(legacy.seq,legacy.dt,legacy.throttle,legacy.steer,legacy.brake,legacy.handbrake));
            assert_eq!((p.vehicleMask,p.playerMask,p.debug_mask,p.cockpit_mask,p.parking_brake,p.cabin_mask),(legacy.vehicleMask,legacy.playerMask,legacy.debug_mask,legacy.cockpit_mask,legacy.parking_brake,legacy.cabin_mask));
            assert_eq!(p.combat.as_ref().and_then(|c|c.lock_target),legacy.combat.as_ref().and_then(|c|c.lock_target));
            assert_eq!(serde_json::to_value(p.combat).unwrap(),serde_json::to_value(legacy.combat).unwrap());
            for n in 0..bytes.len(){assert!(decode(&bytes[..n]).is_none());}
            let mut bad=bytes.clone();bad[2]=2;assert!(decode(&bad).is_none());
            let mut bad=bytes.clone();bad.extend([0]);assert!(decode(&bad).is_none());
            let mut bad=bytes.clone();bad[8..12].copy_from_slice(&f32::NAN.to_le_bytes());assert!(decode(&bad).is_none());
        }
    }
}

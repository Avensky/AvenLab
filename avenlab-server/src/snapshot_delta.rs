//! Immutable keyframes make latest-frame coalescing safe. Raw JSON slices avoid
//! parsing and reformatting thousands of physics floats for every publication.
use std::{collections::{BTreeMap, HashMap}, fmt::Write, sync::{Arc, atomic::{AtomicU64, Ordering}}};
use serde::Deserialize;
use serde_json::value::RawValue;

static NEXT_BASE: AtomicU64 = AtomicU64::new(1);
const KEYFRAME_TICKS: u64 = 60;
#[derive(Debug)]
pub struct Keyframe { pub id: u64, pub packet: String }
struct Base { tick: u64, ids: Vec<String>, data: Box<RawValue>, keyframe: Arc<Keyframe> }
#[derive(Default)]
pub struct SnapshotCache { bases: HashMap<u8, Base> }
#[derive(Deserialize)]
struct Envelope<'a> {
    world_id: usize,
    #[serde(borrow)]
    data: &'a RawValue,
}
fn array(value: &RawValue) -> Vec<&RawValue> {
    serde_json::from_str(value.get()).expect("typed snapshot array")
}
fn replace(value: &RawValue) -> String { format!("[0,{}]", value.get()) }

/// Tags: 0=replace, 1=array mask (low/high u32), 2=existing object fields.
fn patch(base: &RawValue, current: &RawValue) -> Option<String> {
    if base.get() == current.get() { return None; }
    match (base.get().as_bytes()[0], current.get().as_bytes()[0]) {
        (b'[', b'[') => {
            let a = array(base);
            let b = array(current);
            if a.len() != b.len() || b.len() > 64 { return Some(replace(current)); }
            // Dense scalar vectors are cheaper whole. Never apply that shortcut
            // to entity lists: every car moving must not resend static fields.
            let scalar = b.iter().all(|v| !matches!(v.get().as_bytes()[0], b'[' | b'{'));
            if scalar && a.iter().zip(&b).filter(|(x,y)| x.get()!=y.get()).count() >= b.len().saturating_sub(1) {
                return Some(replace(current));
            }
            let (mut lo, mut hi) = (0u32, 0u32);
            let mut changes = String::new();
            for (index, (before, after)) in a.iter().zip(b).enumerate() {
                if let Some(change) = patch(before, after) {
                    if index < 32 { lo |= 1u32 << index; } else { hi |= 1u32 << (index-32); }
                    changes.push(','); changes.push_str(&change);
                }
            }
            if lo == 0 && hi == 0 { None }
            else { Some(format!("[1,{lo},{hi}{changes}]")) }
        }
        (b'{', b'{') => {
            let a: BTreeMap<String, &RawValue> = serde_json::from_str(base.get()).expect("typed snapshot object");
            let b: BTreeMap<String, &RawValue> = serde_json::from_str(current.get()).expect("typed snapshot object");
            if a.len()!=b.len() || a.keys().ne(b.keys()) { return Some(replace(current)); }
            let mut fields = String::new();
            let mut count = 0;
            for (key, value) in &b {
                if let Some(change) = patch(a[key], value) {
                    if count > 0 { fields.push(','); }
                    write!(fields, "{}:{change}", serde_json::to_string(key).unwrap()).unwrap();
                    count += 1;
                }
            }
            if count == 0 { None }
            else if count >= b.len().saturating_sub(1) { Some(replace(current)) }
            else { Some(format!("[2,{{{fields}}}]")) }
        }
        _ => Some(replace(current)),
    }
}

impl SnapshotCache {
    /// Public, red-only and blue-only views never share a cached baseline.
    pub fn encode(&mut self, scope: u8, tick: u64, full: String) -> (String, Arc<Keyframe>) {
        let envelope: Envelope<'_> = serde_json::from_str(&full).expect("typed compact JSON");
        let data = envelope.data;
        let root = array(data);
        let ids: Vec<String> = array(root[3]).iter().map(|entity|
            serde_json::from_str(array(entity)[0].get()).expect("entity ID")).collect();
        if let Some(base) = self.bases.get(&scope).filter(|base|
            tick>=base.tick && tick-base.tick<KEYFRAME_TICKS && base.ids==ids) {
            let change = patch(&base.data, data).unwrap_or_else(|| "null".into());
            let update = format!("{{\"type\":\"snapshot_delta\",\"version\":1,\"world_id\":{},\"base_id\":{},\"patch\":{change}}}", envelope.world_id, base.keyframe.id);
            if update.len() < full.len() { return (update, base.keyframe.clone()); }
        }
        let id = NEXT_BASE.fetch_add(1, Ordering::Relaxed);
        let packet = format!("{{\"type\":\"snapshot_compact\",\"version\":1,\"world_id\":{},\"base_id\":{id},\"data\":{}}}", envelope.world_id, data.get());
        let keyframe = Arc::new(Keyframe { id, packet: packet.clone() });
        self.bases.insert(scope, Base { tick, ids, data: data.to_owned(), keyframe: keyframe.clone() });
        (packet, keyframe)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value, value::to_raw_value};
    fn value_patch(base: &Value, current: &Value) -> Option<Value> {
        patch(&to_raw_value(base).unwrap(), &to_raw_value(current).unwrap())
            .map(|value| serde_json::from_str(&value).unwrap())
    }
    #[test]
    fn array_mask_covers_both_words_and_return_to_base_omits_old_changes() {
        let base=json!((0..40).collect::<Vec<_>>()); let mut changed=base.clone();
        changed[0]=json!(50); changed[32]=json!(75); changed[39]=json!(100);
        assert_eq!(value_patch(&base,&changed).unwrap(),json!([1,1,129,[0,50],[0,75],[0,100]]));
        assert!(value_patch(&base,&base).is_none());
    }
    #[test]
    fn keyframes_rotate_on_age_or_membership_and_keep_privacy_scopes_separate() {
        let full=|tick,id:&str|json!({"type":"snapshot_compact","version":1,"world_id":1,"data":[tick,0,0,[[id]],null,{},{}]}).to_string();
        let mut cache=SnapshotCache::default();
        let (_,first)=cache.encode(1,2,full(2,"red"));
        let (delta,same)=cache.encode(1,4,full(4,"red")); assert_eq!(first.id,same.id);
        assert_eq!(serde_json::from_str::<Value>(&delta).unwrap()["type"],"snapshot_delta");
        let (_,blue)=cache.encode(2,4,full(4,"blue")); assert_ne!(first.id,blue.id);
        let (_,aged)=cache.encode(1,62,full(62,"red")); assert_ne!(aged.id,first.id);
        let (_,joined)=cache.encode(1,64,full(64,"replacement")); assert_ne!(joined.id,aged.id);
    }
    #[test]
    fn movement_in_every_entity_keeps_static_fields_out_of_the_delta() {
        let base=json!((0..10).map(|id|json!([id,[0,0,0],"unchanged-paint-and-configuration",500,0,0])).collect::<Vec<_>>());
        let mut moving=base.clone();
        for entity in moving.as_array_mut().unwrap() { entity[1]=json!([10,20,30]); }
        let delta=value_patch(&base,&moving).unwrap();
        assert_eq!(delta[0],1);
        assert!(!delta.to_string().contains("unchanged-paint-and-configuration"));
    }
    #[test]
    fn raw_numbers_and_escaped_object_keys_keep_their_exact_representation() {
        let before: &RawValue=serde_json::from_str(r#"{"escaped\"key":0,"same":1,"other":2}"#).unwrap();
        let after: &RawValue=serde_json::from_str(r#"{"escaped\"key":1.2345678901234567,"same":1,"other":2}"#).unwrap();
        let delta=patch(before,after).unwrap();
        assert!(delta.contains("1.2345678901234567"));
        assert_eq!(serde_json::from_str::<Value>(&delta).unwrap(),json!([2,{"escaped\"key":[0,1.2345678901234567]}]));
    }
}

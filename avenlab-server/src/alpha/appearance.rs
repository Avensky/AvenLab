//! Small authoritative loadout payload. Rare skins stay entitlement-gated;
//! editable alpha paint is separate from future paid bundles and emotes.
use serde::{Serialize, Deserialize};
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct HeroAppearance {
    pub body: String,
    pub finish: String,
    pub metallic: f32,
    pub seats: String,
    pub skin: String,
}
impl Default for HeroAppearance {
    fn default() -> Self { Self { body:"factory".into(), finish:"gloss".into(), metallic:0.42, seats:"factory".into(), skin:"factory".into() } }
}
impl HeroAppearance {
    pub fn validate(&self, owned: &std::collections::BTreeSet<String>) -> Result<(),String> {
        if self.body != "factory" && !(self.body.len()==7 && self.body.starts_with('#') && self.body[1..].bytes().all(|b|b.is_ascii_hexdigit())) { return Err("Choose a valid body color.".into()); }
        // Accept the legacy keys in saves and clients that predate named finishes.
        if !matches!(self.finish.as_str(), "factory" | "gloss" | "satin" | "matte" | "high-gloss" | "metallic" | "frs" | "soft")
            || !matches!(self.seats.as_str(), "factory" | "black" | "red") { return Err("Unknown appearance option.".into()); }
        if !self.metallic.is_finite() || !(0.0..=1.0).contains(&self.metallic) { return Err("Metallic finish must be between 0 and 1.".into()); }
        if !owned.contains(&self.skin) { return Err("This skin is locked.".into()); }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
 use super::*;
 #[test] fn appearance_rejects_unknown_options_and_unowned_rare_skins() {
  let owned=std::collections::BTreeSet::from(["factory".to_string()]);
  let mut a=HeroAppearance::default();a.body="#f4f5f7".into();assert!(a.validate(&owned).is_ok());
  a.skin="secret-rare".into();assert!(a.validate(&owned).is_err());a.skin="factory".into();
  a.body="not-a-color".into();assert!(a.validate(&owned).is_err());
  a.body="factory".into();a.finish="broken".into();assert!(a.validate(&owned).is_err());
  for finish in ["gloss","satin","matte","high-gloss","metallic","frs","soft"] {
      a.finish=finish.into();
      assert!(a.validate(&owned).is_ok());
  }
 }
}

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::LazyLock;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CharacterChoice {
    pub id: String,
    pub outfit: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity: Option<CharacterIdentity>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub appearance: Option<CharacterAppearance>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prop: Option<CharacterProp>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wardrobe: Option<WardrobeChoice>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub garments: Option<BTreeMap<String, String>>,
    #[serde(rename = "wardrobeTrial", default, skip_serializing_if = "Option::is_none")]
    pub wardrobe_trial: Option<WardrobeChoice>,
    #[serde(rename = "wardrobeEase", default, skip_serializing_if = "Option::is_none")]
    pub wardrobe_ease: Option<u8>,
    #[serde(rename = "removedClothing", default, skip_serializing_if = "Option::is_none")]
    pub removed_clothing: Option<Vec<WardrobeRemoval>>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum WardrobeRemoval { Top, Corset, Skirt, Shoes, Socks, Hat, Bow, BonnetBow, Harness }

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WardrobeChoice {
    pub set: String,
    #[serde(deserialize_with = "ShirtLayer::deserialize_legacy")]
    pub shirt: ShirtLayer,
    pub waist: WaistLayer,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ShirtLayer { None, Under, Over }

impl ShirtLayer {
    fn deserialize_legacy<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::deserialize(deserializer).map(|_| Self::None)
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WaistLayer { Tucked, Over }

#[derive(Deserialize)]
struct WardrobeSet {
    id: String,
    #[serde(default)]
    retired: bool,
}

static WARDROBE: LazyLock<Vec<WardrobeSet>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../assets/character-wardrobe.json"))
        .expect("the built-in wardrobe catalog is valid")
});

#[derive(Deserialize)]
struct Garment {
    id: String,
    slot: String,
    piece: String,
    #[serde(default)]
    retired: bool,
}

static GARMENTS: LazyLock<Vec<Garment>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../assets/character-garments.json"))
        .expect("the built-in garment catalog is valid")
});

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CharacterIdentity {
    Male,
    Female,
    Nonbinary,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CharacterProp { ShopBag }

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CharacterAppearance {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    item_colors: Option<std::collections::BTreeMap<String, ClothingColors>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    personality: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    animation_fit: Option<String>,
    hair: String,
    hair_color: String,
    skin: String,
    headwear: String,
    color: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    accent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    eye_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    brow_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    glasses: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ClothingColors {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    accent: Option<String>,
}
#[derive(Deserialize)]
struct ClothingPiece { id: String }
static CLOTHING_PIECES: LazyLock<Vec<ClothingPiece>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../assets/character-clothing-pieces.json")).expect("valid clothing pieces")
});

#[derive(Deserialize)]
struct Character {
    id: String,
    outfits: Vec<Outfit>,
}

#[derive(Deserialize)]
struct Outfit {
    id: String,
}

static APPEARANCES: LazyLock<std::collections::HashMap<String, Vec<Outfit>>> =
    LazyLock::new(|| {
        serde_json::from_str(include_str!("../assets/character-appearance.json"))
            .expect("the built-in character appearance catalog is valid")
    });

static CAST: LazyLock<Vec<Character>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../assets/characters.json"))
        .expect("the built-in character catalog is valid")
});

fn hex_color(value: &str) -> bool {
    value
        .strip_prefix('#')
        .is_some_and(|hex| hex.len() == 6 && hex.bytes().all(|byte| byte.is_ascii_hexdigit()))
}

impl CharacterChoice {
    pub fn is_equippable(&self) -> bool {
        self.garments.is_none() && self.wardrobe_trial.is_none() && self.wardrobe_ease.is_none()
            && self.removed_clothing.is_none() && self.is_available()
    }

    fn has_valid_garments(&self) -> bool {
        let top = self.garments.as_ref().is_some_and(|garments| garments.contains_key("top"));
        let dress = self.garments.as_ref().is_some_and(|garments| garments.contains_key("dress"));
        let skirt = self.garments.as_ref().is_some_and(|garments| garments.contains_key("skirt"));
        let armor = self.garments.as_ref().and_then(|garments| garments.get("top")).is_some_and(|id| {
            GARMENTS.iter().any(|garment| &garment.id == id && garment.piece == "armor")
        });
        if (dress && (top || skirt || self.wardrobe_trial.is_some()))
            || (armor && self.wardrobe_trial.is_some())
        {
            return false;
        }
        if !self.garments.as_ref().is_none_or(|garments| {
            self.id == "mara-vega" && garments.iter().all(|(slot, id)| {
                GARMENTS.iter().any(|garment| !garment.retired && &garment.id == id && &garment.slot == slot)
            })
        }) {
            return false;
        }
        if !self.wardrobe_trial.as_ref().is_none_or(|trial| {
            self.id == "mara-vega" && WARDROBE.iter().any(|set| set.id == trial.set)
        }) {
            return false;
        }
        if !self.removed_clothing.as_ref().is_none_or(|removed| {
            (removed.is_empty() || self.id == "mara-vega")
                && removed.iter().enumerate().all(|(i, slot)| !removed[..i].contains(slot))
        }) {
            return false;
        }
        self.wardrobe_ease.is_none_or(|ease| {
            matches!(ease, 1 | 2) && self.wardrobe_trial.as_ref().or_else(|| {
                self.wardrobe.as_ref().filter(|wardrobe| {
                    WARDROBE.iter().any(|set| !set.retired && set.id == wardrobe.set)
                })
            }).is_some_and(|wardrobe| wardrobe.waist == WaistLayer::Over)
        })
    }

    pub fn is_available(&self) -> bool {
        CAST.iter().any(|character| {
            character.id == self.id
                && character
                    .outfits
                    .iter()
                    .any(|outfit| outfit.id == self.outfit)
        }) && self.wardrobe.as_ref().is_none_or(|wardrobe| {
            self.id == "mara-vega" && WARDROBE.iter().any(|set| set.id == wardrobe.set)
        }) && self.has_valid_garments() && self.appearance.as_ref().is_none_or(|appearance| {
            if !appearance.personality.as_deref().is_none_or(|value| ["friendly", "playful", "shy", "tsundere", "stoic", "elegant", "racer", "scientist"].contains(&value))
                || !appearance.animation_fit.as_deref().is_none_or(|value| ["auto", "full", "fitted"].contains(&value)) {
                return false;
            }
            if !appearance.item_colors.as_ref().is_none_or(|items| items.len() <= 128 && items.iter().all(|(key, colors)| {
                let Some((variant, piece)) = key.split_once(':') else { return false; };
                let known_piece = CLOTHING_PIECES.iter().any(|entry| entry.id == piece);
                let known_variant = CAST.iter().filter(|entry| entry.id == self.id).any(|entry| entry.outfits.iter().any(|outfit| outfit.id == variant))
                    || (self.id == "mara-vega" && WARDROBE.iter().any(|set| set.id == variant))
                    || (self.id == "mara-vega" && GARMENTS.iter().any(|garment| garment.id == variant && garment.piece == piece))
                    || (piece == "glasses" && ["round", "aviator"].contains(&variant))
                    || (piece == "bag" && variant == "shop-bag");
                known_piece && known_variant && colors.color.as_deref().is_none_or(hex_color) && colors.accent.as_deref().is_none_or(hex_color)
            })) { return false; }
            if !appearance.accent.as_deref().is_none_or(hex_color) {
                return false;
            }
            [
                ("hair", Some(appearance.hair.as_str())),
                ("hair_color", Some(appearance.hair_color.as_str())),
                ("skin", Some(appearance.skin.as_str())),
                ("headwear", Some(appearance.headwear.as_str())),
                ("color", Some(appearance.color.as_str())),
                ("eye_color", appearance.eye_color.as_deref()),
                ("brow_color", appearance.brow_color.as_deref()),
                ("glasses", appearance.glasses.as_deref()),
            ]
            .into_iter()
            .all(|(field, value)| value.is_none_or(|value| {
                (field == "color" && hex_color(value))
                    || APPEARANCES
                        .get(field)
                        .is_some_and(|options| options.iter().any(|option| option.id == value))
            }))
        })
    }
}

#[cfg(test)]
mod wardrobe_tests {
    use super::*;
    use serde_json::json;

    fn choice(wardrobe: serde_json::Value) -> CharacterChoice {
        let outfit = CAST.iter().find(|c| c.id == "mara-vega").unwrap().outfits[0].id.clone();
        serde_json::from_value(json!({"id":"mara-vega", "outfit":outfit, "wardrobe":wardrobe})).unwrap()
    }

    #[test]
    fn wardrobe_round_trips_and_preserves_legacy_profiles() {
        assert!(choice(serde_json::Value::Null).is_available());
        for set in WARDROBE.iter() {
            for shirt in ["none", "under", "over"] {
                for waist in ["tucked", "over"] {
                    let c = choice(json!({"set":set.id,"shirt":shirt,"waist":waist}));
                    assert!(c.is_available());
                    let saved = serde_json::to_value(&c).unwrap();
                    assert_eq!(saved["wardrobe"], json!({"set":set.id,"shirt":"none","waist":waist}));
                    assert_eq!(serde_json::from_value::<CharacterChoice>(saved).unwrap(), c);
                }
            }
        }
    }

    #[test]
    fn wardrobe_rejects_unknown_sets_and_wrong_base_body() {
        assert!(!choice(json!({"set":"../unknown","shirt":"under","waist":"over"})).is_available());
        let mut c = choice(json!({"set":"gothic-01","shirt":"under","waist":"tucked"}));
        let male = CAST.iter().find(|c| c.id == "jules-okafor").unwrap();
        c.id = male.id.clone(); c.outfit = male.outfits[0].id.clone();
        assert!(!c.is_available());
        assert!(serde_json::from_value::<WardrobeChoice>(json!({"set":"gothic-01","shirt":"invisible","waist":"over"})).is_err());
        assert!(serde_json::from_value::<WardrobeChoice>(json!({"set":"gothic-01","shirt":"under","waist":"over","shorts":false})).is_err());
    }
    #[test]
    fn piece_colors_personality_and_fit_round_trip_and_validate() {
        let mut value = serde_json::to_value(choice(serde_json::Value::Null)).unwrap();
        value["appearance"] = json!({ "hair":"natural", "hair_color":"original", "skin":"original",
            "headwear":"hat", "color":"original", "personality":"tsundere", "animation_fit":"fitted",
            "item_colors": {"gothic-01:skirt":{"color":"#123aBC","accent":"#abcdef"}, "aviator:glasses":{"color":"#112233"}} });
        let good: CharacterChoice = serde_json::from_value(value.clone()).unwrap();
        assert!(good.is_available());
        assert_eq!(serde_json::from_value::<CharacterChoice>(serde_json::to_value(&good).unwrap()).unwrap(), good);
        for (field, bad) in [("personality", json!("unknown")), ("animation_fit", json!("invisible")),
            ("item_colors", json!({"gothic-01:skin":{"color":"#112233"}})),
            ("item_colors", json!({"unknown:skirt":{"color":"#112233"}})),
            ("item_colors", json!({"gothic-01:skirt":{"color":"transparent"}}))] {
            let mut invalid = value.clone(); invalid["appearance"][field] = bad;
            assert!(!serde_json::from_value::<CharacterChoice>(invalid).unwrap().is_available());
        }
        value["appearance"]["item_colors"]["gothic-01:skirt"]["opacity"] = json!(0);
        assert!(serde_json::from_value::<CharacterChoice>(value).is_err());
    }

}

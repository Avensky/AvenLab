use serde::{Deserialize, Serialize};
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
}

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

#[derive(Deserialize)]
struct Character {
    id: String,
    gender: String,
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
    pub fn gender(&self) -> Option<&'static str> {
        CAST.iter().find(|character| character.id == self.id).map(|character| character.gender.as_str())
    }

    pub fn is_available(&self) -> bool {
        CAST.iter().any(|character| {
            character.id == self.id
                && character
                    .outfits
                    .iter()
                    .any(|outfit| outfit.id == self.outfit)
        }) && self.appearance.as_ref().is_none_or(|appearance| {
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

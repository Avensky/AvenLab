use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CharacterChoice {
    pub id: String,
    pub outfit: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub appearance: Option<CharacterAppearance>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CharacterAppearance {
    hair: String,
    hair_color: String,
    skin: String,
    headwear: String,
    color: String,
}

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

impl CharacterChoice {
    pub fn is_available(&self) -> bool {
        CAST.iter().any(|character| {
            character.id == self.id
                && character
                    .outfits
                    .iter()
                    .any(|outfit| outfit.id == self.outfit)
        }) && self.appearance.as_ref().is_none_or(|appearance| {
            [
                ("hair", &appearance.hair),
                ("hair_color", &appearance.hair_color),
                ("skin", &appearance.skin),
                ("headwear", &appearance.headwear),
                ("color", &appearance.color),
            ]
            .into_iter()
            .all(|(field, value)| {
                APPEARANCES
                    .get(field)
                    .is_some_and(|options| options.iter().any(|option| &option.id == value))
            })
        })
    }
}

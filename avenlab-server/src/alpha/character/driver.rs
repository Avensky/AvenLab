//! Derived once on equip/spawn. Gameplay never fits or replicates wardrobe meshes.
use super::{hex_color, CharacterChoice, APPEARANCES, CAST, WARDROBE};
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverAppearance {
    pub body: String,
    pub skin: String,
    pub hair: String,
    pub hair_style: String,
    pub headwear: String,
    pub headwear_color: String,
    pub top: String,
    pub bottom: String,
}

impl Default for DriverAppearance {
    fn default() -> Self {
        Self { body: "female".into(), skin: "#d49673".into(), hair: "#7c573c".into(),
            hair_style: "long".into(), headwear: "hat".into(), headwear_color: "#e7cda0".into(),
            top: "#46584b".into(), bottom: "#46584b".into() }
    }
}

impl CharacterChoice {
    pub fn driver_appearance(&self) -> Option<DriverAppearance> {
        let character = CAST.iter().find(|item| item.id == self.id)?;
        let outfit = character.outfits.iter().find(|item| item.id == self.outfit)?;
        let female = self.id != "jules-okafor";
        let appearance = self.appearance.as_ref();
        let option_color = |field: &str, id: Option<&str>, fallback: &str| -> String {
            let color = id.filter(|id| *id != "original").and_then(|id| {
                if field == "color" && hex_color(id) { return Some(id); }
                APPEARANCES.get(field)?.iter().find(|item| item.id == id)?.color.as_deref()
            });
            color.unwrap_or(fallback).into()
        };
        let fabric = option_color("color", appearance.map(|a| a.color.as_str()), outfit.jacket.as_deref().unwrap_or("#46584b"));
        let authored = self.wardrobe.as_ref().filter(|_| appearance.is_none_or(|a| a.color == "original"))
            .and_then(|choice| WARDROBE.iter().find(|item| item.id == choice.set)).and_then(|item| item.gameplay_colors.as_ref());
        let variant = self.wardrobe.as_ref().map(|w| w.set.as_str()).unwrap_or(&self.outfit);
        let piece_color = |piece: &str, fallback: &str| -> String {
            appearance.and_then(|a| a.item_colors.as_ref()).and_then(|colors| colors.get(&format!("{variant}:{piece}")))
                .and_then(|colors| colors.color.as_deref()).filter(|color| hex_color(color)).unwrap_or(fallback).into()
        };
        let dress = female && self.wardrobe.is_none() && !matches!(self.outfit.as_str(), "dockwear" | "shop-crew");
        let hat = !dress && (self.id == "mara-vega" || appearance.is_some_and(|a| a.headwear == "hat"));
        Some(DriverAppearance {
            body: if female { "female" } else { "male" }.into(),
            skin: option_color("skin", appearance.map(|a| a.skin.as_str()), if female { "#d49673" } else { "#95553d" }),
            hair: option_color("hair_color", appearance.map(|a| a.hair_color.as_str()), if female { "#7c573c" } else { "#2b2127" }),
            hair_style: if female && !appearance.is_some_and(|a| a.hair == "cropped") { "long" } else { "short" }.into(),
            headwear: if hat { "hat" } else { "none" }.into(),
            headwear_color: piece_color("hat", "#e7cda0"),
            top: piece_color(if dress { "dress" } else if female { "corset" } else { "coat" }, authored.map(|colors| colors.top.as_str()).unwrap_or(&fabric)),
            bottom: piece_color(if dress { "dress" } else if female { "skirt" } else { "pants" }, authored.map(|colors| colors.bottom.as_str()).unwrap_or(&fabric)),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gameplay_palette_matches_the_browser_without_fitting_assets() {
        let cases: serde_json::Value = serde_json::from_str(include_str!("../../../../frontend/tests/fixtures/driver-appearance.json")).unwrap();
        for case in cases.as_array().unwrap() {
            let choice: CharacterChoice = serde_json::from_value(case["choice"].clone()).unwrap();
            assert!(choice.is_equippable(), "{}", case["name"]);
            assert_eq!(serde_json::to_value(choice.driver_appearance()).unwrap(), case["driver"], "{}", case["name"]);
        }
        assert_eq!(serde_json::to_value(DriverAppearance::default()).unwrap(), cases[0]["driver"]);
    }
}

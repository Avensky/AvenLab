//! Pure, persisted economy. Called only by a trusted authoritative match-result
//! adapter. There is deliberately no WebSocket action for awarding XP or wins.
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Progression {
    pub level: u32,
    pub prestige: u32,
    pub xp: u64,
    pub competitive_wins: u32,
    pub quickplay_wins: u32,
    pub matches: u32,
    pub credits: u32,
    pub owned: BTreeSet<String>,
    pub equipped: String,
}
impl Default for Progression {
    fn default() -> Self {
        Self {
            level: 1,
            prestige: 0,
            xp: 0,
            competitive_wins: 0,
            quickplay_wins: 0,
            matches: 0,
            credits: 0,
            owned: BTreeSet::from(["factory".into()]),
            equipped: "factory".into(),
        }
    }
}
pub const SKINS: [(&str, &str, u32, &str); 4] = [
    ("factory", "FACTORY", 0, "#a9c6d8"),
    ("midnight", "MIDNIGHT", 50, "#687bcd"),
    ("ember", "EMBER", 75, "#ff9365"),
    ("arctic", "ARCTIC", 100, "#8fe1df"),
];
impl Progression {
    pub fn required_xp(&self) -> u64 {
        (100 + (self.level.saturating_sub(1) as u64) * 10) * (4 + self.prestige.min(1000) as u64)
            / 4
    }
    pub fn tier(&self) -> &'static str {
        match self.competitive_wins {
            0..=4 => "BRONZE",
            5..=14 => "SILVER",
            15..=29 => "GOLD",
            30..=59 => "PLATINUM",
            60..=99 => "DIAMOND",
            100..=149 => "MASTER",
            _ => "GRANDMASTER",
        }
    }
    pub fn color(&self) -> &'static str {
        [
            "#b8cad8", "#72c8ec", "#8fd6a5", "#cca2f4", "#ffb562", "#ee8fa7",
        ][(self.prestige as usize) % 6]
    }
    pub fn award(&mut self, competitive: bool, won: bool) {
        self.matches = self.matches.saturating_add(1);
        if won {
            if competitive {
                self.competitive_wins = self.competitive_wins.saturating_add(1)
            } else {
                self.quickplay_wins = self.quickplay_wins.saturating_add(1)
            }
        }
        self.xp = self.xp.saturating_add(if won { 200 } else { 100 });
        while self.xp >= self.required_xp() {
            self.xp -= self.required_xp();
            if self.level >= 100 {
                self.level = 1;
                self.prestige = self.prestige.saturating_add(1);
                self.credits = self.credits.saturating_add(25)
            } else {
                self.level += 1;
                if self.level % 10 == 0 {
                    self.credits = self.credits.saturating_add(5)
                }
            }
        }
    }
    pub fn redeem(&mut self, id: &str) -> Result<(), String> {
        let skin = SKINS
            .iter()
            .find(|skin| skin.0 == id)
            .ok_or("Unknown skin.")?;
        if self.owned.contains(id) {
            return Err("You already own this skin.".into());
        }
        if self.credits < skin.2 {
            return Err("Earn more milestone credits before redeeming this skin.".into());
        }
        self.credits -= skin.2;
        self.owned.insert(id.into());
        Ok(())
    }
    pub fn equip(&mut self, id: &str) -> Result<(), String> {
        if !self.owned.contains(id) {
            return Err("Redeem this skin first.".into());
        }
        self.equipped = id.into();
        Ok(())
    }
    pub fn view(&self) -> serde_json::Value {
        serde_json::json!({"level":self.level,"prestige":self.prestige,"xp":self.xp,"required_xp":self.required_xp(),"tier":self.tier(),"competitive_wins":self.competitive_wins,"quickplay_wins":self.quickplay_wins,"matches":self.matches,"credits":self.credits,"owned":self.owned,"equipped":self.equipped,"color":self.color(),"next_milestone":if self.level<100{((self.level/10)+1)*10}else{100}})
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn prestige_rolls_level_and_increases_cost() {
        let mut p = Progression {
            level: 100,
            xp: 1080,
            ..Progression::default()
        };
        p.award(false, false);
        assert_eq!(p.level, 1);
        assert_eq!(p.prestige, 1);
        assert_eq!(p.credits, 25);
        assert_eq!(p.required_xp(), 125)
    }
    #[test]
    fn win_tier_is_independent_and_redemption_cannot_overspend() {
        let mut p = Progression::default();
        for _ in 0..5 {
            p.award(true, true)
        }
        assert_eq!(p.tier(), "SILVER");
        assert!(p.redeem("ember").is_err());
        p.credits = 75;
        p.redeem("ember").unwrap();
        assert_eq!(p.credits, 0);
        assert!(p.redeem("ember").is_err());
        p.equip("ember").unwrap();
        assert!(p.equip("arctic").is_err());
        assert_eq!(p.equipped, "ember");
    }
}

use super::*;
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Tank,
    Dps,
    Support,
}
#[derive(Clone, Copy)]
pub struct Hero {
    pub id: &'static str,
    pub vehicle: &'static str,
    pub role: Role,
}
pub const HEROES: [Hero; 7] = [
    Hero {
        id: "tank",
        vehicle: "tank",
        role: Role::Tank,
    },
    Hero {
        id: "ae86",
        vehicle: "ae86",
        role: Role::Dps,
    },
    Hero {
        id: "brz",
        vehicle: "brz",
        role: Role::Dps,
    },
    Hero {
        id: "camaro",
        vehicle: "camaro",
        role: Role::Dps,
    },
    Hero {
        id: "supra",
        vehicle: "supra",
        role: Role::Dps,
    },
    Hero {
        id: "mechanic",
        vehicle: "brz",
        role: Role::Support,
    },
    Hero {
        id: "logistics",
        vehicle: "ae86",
        role: Role::Support,
    },
];
pub fn hero(id: &str) -> Result<Hero, String> {
    HEROES
        .iter()
        .find(|hero| hero.id == id)
        .copied()
        .ok_or_else(|| "Choose a known hero.".into())
}
/// Preserve enough empty seats to reach one tank, two DPS and one support.
/// Valid final compositions are 1/3/1 or 1/2/2. Testing modes skip this policy.
pub fn role_fits(roles: &[Role], candidate: Role) -> bool {
    let count = |role| {
        roles.iter().filter(|&&value| value == role).count() + usize::from(candidate == role)
    };
    let (tank, dps, support) = (count(Role::Tank), count(Role::Dps), count(Role::Support));
    let total = roles.len() + 1;
    total <= 5
        && tank <= 1
        && dps <= 3
        && support <= 2
        && (1usize.saturating_sub(tank)
            + 2usize.saturating_sub(dps)
            + 1usize.saturating_sub(support))
            <= 5 - total
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn composition_keeps_required_seats_and_testing_has_three_roles() {
        use Role::*;
        assert!(role_fits(&[Dps, Dps, Support], Tank));
        assert!(!role_fits(&[Dps, Dps, Support, Support], Dps));
        assert!(!role_fits(&[Tank, Dps, Dps, Support], Tank));
        assert!(role_fits(&[Tank, Dps, Dps, Support], Support));
        assert!(role_fits(&[Tank, Dps, Dps, Support], Dps));
        assert!(!role_fits(&[Tank, Dps, Dps, Dps], Dps));
        assert_eq!(hero("mechanic").unwrap().role, Support);
        assert!(hero("fake").is_err());
    }
}

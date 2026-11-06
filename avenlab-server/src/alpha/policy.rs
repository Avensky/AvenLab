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
pub const HEROES: [Hero; 16] = [
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
    Hero { id: "sierra", vehicle: "sierra", role: Role::Tank },
    Hero { id: "mechanic", vehicle: "fortuner", role: Role::Support },
    Hero { id: "logistics", vehicle: "landcruiser", role: Role::Support },
    Hero { id: "mini", vehicle: "mini", role: Role::Dps },
    Hero {
        id: "cx30",
        vehicle: "cx30",
        role: Role::Support,
    },
    Hero { id: "enforcer", vehicle: "enforcer", role: Role::Support },
    Hero { id: "interceptor", vehicle: "interceptor", role: Role::Support },
    Hero { id: "charger70", vehicle: "charger70", role: Role::Dps },
    Hero { id: "skyline34", vehicle: "skyline34", role: Role::Dps },
    Hero { id: "timecar", vehicle: "timecar", role: Role::Dps },
    // An optional naval sandbox/editor platform, not a competitive role slot.
    Hero { id: "hawaii-rescue", vehicle: "hawaii-rescue", role: Role::Support },
];
pub fn hero(id: &str) -> Result<Hero, String> {
    HEROES
        .iter()
        .find(|hero| hero.id == id)
        .copied()
        .ok_or_else(|| "Choose a known hero.".into())
}
/// The default five-player policy preserves room for one tank, two DPS and
/// one support. Skirmish reserves exactly one seat per role. Training bypasses
/// this helper explicitly in the admission layer, never by accepting client caps.
pub fn role_fits_for(mode: Mode, roles: &[Role], candidate: Role) -> bool {
    role_fits_for_format(mode.into(), roles, candidate)
}
pub fn role_fits_for_format(format: MatchFormat, roles: &[Role], candidate: Role) -> bool {
    let counts = role_counts(roles.iter().copied().chain(std::iter::once(candidate)));
    let total = roles.len() + 1;
    let capacity = format.team_size;
    let caps = format.role_caps();
    let minimums = format.role_minimums();
    total <= capacity && counts.iter().zip(caps).all(|(count, max)| *count <= max)
        && counts.iter().zip(minimums).map(|(count, min)| min.saturating_sub(*count)).sum::<usize>() <= capacity - total
}
pub fn complete_team(mode: Mode, roles: &[Role]) -> bool {
    complete_team_format(mode.into(), roles)
}
pub fn complete_team_format(format: MatchFormat, roles: &[Role]) -> bool {
    let counts = role_counts(roles.iter().copied());
    roles.len() == format.team_size && counts.iter().zip(format.role_caps()).all(|(count, max)| *count <= max)
        && counts.iter().zip(format.role_minimums()).all(|(count, min)| *count >= min)
}
fn role_counts(roles: impl Iterator<Item=Role>) -> [usize; 3] {
    let mut counts = [0; 3];
    for role in roles { counts[match role { Role::Tank => 0, Role::Dps => 1, Role::Support => 2 }] += 1; }
    counts
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn composition_keeps_required_seats_and_testing_has_three_roles() {
        use Role::*;
        assert!(role_fits_for(Mode::Quickplay, &[Dps, Dps, Support], Tank));
        assert!(!role_fits_for(Mode::Quickplay, &[Dps, Dps, Support, Support], Dps));
        assert!(!role_fits_for(Mode::Quickplay, &[Tank, Dps, Dps, Support], Tank));
        assert!(role_fits_for(Mode::Quickplay, &[Tank, Dps, Dps, Support], Support));
        assert!(role_fits_for(Mode::Quickplay, &[Tank, Dps, Dps, Support], Dps));
        assert!(!role_fits_for(Mode::Quickplay, &[Tank, Dps, Dps, Dps], Dps));
        assert_eq!(hero("cx30").unwrap().role, Support);
        assert_eq!(hero("mini").unwrap().role, Dps);
        assert_eq!(hero("sierra").unwrap().role, Tank);
        assert_eq!(hero("mechanic").unwrap().vehicle, "fortuner");
        assert_eq!(hero("logistics").unwrap().vehicle, "landcruiser");
        let chassis: std::collections::HashSet<_> = HEROES.iter().map(|h| h.vehicle).collect();
        assert_eq!(chassis.len(), HEROES.len());
        assert!(hero("fake").is_err());
    }
    #[test]
    fn skirmish_reserves_exactly_one_of_each_role_and_keeps_the_existing_match_budget() {
        use Role::*;
        assert_eq!(Mode::parse("skirmish").unwrap(), Mode::Skirmish);
        assert_eq!(Mode::Skirmish.capacity(), 6);
        assert_eq!(Mode::Skirmish.team_size(), 3);
        assert_eq!(Mode::Skirmish.bucket(), Mode::Quickplay.bucket());
        assert_eq!(serde_json::to_value(Mode::Skirmish).unwrap(), "skirmish");
        assert!(role_fits_for(Mode::Skirmish, &[], Dps));
        assert!(!role_fits_for(Mode::Skirmish, &[Dps], Dps));
        assert!(!role_fits_for(Mode::Skirmish, &[Tank], Tank));
        assert!(!role_fits_for(Mode::Skirmish, &[Support], Support));
        assert!(role_fits_for(Mode::Skirmish, &[Dps, Tank], Support));
        assert!(complete_team(Mode::Skirmish, &[Tank, Dps, Support]));
        assert!(!complete_team(Mode::Skirmish, &[Tank, Dps]));
        assert!(!complete_team(Mode::Skirmish, &[Tank, Dps, Dps]));
        assert!(!role_fits_for(Mode::Skirmish, &[Tank, Dps, Support], Dps));
        assert!(complete_team(Mode::Quickplay, &[Tank, Dps, Dps, Dps, Support]));
        assert!(complete_team(Mode::Competitive, &[Tank, Dps, Dps, Support, Support]));
    }

    #[test]
    fn both_rule_sets_accept_three_or_five_with_size_owned_role_policy() {
        use Role::*;
        for mode in [Mode::Quickplay,Mode::Competitive] {
            for size in [3,5] {
                let format=MatchFormat::requested(mode,Some(&serde_json::json!(size))).unwrap();
                assert_eq!(format.capacity(),size*2);
                let roles=if size==3 {vec![Tank,Dps,Support]}else{vec![Tank,Dps,Dps,Dps,Support]};
                assert!(complete_team_format(format,&roles));
                assert!(!role_fits_for_format(format,&roles,Dps));
            }
        }
    }

}

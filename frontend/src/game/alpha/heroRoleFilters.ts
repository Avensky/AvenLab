import type { SceneHeaderTab } from "../../components/menus/SceneTabHeader";
import { HERO_FILTERS, type HEROES, type HeroFilter } from "../../store/alpha/alphaStore";

const SEA_VEHICLE_IDS = new Set(["hawaii-rescue", "louisiana"]);
const AIR_VEHICLE_IDS = new Set<string>();

export function heroMatchesFilter(hero: (typeof HEROES)[number], filter: HeroFilter, allowDomains = false) {
  if (!allowDomains && (SEA_VEHICLE_IDS.has(hero.vehicle) || AIR_VEHICLE_IDS.has(hero.vehicle))) return false;
  if (filter === "all") return true;
  if (filter === "air") return AIR_VEHICLE_IDS.has(hero.vehicle);
  if (filter === "sea") return SEA_VEHICLE_IDS.has(hero.vehicle);
  return hero.role === filter;
}

export function heroRoleHeaderTabs(allowBoats = false): SceneHeaderTab[] {
  return HERO_FILTERS.filter(role => allowBoats || !["air", "sea"].includes(role)).map(role => ({
    id: role,
    label: role.toUpperCase(),
    description: role === "all" ? "Show all vehicles" : `Show ${role} vehicles`,
  }));
}

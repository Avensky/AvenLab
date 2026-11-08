import {MenuTabButton} from "../../components/menus/MenuTabButton";
import {
  HEROES,
  HERO_FILTERS,
  type HeroFilter,
} from "../../store/alpha/alphaStore";
import { ControllerButton } from "../../components/controller";
import { HeroPortrait } from "./HeroPortrait";
import type { AngledHeaderTab } from "../../components/menus/AngledTabHeader";

const SEA_VEHICLE_IDS = new Set(["hawaii-rescue", "louisiana"]);
const AIR_VEHICLE_IDS = new Set<string>();

export function heroRoleHeaderTabs(allowBoats = false): AngledHeaderTab[] {
  return HERO_FILTERS.filter(role => allowBoats || !["air", "sea"].includes(role)).map(role => ({
    id: role,
    label: role.toUpperCase(),
    description: role === "all" ? "Show all vehicles" : `Show ${role} vehicles`,
    icon: null,
  }));
}

export function HeroRoster({
  selected,
  main,
  filter,
  busy,
  onChoose,
  unavailable = {},
  onFilter,
  allowBoats = false,
  showFilters = true,
}: {
  selected: string | null;
  main?: string | null;
  filter: HeroFilter;
  busy: boolean;
  onChoose: (hero: string) => void;
  unavailable?: Record<string, string>;
  onFilter: (filter: HeroFilter) => void;
  allowBoats?: boolean;
  showFilters?: boolean;
}) {
  const visibleHeroes = HEROES.filter((hero) => {
    if (!allowBoats && (SEA_VEHICLE_IDS.has(hero.vehicle) || AIR_VEHICLE_IDS.has(hero.vehicle))) return false;
    if (filter === "all") return true;
    if (filter === "air") return AIR_VEHICLE_IDS.has(hero.vehicle);
    if (filter === "sea") return SEA_VEHICLE_IDS.has(hero.vehicle);
    return hero.role === filter;
  });
  return (
    <aside className="hero-roster" aria-label="Vehicle selection">
      {showFilters&&<HeroRoleTabs filter={filter} onFilter={onFilter} allowBoats={allowBoats}/>}
      <div
        className="hero-roster-grid"
        data-controller-grid
        data-controller-row
        data-controller-columns="3"
        role="group"
        aria-label={
          filter === "all" ? "All vehicles" : `${filter.toUpperCase()} vehicles`
        }
      >
        {visibleHeroes.length === 0 && <span className="hero-roster-empty" role="status">{filter === "air" ? "AIR VEHICLES ARRIVING" : "NO VEHICLES IN THIS CLASS"}</span>}
        {visibleHeroes.map(
          (hero) => (
            <button
              key={hero.id}
              type="button"
              className="hero-portrait-card"
              data-hero={hero.id}
              data-role={hero.role}
              data-grid-item
              aria-label={`${hero.name} · ${hero.role.toUpperCase()}${unavailable[hero.id] ? ` · ${unavailable[hero.id]}` : ""}`}
              title={unavailable[hero.id] ?? `${hero.name} · ${hero.role.toUpperCase()}`}
              aria-pressed={selected === hero.id}
              disabled={busy || Boolean(unavailable[hero.id])}
              data-unavailable={Boolean(unavailable[hero.id])}
              onClick={() => onChoose(hero.id)}
            >
              <HeroPortrait hero={hero.id} />
              {unavailable[hero.id] && <span className="hero-role-full">ROLE FULL</span>}
              {main===hero.id&&<span className="hero-main-portrait-badge"><ControllerButton button="X"/> MAIN</span>}
            </button>
          ),
        )}
        {(filter === "all" || filter === "support") && ["mechanic", "logistics"].filter(id => !HEROES.some(hero => hero.id === id)).map(slot =>
          <span key={slot} className="hero-roster-vacancy" role="img" aria-label="Unassigned support vehicle" />
        )}
      </div>
    </aside>
  );
}

/** One contiguous role rail above the shared translucent selector row. */
export function HeroRoleTabs({
  filter,
  onFilter,
  allowBoats = false,
}: {
  filter: HeroFilter;
  onFilter: (filter: HeroFilter) => void;
  allowBoats?: boolean;
}) {
  return (
    <nav
      className="hero-role-tabs"
      role="tablist"
      aria-label="Vehicle class"
      data-controller-row
      data-controller-tab-only
    >
      {HERO_FILTERS.filter(role=>allowBoats||!["air","sea"].includes(role)).map((role) => (
        <MenuTabButton
          key={role}
          data-role-filter
          selected={filter === role}
          tabIndex={filter === role ? 0 : -1}
          onFocus={() => onFilter(role)}
          onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            onFilter(role);
          }}
        >
          {role.toUpperCase()}
        </MenuTabButton>
      ))}
    </nav>
  );
}

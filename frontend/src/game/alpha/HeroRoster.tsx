import {MenuTabButton} from "../../components/menus/MenuTabButton";
import {
  HEROES,
  HERO_FILTERS,
  type HeroFilter,
} from "../../store/alpha/alphaStore";
import { ControllerButton } from "../../components/controller";
import { HeroPortrait } from "./HeroPortrait";

export function HeroRoster({
  selected,
  main,
  filter,
  busy,
  onChoose,
  unavailable = {},
  onFilter,
  allowBoats = false,
}: {
  selected: string | null;
  main?: string | null;
  filter: HeroFilter;
  busy: boolean;
  onChoose: (hero: string) => void;
  unavailable?: Record<string, string>;
  onFilter: (filter: HeroFilter) => void;
  allowBoats?: boolean;
}) {
  return (
    <aside className="hero-roster" aria-label="Hero portraits">
      <HeroRoleTabs filter={filter} onFilter={onFilter} allowBoats={allowBoats}/>
      <div
        className="hero-roster-grid"
        data-controller-grid
        data-controller-row
        data-controller-columns="3"
        role="group"
        aria-label={
          filter === "all" ? "All heroes" : `${filter.toUpperCase()} heroes`
        }
      >
        {HEROES.filter((hero) =>
          (allowBoats || hero.vehicle !== 'hawaii-rescue') &&
          (filter === 'all' || (filter === 'boat' ? hero.vehicle === 'hawaii-rescue' : hero.role === filter))
        ).map(
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
      aria-label="Hero role"
      data-controller-row
      data-controller-tab-only
    >
      {HERO_FILTERS.filter(role=>allowBoats||role!=='boat').map((role) => (
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

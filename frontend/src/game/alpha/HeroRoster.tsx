import {
  HEROES,
  HERO_FILTERS,
  type HeroFilter,
} from "../../store/alpha/alphaStore";
import { HeroPortrait } from "./HeroPortrait";

export function HeroRoster({
  selected,
  filter,
  busy,
  onChoose,
  onFilter,
}: {
  selected: string | null;
  filter: HeroFilter;
  busy: boolean;
  onChoose: (hero: string) => void;
  onFilter: (filter: HeroFilter) => void;
}) {
  return (
    <aside className="hero-roster" aria-label="Hero portraits">
      <HeroRoleTabs filter={filter} onFilter={onFilter} />
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
        {HEROES.filter((hero) => filter === "all" || hero.role === filter).map(
          (hero) => (
            <button
              key={hero.id}
              type="button"
              className="hero-portrait-card"
              data-hero={hero.id}
              data-role={hero.role}
              data-grid-item
              aria-label={`${hero.name} · ${hero.role.toUpperCase()}`}
              title={`${hero.name} · ${hero.role.toUpperCase()}`}
              aria-pressed={selected === hero.id}
              disabled={busy}
              onClick={() => onChoose(hero.id)}
            >
              <HeroPortrait hero={hero.id} />
            </button>
          ),
        )}
      </div>
    </aside>
  );
}

/** One contiguous role rail above the shared translucent selector row. */
export function HeroRoleTabs({
  filter,
  onFilter,
}: {
  filter: HeroFilter;
  onFilter: (filter: HeroFilter) => void;
}) {
  return (
    <nav
      className="hero-role-tabs"
      role="tablist"
      aria-label="Hero role"
      data-controller-row
      data-controller-tab-only
    >
      {HERO_FILTERS.map((role) => (
        <button
          key={role}
          type="button"
          role="tab"
          data-role-filter
          className="menu-control"
          aria-selected={filter === role}
          tabIndex={filter === role ? 0 : -1}
          onFocus={() => onFilter(role)}
          onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            onFilter(role);
          }}
        >
          {role.toUpperCase()}
        </button>
      ))}
    </nav>
  );
}

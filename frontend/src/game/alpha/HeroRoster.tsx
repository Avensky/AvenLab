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
}: {
  selected: string;
  filter: HeroFilter;
  busy: boolean;
  onChoose: (hero: string) => void;
}) {
  return (
    <aside className="hero-roster" aria-label="Hero portraits">
      <header>
        <h2>CHOOSE YOUR HERO</h2>
        <span>{HEROES.length} HEROES</span>
      </header>
      <div
        className="hero-roster-grid"
        data-controller-grid
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
              aria-pressed={selected === hero.id}
              disabled={busy}
              onClick={() => onChoose(hero.id)}
            >
              <HeroPortrait hero={hero.id} />
              <span className="hero-portrait-name">{hero.name}</span>
            </button>
          ),
        )}
      </div>
    </aside>
  );
}

/** Transparent rail: only the individual folder tabs sit above the vehicle bar. */
export function HeroFolderTabs({
  filter,
  onFilter,
}: {
  filter: HeroFilter;
  onFilter: (filter: HeroFilter) => void;
}) {
  return (
    <nav className="hero-folder-tabs" role="tablist" aria-label="Hero role">
      {HERO_FILTERS.map((role) => (
        <button
          key={role}
          type="button"
          role="tab"
          className="menu-control"
          aria-selected={filter === role}
          onClick={() => onFilter(role)}
        >
          {role.toUpperCase()}
        </button>
      ))}
    </nav>
  );
}

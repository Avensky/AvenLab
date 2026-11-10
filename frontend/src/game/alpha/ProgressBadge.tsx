import { useSocialStore } from "../../store/social/socialStore";
import "./alpha.css";
export function ProgressBadge({ compact = false }: { compact?: boolean } = {}) {
  const p = useSocialStore((state) => state.view?.profile.progression);
  if (!p)
    return <span className="alpha-progress">ALPHA PROFILE · CONNECTING</span>;
  return (
    <div
      className="alpha-progress"
      data-tier={p.tier.toLowerCase()}
      aria-label="Driver progression"
      style={{ borderColor: p.color }}
    >
      <strong>{p.tier}</strong>
      <span>
        PRESTIGE {p.prestige} · LV {p.level}/100
      </span>
      {!compact && <progress aria-label="Level progress" value={p.xp} max={p.required_xp} />}
      <span>{p.credits} CREDITS</span>
    </div>
  );
}

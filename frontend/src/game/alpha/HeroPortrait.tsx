import { memo, useState } from "react";
import { HEROES } from "../../store/alpha/alphaStore";

export const HeroPortrait = memo(function HeroPortrait({
  hero,
  className = "",
}: {
  hero: string | null;
  className?: string;
}) {
  const item = HEROES.find((item) => item.id === hero);
  const [failed, setFailed] = useState(false);
  return (
    <span className={`hero-portrait-art ${className}`} data-role={item?.role}>
      {item && !failed ? (
        <img
          src={`/images/heroes/${item.vehicle}.webp`}
          width="320"
          height="216"
          alt=""
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="hero-portrait-fallback" aria-hidden="true">
          {item?.name.slice(0, 2) ?? "?"}
        </span>
      )}
    </span>
  );
});

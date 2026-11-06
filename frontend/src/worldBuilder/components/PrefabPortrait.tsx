import { useEffect, useRef, useState } from "react";
import type { Piece } from "../document/layoutDocument";
import { Thumbnail } from "./EditorArtwork";
import { prefabPortrait, portraitSource } from "./prefabPortraits";

/** Lazy, cached asset portraits; keeps schematic art for authored box prefabs. */
export function PrefabPortrait({ piece }: { piece: Piece }) {
  const holder = useRef<HTMLSpanElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const hasModel = Boolean(portraitSource(piece));
  useEffect(() => {
    if (!hasModel || !holder.current) return;
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        prefabPortrait(piece)?.then(
          (value) => { if (active) setImage(value); },
          () => { /* Preserve the schematic if a GLB is unavailable. */ },
        );
      },
      { rootMargin: "90px" },
    );
    observer.observe(holder.current);
    return () => { active = false; observer.disconnect(); };
  }, [piece, hasModel]);
  return (
    <span className="le-portrait" ref={holder}>
      {image ? (
        <img src={image} alt="" className="le-portrait-image" />
      ) : (
        <Thumbnail piece={piece} />
      )}
      {hasModel && <small className="le-portrait-kind">3D</small>}
    </span>
  );
}

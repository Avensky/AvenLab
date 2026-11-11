import { useEffect, useState } from "react";

/** Leave one paint for the menu or the car before mounting the next asset. */
export function usePreviewPaint(active = true) {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    if (!active || painted) return;
    let next = 0;
    const first = requestAnimationFrame(() => {
      next = requestAnimationFrame(() => setPainted(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(next);
    };
  }, [active, painted]);
  return painted;
}

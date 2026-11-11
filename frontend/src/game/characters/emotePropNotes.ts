export const EMOTE_PROP_NOTES = {
  "001": { shopBag: "keep", note: "Relaxed carrying pose. Keep the bag in the left hand." },
  "002": { shopBag: "keep", note: "Weight shift adds a small natural swing to the bag." },
  "003": { shopBag: "keep", note: "Right-hand gesture leaves the carrying hand available." },
  "005": { shopBag: "keep", note: "Upright garage reaction works with the carrying pose." },
  "010": { shopBag: "keep", note: "Right-hand wave complements the bag in the left hand." },
  "bag-lift": { shopBag: "keep", note: "Prop-specific lift." },
  "bag-check": { shopBag: "keep", note: "Prop-specific inspection." },
} as const;

/** Unreviewed pairings stow the prop while the full gesture plays. A future
 * prop filter can use these notes without changing the animation itself. */
export function keepHeldProp(emote: string | null | undefined, driving = false) {
  if (driving) return false;
  if (!emote) return true;
  return emote in EMOTE_PROP_NOTES &&
    EMOTE_PROP_NOTES[emote as keyof typeof EMOTE_PROP_NOTES].shopBag === "keep";
}

type AssetHealth = Readonly<Record<string, number>>;
const destroyedKeys = new WeakMap<AssetHealth, string>();

/** Snapshot health maps are immutable: compact deltas retain unchanged maps
 * and copy changed maps; legacy JSON supplies a fresh map. Share the derived
 * key across authored-world chunks without retaining previous worlds. */
export function destroyedAssetKey(health: AssetHealth | null | undefined): string {
  if (!health || typeof health !== "object") return "";
  const cached = destroyedKeys.get(health);
  if (cached !== undefined) return cached;
  const destroyed: string[] = [];
  for (const id of Object.keys(health)) if (health[id] === 0) destroyed.push(id);
  const key = destroyed.sort().join("|");
  destroyedKeys.set(health, key);
  return key;
}

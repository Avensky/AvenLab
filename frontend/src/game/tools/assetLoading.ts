export type AssetLoadingState = { active: boolean; progress: number; total: number };

export function isAssetLoadingComplete({ active, progress, total }: AssetLoadingState) {
  // Collider mode makes no loader requests, so Drei stays at its initial 0%.
  // No files to load is a completed state; an active request must still finish.
  return !active && (total === 0 || progress >= 100);
}

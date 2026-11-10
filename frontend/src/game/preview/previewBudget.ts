export const PREVIEW_FRAME_MS = 1000 / 30;

export function isCompactPreview(width: number) {
  return width > 0 && width <= 960;
}

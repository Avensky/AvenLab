import { create } from "zustand";

export const PREVIEW_ZOOM_LEVELS = [1, 1.15, 1.35, 1.6];
export const usePreviewZoom = create<{ level: number }>(() => ({ level: 0 }));

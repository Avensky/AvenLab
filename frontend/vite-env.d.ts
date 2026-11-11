/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_RUST_WS_URL?: string;
    readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare const __VILLAGER_MODEL_URL__: string | null;
declare const __WARDROBE_SET_IDS__: string[];
declare const __VILLAGER_PORTRAIT_URL__: string | null;
declare const __CHARACTER_BAG_URL__: string | null;
declare const __ROOK_MODEL_URL__: string | null;
declare const __ROOK_PORTRAIT_URL__: string | null;

declare const __DRESSING_ROOM_IMPORTED_IDS__: string[];
declare const __DRESSING_ROOM_MOBILE_IDS__: string[];
declare const __DRESSING_ROOM_REVISION_IDS__: string[];
declare const __STANDALONE_CORSET_LODS__: Record<string, { garage: boolean; mobile: boolean }>;
declare const __BUNDLED_WARDROBE_LODS__: Record<string, { garage: boolean; mobile: boolean }>;

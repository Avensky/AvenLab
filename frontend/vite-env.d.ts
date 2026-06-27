/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_RUST_WS_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
// store/canBusStore.ts
import { create } from "zustand";

type CanMode = "live" | "simulation" | "offline";

type CanBusStatus = {
    active: "can0" | "vcan0" | null;
    mode: CanMode;
    can0?: { exists: boolean; up: boolean; state: string };
    vcan0?: { exists: boolean; up: boolean; state: string };
};

type CanBusState = {
    status: CanBusStatus | null;
    refreshStatus: () => Promise<void>;
};

function getApiBaseUrl() {
    if (import.meta.env.VITE_API_BASE_URL) {
        return import.meta.env.VITE_API_BASE_URL;
    }

    if (import.meta.env.DEV) {
        return "http://localhost:8001";
    }

    return "";
}

export const useCanBusStore = create<CanBusState>((set) => ({
    status: null,

    async refreshStatus() {
        try {
            const res = await fetch(`${getApiBaseUrl()}/data/can/status`);
            const status = await res.json();
            set({ status });
        } catch {
            set({
                status: {
                    active: null,
                    mode: "offline",
                },
            });
        }
    },
}));
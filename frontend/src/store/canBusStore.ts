// store/canBusStore.ts
import { create } from "zustand";

export type CanInterface = "vcan0" | "can0" | "can1" | "can2";
export type CanMode = "live" | "simulation" | "listen-only" | "offline";

export type CanInterfaceStatus = {
    exists: boolean;
    up: boolean;
    state: string;
};

export type CanBusStatus = {
    active: CanInterface | null;
    mode: CanMode;
    vcan0?: CanInterfaceStatus;
    can0?: CanInterfaceStatus;
    can1?: CanInterfaceStatus;
    can2?: CanInterfaceStatus;
};

type CanBusState = {
    status: CanBusStatus | null;
    selectedInterface: CanInterface;
    selectedMode: CanMode;
    setSelectedInterface: (iface: CanInterface) => void;
    setSelectedMode: (mode: CanMode) => void;
    refreshStatus: () => Promise<void>;
};

export function getApiBaseUrl() {
    // In dev, prefer the Vite proxy so the browser calls /data/* on the
    // same origin and Vite forwards to FastAPI. This avoids CORS on macOS.
    if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
    return "";
}

export const useCanBusStore = create<CanBusState>((set) => ({
    status: null,
    // Safe dev defaults: no real vehicle CAN traffic.
    selectedInterface: "vcan0",
    selectedMode: "simulation",

    setSelectedInterface: (iface) => set({ selectedInterface: iface }),
    setSelectedMode: (mode) => set({ selectedMode: mode }),

    async refreshStatus() {
        try {
            const res = await fetch(`${getApiBaseUrl()}/data/can/status`);
            const status = await res.json();

            if (!res.ok) {
                throw new Error(status?.error ?? status?.detail ?? "Failed to load CAN status");
            }

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
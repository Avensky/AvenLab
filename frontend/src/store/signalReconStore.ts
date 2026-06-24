import { create } from "zustand";

export type ReconTaskKind =
    | "idle"
    | "brake"
    | "throttle"
    | "steer_left"
    | "steer_right"
    | "headlights"
    | "blinker_left"
    | "blinker_right";

export type ReconTask = {
    id: string;
    label: string;
    instruction: string;
    kind: ReconTaskKind;
    durationMs: number;
};

export type ReconMarker = {
    taskId: string;
    event: "task_start" | "task_complete" | "user_action";
    timestamp: number;
};

const TASKS: ReconTask[] = [
    {
        id: "idle_baseline",
        label: "Idle Baseline",
        instruction: "Keep the vehicle idle. Do not press anything.",
        kind: "idle",
        durationMs: 10_000,
    },
    {
        id: "brake_press",
        label: "Brake Signal",
        instruction: "Press and hold brake.",
        kind: "brake",
        durationMs: 5_000,
    },
    {
        id: "headlights_toggle",
        label: "Headlights",
        instruction: "Toggle headlights once.",
        kind: "headlights",
        durationMs: 5_000,
    },
    {
        id: "left_blinker",
        label: "Left Blinker",
        instruction: "Toggle left blinker.",
        kind: "blinker_left",
        durationMs: 5_000,
    },
    {
        id: "right_blinker",
        label: "Right Blinker",
        instruction: "Toggle right blinker.",
        kind: "blinker_right",
        durationMs: 5_000,
    },
];

type SignalReconState = {
    active: boolean;
    taskIndex: number;
    taskStartedAt: number | null;
    tasks: ReconTask[];
    markers: ReconMarker[];

    start: () => void;
    stop: () => void;
    nextTask: () => void;
    addMarker: (marker: Omit<ReconMarker, "timestamp">) => void;
};

export const useSignalReconStore = create<SignalReconState>((set, get) => ({
    active: false,
    taskIndex: 0,
    taskStartedAt: null,
    tasks: TASKS,
    markers: [],

    start() {
        const task = get().tasks[0];

        set({
            active: true,
            taskIndex: 0,
            taskStartedAt: performance.now(),
            markers: [
                {
                    taskId: task.id,
                    event: "task_start",
                    timestamp: Date.now(),
                },
            ],
        });
    },

    stop() {
        set({
            active: false,
            taskStartedAt: null,
        });
    },

    nextTask() {
        const state = get();
        const nextIndex = state.taskIndex + 1;

        if (nextIndex >= state.tasks.length) {
            set({
                active: false,
                taskStartedAt: null,
            });
            return;
        }

        const nextTask = state.tasks[nextIndex];

        set({
            taskIndex: nextIndex,
            taskStartedAt: performance.now(),
            markers: [
                ...state.markers,
                {
                    taskId: nextTask.id,
                    event: "task_start",
                    timestamp: Date.now(),
                },
            ],
        });
    },

    addMarker(marker) {
        set((state) => ({
            markers: [
                ...state.markers,
                {
                    ...marker,
                    timestamp: Date.now(),
                },
            ],
        }));
    },
}));
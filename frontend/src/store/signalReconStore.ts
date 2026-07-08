// store/signalReconStore.ts
import { create } from "zustand";
import { getApiBaseUrl, type CanInterface, type CanMode } from "./canBusStore";
import { useCanDataStore } from "./canDataStore";
import {
    CAPTURE_MS,
    ACTION_MS,
    BASELINE_MS,
    COUNTDOWN_MS,
    RECON_MISSIONS,
    getMissionSteps,
    type MissionRank,
    type ReconMissionDefinition,
    type ReconPhaseName,
    type ReconStepDefinition,
} from "./signalReconMissions";

export type ReconMission = ReconMissionDefinition;
export type ReconStep = ReconStepDefinition;

export type CanVehicleIdentity = {
    slug: string;
    year?: number | null;
    make: string;
    model: string;
    trim?: string | null;
    alias?: string | null;
    vin?: string | null;
    datasetKind?: "live" | "practice" | "simulation";
    notes?: string;
    metadata?: Record<string, unknown>;
};

export type ReconRunPhase = ReconPhaseName | "idle" | "complete" | "cancelled";

type SignalReconState = {
    vehicleSlug: string;
    vehicleIdentity: CanVehicleIdentity;
    missions: ReconMission[];
    steps: ReconStep[];
    selectedMission: ReconMission | null;
    selectedRank: MissionRank | "ALL";

    activeSessionId: string | null;
    sessionStartedAt: number | null;

    activeRunId: string | null;
    activeStep: ReconStep | null;
    activeStepIndex: number;
    activePhase: ReconRunPhase;
    phaseStartedAt: number | null;
    phaseEndsAt: number | null;

    setVehicleSlug: (slug: string) => void;
    setVehicleIdentity: (vehicle: CanVehicleIdentity) => void;
    setSelectedRank: (rank: MissionRank | "ALL") => void;
    loadMissions: () => Promise<void>;
    selectMission: (mission: ReconMission) => Promise<void>;
    selectMissionByCode: (missionCode: string) => Promise<void>;
    selectStepByIndex: (index: number) => void;

    startSession: (args: {
        busInterface: CanInterface;
        busMode: CanMode;
    }) => Promise<string>;

    postMarker: (args: {
        stepCode?: string;
        markerType: string;
        label?: string;
        metadata?: Record<string, unknown>;
    }) => Promise<void>;

    runStep: (step?: ReconStep) => Promise<void>;
    runSelectedMission: () => Promise<void>;
    cancelActiveRun: () => void;

    stopSession: (metadata?: Record<string, unknown>) => Promise<void>;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function makeRunId() {
    return globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowMs() {
    return performance.now();
}

function phaseDuration(step: ReconStep, phase: ReconPhaseName): number {
    if (phase === "baseline") return step.baseline_ms ?? BASELINE_MS;
    if (phase === "countdown") return step.countdown_ms ?? COUNTDOWN_MS;
    if (phase === "action") return step.action_ms ?? ACTION_MS;
    return step.capture_ms ?? CAPTURE_MS;
}

const DEFAULT_VEHICLE_IDENTITY: CanVehicleIdentity = {
    slug: "custom-vehicle",
    year: null,
    make: "Custom",
    model: "Vehicle",
    trim: null,
    alias: "Custom",
    datasetKind: "practice",
    notes: "Auto-created vehicle profile for Signal Recon sessions.",
    metadata: { source: "signal-recon-store-default" },
};

function normalizeVehicleIdentity(vehicle: CanVehicleIdentity): CanVehicleIdentity {
    const slug = vehicle.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom-vehicle";
    return {
        ...DEFAULT_VEHICLE_IDENTITY,
        ...vehicle,
        slug,
        make: vehicle.make || "Custom",
        model: vehicle.model || vehicle.alias || slug,
    };
}

export const useSignalReconStore = create<SignalReconState>((set, get) => ({
    vehicleSlug: DEFAULT_VEHICLE_IDENTITY.slug,
    vehicleIdentity: DEFAULT_VEHICLE_IDENTITY,
    missions: RECON_MISSIONS,
    steps: getMissionSteps(RECON_MISSIONS[0]),
    selectedMission: RECON_MISSIONS[0] ?? null,
    selectedRank: "ALL",

    activeSessionId: null,
    sessionStartedAt: null,

    activeRunId: null,
    activeStep: null,
    activeStepIndex: 0,
    activePhase: "idle",
    phaseStartedAt: null,
    phaseEndsAt: null,

    setVehicleSlug: (slug) => set((state) => {
        const vehicleIdentity = normalizeVehicleIdentity({
            ...state.vehicleIdentity,
            slug,
        });
        return { vehicleSlug: vehicleIdentity.slug, vehicleIdentity };
    }),

    setVehicleIdentity: (vehicle) => set(() => {
        const vehicleIdentity = normalizeVehicleIdentity(vehicle);
        return { vehicleSlug: vehicleIdentity.slug, vehicleIdentity };
    }),

    setSelectedRank: (rank) => set({ selectedRank: rank }),

    async loadMissions() {
        const selectedMission = get().selectedMission ?? RECON_MISSIONS[0] ?? null;
        set({
            missions: RECON_MISSIONS,
            selectedMission,
            steps: selectedMission ? getMissionSteps(selectedMission) : [],
        });
    },

    async selectMission(mission) {
        set({
            selectedMission: mission,
            steps: getMissionSteps(mission),
            activeRunId: null,
            activeStep: null,
            activeStepIndex: 0,
            activePhase: "idle",
            phaseStartedAt: null,
            phaseEndsAt: null,
        });
    },

    async selectMissionByCode(missionCode) {
        const mission = get().missions.find((item) => item.mission_code === missionCode);
        if (!mission) throw new Error(`Unknown Signal Recon mission: ${missionCode}`);
        await get().selectMission(mission);
    },

    selectStepByIndex(index) {
        const steps = get().steps;
        const safeIndex = Math.max(0, Math.min(index, steps.length - 1));
        set({ activeStepIndex: safeIndex, activeStep: steps[safeIndex] ?? null });
    },

    async startSession({ busInterface, busMode }) {
        const { vehicleIdentity, selectedMission } = get();
        const vehicleSlug = vehicleIdentity.slug;

        if (!selectedMission) {
            throw new Error("No mission selected");
        }

        const res = await fetch(`${getApiBaseUrl()}/data/can/session/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                vehicle_slug: vehicleSlug,
                vehicle: vehicleIdentity,
                mission_code: selectedMission.mission_code,
                label: selectedMission.title,
                bus_interface: busInterface,
                bus_mode: busMode,
                metadata: {
                    source: "signal-recon",
                    target: selectedMission.target,
                    rank: selectedMission.rank,
                    category: selectedMission.category,
                    recording_stage: selectedMission.recording_stage,
                    difficulty: selectedMission.difficulty,
                    default_timing: selectedMission.default_timing,
                    frontend_started_at: new Date().toISOString(),
                },
            }),
        });

        const data = await res.json();

        if (!res.ok || !data.session_id) {
            throw new Error(data.error ?? "Failed to start session");
        }

        set({
            activeSessionId: data.session_id,
            sessionStartedAt: nowMs(),
        });

        useCanDataStore.getState().setCurrentSessionId(data.session_id);
        useCanDataStore.getState().addLog(`[signal-recon] started ${selectedMission.mission_code}: ${selectedMission.title}`);

        return data.session_id;
    },

    async postMarker({ stepCode, markerType, label, metadata = {} }) {
        const { activeSessionId, selectedMission, sessionStartedAt } = get();

        if (!activeSessionId || !selectedMission || sessionStartedAt === null) return;

        const timestampMs = Math.round(nowMs() - sessionStartedAt);

        const res = await fetch(`${getApiBaseUrl()}/data/can/session/${activeSessionId}/marker`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mission_code: selectedMission.mission_code,
                step_code: stepCode,
                marker_type: markerType,
                label,
                timestamp_ms: timestampMs,
                metadata: {
                    source: "signal-recon",
                    analysis_mode: selectedMission.analysis_mode,
                    expected_target:
                        selectedMission.analysis_mode === "baseline_profile"
                            ? null
                            : selectedMission.target,
                    ...metadata,
                },
            }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? `Failed to post marker: ${markerType}`);
        }
    },

    async runStep(stepArg) {
        const step = stepArg ?? get().steps[get().activeStepIndex];
        const selectedMission = get().selectedMission;

        if (!selectedMission) throw new Error("No mission selected");
        if (!step) throw new Error("No step selected");
        if (!get().activeSessionId) throw new Error("Start a CAN session before running a Signal Recon step");

        const runId = makeRunId();
        const stepIndex = get().steps.findIndex((item) => item.id === step.id);

        set({
            activeRunId: runId,
            activeStep: step,
            activeStepIndex: stepIndex >= 0 ? stepIndex : get().activeStepIndex,
            activePhase: "idle",
            phaseStartedAt: null,
            phaseEndsAt: null,
        });

        const phases: ReconPhaseName[] = ["baseline", "countdown", "action", "capture"];

        await get().postMarker({
            stepCode: step.step_code,
            markerType: "step_start",
            label: step.label,
            metadata: {
                step_id: step.id,
                action_text: step.action_text,
                instruction: step.instruction,
                step_metadata: step.metadata,
            },
        });

        for (const phase of phases) {
            if (get().activeRunId !== runId) return;

            const startedAt = nowMs();
            const durationMs = phaseDuration(step, phase);

            set({
                activePhase: phase,
                phaseStartedAt: startedAt,
                phaseEndsAt: startedAt + durationMs,
            });

            await get().postMarker({
                stepCode: step.step_code,
                markerType: `${phase}_start`,
                label: phase === "action" ? step.action_text ?? step.label : step.label,
                metadata: {
                    phase,
                    planned_duration_ms: durationMs,
                    step_id: step.id,
                    step_metadata: step.metadata,
                },
            });

            await sleep(durationMs);
        }

        if (get().activeRunId !== runId) return;

        await get().postMarker({
            stepCode: step.step_code,
            markerType: "step_complete",
            label: step.label,
            metadata: { step_id: step.id, step_metadata: step.metadata },
        });

        set({
            activeRunId: null,
            activePhase: "complete",
            phaseStartedAt: nowMs(),
            phaseEndsAt: null,
        });
    },

    async runSelectedMission() {
        const steps = get().steps;

        for (let index = 0; index < steps.length; index += 1) {
            if (!get().activeSessionId) return;
            set({ activeStepIndex: index, activeStep: steps[index] });
            await get().runStep(steps[index]);
        }
    },

    cancelActiveRun() {
        const step = get().activeStep;
        void get().postMarker({
            stepCode: step?.step_code,
            markerType: "run_cancelled",
            label: step?.label,
            metadata: { step_id: step?.id },
        });

        set({
            activeRunId: null,
            activePhase: "cancelled",
            phaseStartedAt: nowMs(),
            phaseEndsAt: null,
        });
    },

    async stopSession(metadata = {}) {
        const { activeSessionId, selectedMission } = get();
        if (!activeSessionId) return;

        get().cancelActiveRun();

        const res = await fetch(`${getApiBaseUrl()}/data/can/session/${activeSessionId}/stop`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                metadata: {
                    source: "signal-recon",
                    mission_code: selectedMission?.mission_code,
                    frontend_stopped_at: new Date().toISOString(),
                    ...metadata,
                },
            }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? "Failed to stop session");
        }

        useCanDataStore.getState().setCurrentSessionId(null);
        useCanDataStore.getState().addLog(`[signal-recon] stopped ${selectedMission?.mission_code ?? "session"}`);

        set({
            activeSessionId: null,
            sessionStartedAt: null,
            activeRunId: null,
            activeStep: null,
            activePhase: "idle",
            phaseStartedAt: null,
            phaseEndsAt: null,
        });
    },
}));

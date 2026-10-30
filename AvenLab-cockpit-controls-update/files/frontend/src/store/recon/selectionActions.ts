import type { StateCreator } from "zustand";
import {
  RECON_MISSIONS,
  applyMissionProtocolToSteps,
  getDefaultMissionProtocol,
} from "./catalog";

import { normalizeVehicleIdentity } from "./identity";
import type { SignalReconState } from "./types";

// Owns setVehicleSlug, setVehicleIdentity, setSelectedRank, loadMissions, selectMission, selectMissionByCode, switchMission, selectStepByIndex; all actions share the same authoritative store.
export const createSelectionActions: StateCreator<
  SignalReconState,
  [],
  [],
  Pick<
    SignalReconState,
    | "setVehicleSlug"
    | "setVehicleIdentity"
    | "setSelectedRank"
    | "loadMissions"
    | "selectMission"
    | "selectMissionByCode"
    | "switchMission"
    | "selectStepByIndex"
  >
> = (set, get) => ({
  setVehicleSlug: (slug) =>
    set((state) => {
      const vehicleIdentity = normalizeVehicleIdentity({
        ...state.vehicleIdentity,
        slug,
      });
      return {
        vehicleSlug: vehicleIdentity.slug,
        vehicleIdentity,
      };
    }),

  setVehicleIdentity: (vehicle) =>
    set(() => {
      const vehicleIdentity = normalizeVehicleIdentity(vehicle);
      return {
        vehicleSlug: vehicleIdentity.slug,
        vehicleIdentity,
      };
    }),

  setSelectedRank: (rank) => set({ selectedRank: rank }),

  async loadMissions() {
    const selectedMission = get().selectedMission ?? RECON_MISSIONS[0] ?? null;
    const protocol = selectedMission
      ? (get().missionProtocols[selectedMission.mission_code] ??
        getDefaultMissionProtocol(selectedMission))
      : null;

    set({
      missions: RECON_MISSIONS,
      selectedMission,
      steps:
        selectedMission && protocol
          ? applyMissionProtocolToSteps(selectedMission, protocol)
          : [],
    });
  },

  async selectMission(mission) {
    const protocol =
      get().missionProtocols[mission.mission_code] ??
      getDefaultMissionProtocol(mission);

    set({
      selectedMission: mission,
      steps: applyMissionProtocolToSteps(mission, protocol),
      activeRunId: null,
      activeStep: null,
      activeStepIndex: 0,
      activePhase: "idle",
      phaseStartedAt: null,
      phaseEndsAt: null,
    });
  },

  async selectMissionByCode(missionCode) {
    const mission = get().missions.find(
      (item) => item.mission_code === missionCode,
    );
    if (!mission) {
      throw new Error(`Unknown Signal Recon mission: ${missionCode}`);
    }
    await get().selectMission(mission);
  },

  async switchMission({
    mission,
    busInterface,
    busMode,
    restartActiveSession = true,
  }) {
    if (get().activeRunId) {
      throw new Error(
        "Cancel the active mission step before switching missions.",
      );
    }

    const hadActiveSession = Boolean(get().activeSessionId);
    if (hadActiveSession) {
      await get().stopSession({
        ui_event: "mission_switch",
        next_mission_code: mission.mission_code,
      });
    }

    await get().selectMission(mission);

    if (hadActiveSession && restartActiveSession) {
      return get().startSession({
        busInterface,
        busMode,
      });
    }

    return null;
  },

  selectStepByIndex(index) {
    const steps = get().steps;
    const safeIndex = Math.max(0, Math.min(index, steps.length - 1));
    set({
      activeStepIndex: safeIndex,
      activeStep: steps[safeIndex] ?? null,
    });
  },
});

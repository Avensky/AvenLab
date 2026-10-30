import type { StateCreator } from "zustand";
import {
  ALL_RECON_PHASES,
  applyMissionProtocolToSteps,
  getDefaultMissionProtocol,
  type ReconMarkerDefinition,
} from "./catalog";

import { persistProtocolMap, sanitizeProtocol } from "./protocol";
import { makeMarkerId } from "./runtime";
import type { SignalReconState } from "./types";

// Owns setMissionEnabledPhases, addMissionMarker, updateMissionMarker, removeMissionMarker, updateStepTiming, updateStepAnalysis, resetMissionProtocol; all actions share the same authoritative store.
export const createProtocolActions: StateCreator<
  SignalReconState,
  [],
  [],
  Pick<
    SignalReconState,
    | "setMissionEnabledPhases"
    | "addMissionMarker"
    | "updateMissionMarker"
    | "removeMissionMarker"
    | "updateStepTiming"
    | "updateStepAnalysis"
    | "resetMissionProtocol"
  >
> = (set, get) => ({
  setMissionEnabledPhases(missionCode, phases) {
    const state = get();
    const mission = state.missions.find(
      (item) => item.mission_code === missionCode,
    );
    if (!mission) return;

    const current =
      state.missionProtocols[missionCode] ?? getDefaultMissionProtocol(mission);
    const ordered = ALL_RECON_PHASES.filter((phase) => phases.includes(phase));
    const nextProtocol = sanitizeProtocol(mission, {
      ...current,
      enabled_phases: ordered.length > 0 ? ordered : ["capture"],
    });
    const missionProtocols = {
      ...state.missionProtocols,
      [missionCode]: nextProtocol,
    };

    persistProtocolMap(missionProtocols);
    set({
      missionProtocols,
      steps:
        state.selectedMission?.mission_code === missionCode
          ? applyMissionProtocolToSteps(mission, nextProtocol)
          : state.steps,
    });
  },

  addMissionMarker(missionCode, marker = {}) {
    const state = get();
    const mission = state.missions.find(
      (item) => item.mission_code === missionCode,
    );
    if (!mission) return;

    const current =
      state.missionProtocols[missionCode] ?? getDefaultMissionProtocol(mission);
    const nextMarker: ReconMarkerDefinition = {
      id: marker.id ?? makeMarkerId(),
      trigger: marker.trigger ?? "action",
      marker_type: marker.marker_type ?? "action_start",
      label_source: marker.label_source ?? "action_text",
      label: marker.label,
      enabled: marker.enabled !== false,
    };
    const nextProtocol = sanitizeProtocol(mission, {
      ...current,
      markers: [...current.markers, nextMarker],
    });
    const missionProtocols = {
      ...state.missionProtocols,
      [missionCode]: nextProtocol,
    };

    persistProtocolMap(missionProtocols);
    set({ missionProtocols });
  },

  updateMissionMarker(missionCode, markerId, patch) {
    const state = get();
    const mission = state.missions.find(
      (item) => item.mission_code === missionCode,
    );
    if (!mission) return;

    const current =
      state.missionProtocols[missionCode] ?? getDefaultMissionProtocol(mission);
    const nextProtocol = sanitizeProtocol(mission, {
      ...current,
      markers: current.markers.map((marker) =>
        marker.id === markerId ? { ...marker, ...patch } : marker,
      ),
    });
    const missionProtocols = {
      ...state.missionProtocols,
      [missionCode]: nextProtocol,
    };

    persistProtocolMap(missionProtocols);
    set({ missionProtocols });
  },

  removeMissionMarker(missionCode, markerId) {
    const state = get();
    const mission = state.missions.find(
      (item) => item.mission_code === missionCode,
    );
    if (!mission) return;

    const current =
      state.missionProtocols[missionCode] ?? getDefaultMissionProtocol(mission);
    const nextProtocol = sanitizeProtocol(mission, {
      ...current,
      markers: current.markers.filter((marker) => marker.id !== markerId),
    });
    const missionProtocols = {
      ...state.missionProtocols,
      [missionCode]: nextProtocol,
    };

    persistProtocolMap(missionProtocols);
    set({ missionProtocols });
  },

  updateStepTiming(missionCode, stepId, timing) {
    const state = get();
    const mission = state.missions.find(
      (item) => item.mission_code === missionCode,
    );
    if (!mission) return;

    const current =
      state.missionProtocols[missionCode] ?? getDefaultMissionProtocol(mission);
    const currentTiming = current.step_timing_overrides[stepId] ?? {};
    const nextProtocol = sanitizeProtocol(mission, {
      ...current,
      step_timing_overrides: {
        ...current.step_timing_overrides,
        [stepId]: {
          ...currentTiming,
          ...timing,
        },
      },
    });
    const missionProtocols = {
      ...state.missionProtocols,
      [missionCode]: nextProtocol,
    };

    persistProtocolMap(missionProtocols);
    set({
      missionProtocols,
      steps:
        state.selectedMission?.mission_code === missionCode
          ? applyMissionProtocolToSteps(mission, nextProtocol)
          : state.steps,
    });
  },

  updateStepAnalysis(missionCode, stepId, analysis) {
    const state = get();
    const mission = state.missions.find(
      (item) => item.mission_code === missionCode,
    );
    if (!mission) return;

    const current =
      state.missionProtocols[missionCode] ?? getDefaultMissionProtocol(mission);
    const currentAnalysis = current.step_analysis_overrides[stepId] ?? {};
    const nextProtocol = sanitizeProtocol(mission, {
      ...current,
      step_analysis_overrides: {
        ...current.step_analysis_overrides,
        [stepId]: {
          ...currentAnalysis,
          ...analysis,
        },
      },
    });
    const missionProtocols = {
      ...state.missionProtocols,
      [missionCode]: nextProtocol,
    };

    persistProtocolMap(missionProtocols);
    set({
      missionProtocols,
      steps:
        state.selectedMission?.mission_code === missionCode
          ? applyMissionProtocolToSteps(mission, nextProtocol)
          : state.steps,
    });
  },

  resetMissionProtocol(missionCode) {
    const state = get();
    const mission = state.missions.find(
      (item) => item.mission_code === missionCode,
    );
    if (!mission) return;

    const nextProtocol = getDefaultMissionProtocol(mission);
    const missionProtocols = {
      ...state.missionProtocols,
      [missionCode]: nextProtocol,
    };

    persistProtocolMap(missionProtocols);
    set({
      missionProtocols,
      steps:
        state.selectedMission?.mission_code === missionCode
          ? applyMissionProtocolToSteps(mission, nextProtocol)
          : state.steps,
    });
  },
});

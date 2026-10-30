import type { StateCreator } from "zustand";
import {
  getDefaultMissionProtocol,
  type ReconMarkerTrigger,
  type ReconPhaseName,
} from "./catalog";

import {
  makeRunId,
  markerLabel,
  nowMs,
  phaseDuration,
  waitForPendingMarkerPosts,
  waitForRun,
} from "./runtime";
import type { SignalReconState } from "./types";

// Owns runStep, runSelectedMission, cancelActiveRun; all actions share the same authoritative store.
export const createRunActions: StateCreator<
  SignalReconState,
  [],
  [],
  Pick<SignalReconState, "runStep" | "runSelectedMission" | "cancelActiveRun">
> = (set, get) => ({
  async runStep(stepArg) {
    const state = get();
    const step = stepArg ?? state.steps[state.activeStepIndex];
    const selectedMission = state.selectedMission;

    if (!selectedMission) {
      throw new Error("No mission selected");
    }
    if (!step) {
      throw new Error("No step selected");
    }
    if (!state.activeSessionId) {
      throw new Error("Start a CAN session before running a Signal Recon step");
    }

    const protocol =
      state.missionProtocols[selectedMission.mission_code] ??
      getDefaultMissionProtocol(selectedMission);
    const runId = makeRunId();
    const stepIndex = state.steps.findIndex((item) => item.id === step.id);

    set({
      activeRunId: runId,
      activeStep: step,
      activeStepIndex: stepIndex >= 0 ? stepIndex : state.activeStepIndex,
      activePhase: "idle",
      phaseStartedAt: null,
      phaseEndsAt: null,
    });

    const postConfigured = async (
      trigger: ReconMarkerTrigger,
      phase?: ReconPhaseName,
      durationMs?: number,
    ) => {
      const currentProtocol =
        get().missionProtocols[selectedMission.mission_code] ?? protocol;

      for (const marker of currentProtocol.markers) {
        if (
          marker.enabled === false ||
          marker.trigger !== trigger ||
          !marker.marker_type.trim()
        ) {
          continue;
        }

        await get().postMarker({
          stepCode: step.step_code,
          markerType: marker.marker_type,
          label: markerLabel(marker, step),
          metadata: {
            marker_definition_id: marker.id,
            marker_trigger: trigger,
            phase,
            planned_duration_ms: durationMs,
            step_id: step.id,
            action_text: step.action_text,
            instruction: step.instruction,
            step_metadata: step.metadata,
            analyzer_profile:
              step.metadata?.analyzer_profile ??
              selectedMission.analyzer_profile,
            expected_value: step.metadata?.expected_value,
            expected_unit: step.metadata?.expected_unit,
            expected_direction: step.metadata?.expected_direction,
            return_value: step.metadata?.return_value,
            hold_ms: step.metadata?.hold_ms ?? durationMs,
            field_widths: step.metadata?.field_widths,
            allow_signed: step.metadata?.allow_signed,
            allow_little_endian: step.metadata?.allow_little_endian,
            allow_big_endian: step.metadata?.allow_big_endian,
          },
        });
      }
    };

    await postConfigured("step_start");

    for (const phase of protocol.enabled_phases) {
      if (get().activeRunId !== runId) return;

      const startedAt = nowMs();
      const durationMs = phaseDuration(step, phase);

      set({
        activePhase: phase,
        phaseStartedAt: startedAt,
        phaseEndsAt: startedAt + durationMs,
      });

      await postConfigured(phase, phase, durationMs);

      const completed = await waitForRun(
        durationMs,
        runId,
        () => get().activeRunId,
      );
      if (!completed) return;
    }

    if (get().activeRunId !== runId) return;

    await postConfigured("step_complete");

    set({
      activeRunId: null,
      activePhase: "complete",
      phaseStartedAt: nowMs(),
      phaseEndsAt: null,
    });
  },

  async runSelectedMission() {
    const steps = get().steps;
    const sessionId = get().activeSessionId;

    for (let index = 0; index < steps.length; index += 1) {
      if (!get().activeSessionId) return;

      set({
        activeStepIndex: index,
        activeStep: steps[index],
      });
      await get().runStep(steps[index]);
      const current = get();
      if (
        current.activeSessionId !== sessionId ||
        current.activePhase === "cancelled"
      ) {
        return;
      }
    }

    await waitForPendingMarkerPosts();
  },

  async cancelActiveRun() {
    const state = get();
    if (!state.activeRunId) return;

    const step = state.activeStep;
    const mission = state.selectedMission;
    const protocol = mission
      ? (state.missionProtocols[mission.mission_code] ??
        getDefaultMissionProtocol(mission))
      : null;

    // Clear the run id first so waitForRun exits immediately, then wait for
    // cancellation markers before a caller is allowed to finalize.
    set({
      activeRunId: null,
      activePhase: "cancelled",
      phaseStartedAt: nowMs(),
      phaseEndsAt: null,
    });

    if (!step || !protocol) return;

    for (const marker of protocol.markers) {
      if (
        marker.enabled === false ||
        marker.trigger !== "run_cancelled" ||
        !marker.marker_type.trim()
      ) {
        continue;
      }

      await get().postMarker({
        stepCode: step.step_code,
        markerType: marker.marker_type,
        label: markerLabel(marker, step),
        metadata: {
          marker_definition_id: marker.id,
          marker_trigger: "run_cancelled",
          step_id: step.id,
          step_metadata: step.metadata,
        },
      });
    }
  },
});

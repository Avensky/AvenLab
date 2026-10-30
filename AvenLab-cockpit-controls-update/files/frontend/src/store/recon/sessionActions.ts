import type { StateCreator } from "zustand";
import { getApiBaseUrl } from "./canBusStore";
import { useCanDataStore } from "./canDataStore";
import { getDefaultMissionProtocol } from "./catalog";

import {
  isCorrelationMarker,
  serializeMarkerPost,
  sleep,
  waitForPendingMarkerPosts,
} from "./runtime";
import type { SignalReconState } from "./types";
const MARKER_POST_ATTEMPTS = 3;

// Owns startSession, postMarker, flushMarkerPosts, stopSession; all actions share the same authoritative store.
export const createSessionActions: StateCreator<
  SignalReconState,
  [],
  [],
  Pick<
    SignalReconState,
    "startSession" | "postMarker" | "flushMarkerPosts" | "stopSession"
  >
> = (set, get) => ({
  async startSession({ busInterface, busMode }) {
    const { vehicleIdentity, selectedMission, missionProtocols, steps } = get();
    const vehicleSlug = vehicleIdentity.slug;

    if (!selectedMission) {
      throw new Error("No mission selected");
    }

    const protocol =
      missionProtocols[selectedMission.mission_code] ??
      getDefaultMissionProtocol(selectedMission);

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
          analysis_mode: selectedMission.analysis_mode,
          expected_target:
            selectedMission.analysis_mode === "baseline_profile"
              ? null
              : selectedMission.target,
          analyzer_profile: selectedMission.analyzer_profile,
          ...selectedMission.metadata,
          mission_protocol: protocol,
          mission_steps: steps.map((step) => ({
            id: step.id,
            step_code: step.step_code,
            label: step.label,
            baseline_ms: step.baseline_ms,
            countdown_ms: step.countdown_ms,
            action_ms: step.action_ms,
            capture_ms: step.capture_ms,
            metadata: step.metadata,
          })),
        },
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.session_id) {
      throw new Error(data.error ?? data.detail ?? "Failed to start session");
    }

    set({
      activeSessionId: data.session_id,
      postedMarkerCount: 0,
      markerPostFailures: 0,
    });

    useCanDataStore.getState().setCurrentSessionId(data.session_id);
    useCanDataStore
      .getState()
      .addLog(
        `[signal-recon] started ${selectedMission.mission_code}: ${selectedMission.title}`,
      );

    return data.session_id as string;
  },

  postMarker({ stepCode, markerType, label, metadata = {} }) {
    return serializeMarkerPost(async () => {
      const { activeSessionId, selectedMission } = get();

      if (!activeSessionId || !selectedMission) {
        throw new Error(
          `Cannot post ${markerType}: no active Signal Recon session`,
        );
      }

      const sessionId = activeSessionId;
      const mission = selectedMission;
      const clientEventId =
        globalThis.crypto?.randomUUID?.() ??
        `marker-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
      let lastError = `Failed to post marker: ${markerType}`;

      for (let attempt = 1; attempt <= MARKER_POST_ATTEMPTS; attempt += 1) {
        try {
          const res = await fetch(
            `${getApiBaseUrl()}/data/can/session/${sessionId}/marker`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mission_code: mission.mission_code,
                step_code: stepCode,
                marker_type: markerType,
                label,
                client_event_id: clientEventId,
                metadata: {
                  timestamp_authority: "server",
                  source: "signal-recon",
                  analysis_mode: mission.analysis_mode,
                  expected_target:
                    mission.analysis_mode === "baseline_profile"
                      ? null
                      : mission.target,
                  ...metadata,
                },
              }),
            },
          );
          const data = await res.json().catch(() => ({}));

          if (res.ok && data.ok !== false && data.marker_id) {
            set((current) => ({
              postedMarkerCount: current.postedMarkerCount + 1,
            }));
            return;
          }

          lastError =
            data.error ?? data.detail ?? `Failed to post marker: ${markerType}`;

          // Conflicts and validation failures are not transient.
          if (res.status < 500 && res.status !== 408 && res.status !== 429) {
            break;
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : lastError;
        }

        if (attempt < MARKER_POST_ATTEMPTS) {
          await sleep(150 * attempt);
        }
      }

      set((current) => ({
        markerPostFailures: current.markerPostFailures + 1,
      }));
      throw new Error(lastError);
    });
  },

  async flushMarkerPosts() {
    await waitForPendingMarkerPosts();
  },

  async stopSession(metadata = {}) {
    const {
      activeSessionId,
      selectedMission,
      activeRunId,
      missionProtocols,
      steps,
    } = get();
    if (!activeSessionId) return;

    if (activeRunId) {
      await get().cancelActiveRun();
    }

    await waitForPendingMarkerPosts();

    const finalProtocol = selectedMission
      ? (missionProtocols[selectedMission.mission_code] ??
        getDefaultMissionProtocol(selectedMission))
      : null;
    const expectedActionMarkerCount =
      finalProtocol && selectedMission
        ? steps.length *
          finalProtocol.markers.filter(
            (marker) => marker.enabled !== false && isCorrelationMarker(marker),
          ).length
        : 0;
    const postedMarkerCount = get().postedMarkerCount;
    const markerPostFailures = get().markerPostFailures;

    const res = await fetch(
      `${getApiBaseUrl()}/data/can/session/${activeSessionId}/finalize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: {
            source: "signal-recon",
            mission_code: selectedMission?.mission_code,
            final_mission_protocol: finalProtocol,
            final_mission_steps: steps.map((step) => ({
              id: step.id,
              step_code: step.step_code,
              baseline_ms: step.baseline_ms,
              countdown_ms: step.countdown_ms,
              action_ms: step.action_ms,
              capture_ms: step.capture_ms,
            })),
            browser_posted_marker_count: postedMarkerCount,
            browser_marker_post_failures: markerPostFailures,
            expected_action_marker_count: expectedActionMarkerCount,
            ...metadata,
          },
        }),
      },
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        data.error ?? data.detail ?? "Failed to finalize session",
      );
    }

    useCanDataStore.getState().setCurrentSessionId(null);
    useCanDataStore
      .getState()
      .addLog(
        `[signal-recon] finalized ${selectedMission?.mission_code ?? "session"} using Pi server time`,
      );
    const serverMarkerCount =
      typeof data.markers === "number" ? data.markers : null;
    if (serverMarkerCount !== null && serverMarkerCount < postedMarkerCount) {
      useCanDataStore
        .getState()
        .addLog(
          `[signal-recon] marker reconciliation warning: browser acknowledged ${postedMarkerCount}, server finalized ${serverMarkerCount}`,
        );
    }
    if (data.capture_quality?.usable_for_analysis === false) {
      useCanDataStore
        .getState()
        .addLog(
          `[signal-recon] capture quality warning: ${data.capture_quality?.quality_issue ?? "session is not usable for target analysis"}`,
        );
    }

    set({
      activeSessionId: null,
      activeRunId: null,
      activeStep: null,
      activePhase: "idle",
      phaseStartedAt: null,
      phaseEndsAt: null,
      postedMarkerCount: 0,
      markerPostFailures: 0,
    });
  },
});

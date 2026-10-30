import { create } from "zustand";
import {
  RECON_MISSIONS,
  applyMissionProtocolToSteps,
  getDefaultMissionProtocol,
} from "./catalog";
import { DEFAULT_VEHICLE_IDENTITY } from "./identity";
import { loadProtocolMap } from "./protocol";
import { createProtocolActions } from "./protocolActions";
import { createRunActions } from "./runActions";
import { createSelectionActions } from "./selectionActions";
import { createSessionActions } from "./sessionActions";
import type { SignalReconState } from "./types";
export type * from "./types";

const INITIAL_PROTOCOLS = loadProtocolMap();
const INITIAL_MISSION = RECON_MISSIONS[0] ?? null;
const INITIAL_PROTOCOL = INITIAL_MISSION
  ? (INITIAL_PROTOCOLS[INITIAL_MISSION.mission_code] ??
    getDefaultMissionProtocol(INITIAL_MISSION))
  : null;

// One store, four action sections; never create a second mission/session owner.
export const useSignalReconStore = create<SignalReconState>()((...api) => ({
  vehicleSlug: DEFAULT_VEHICLE_IDENTITY.slug,
  vehicleIdentity: DEFAULT_VEHICLE_IDENTITY,
  missions: RECON_MISSIONS,
  missionProtocols: INITIAL_PROTOCOLS,
  steps:
    INITIAL_MISSION && INITIAL_PROTOCOL
      ? applyMissionProtocolToSteps(INITIAL_MISSION, INITIAL_PROTOCOL)
      : [],
  selectedMission: INITIAL_MISSION,
  selectedRank: "ALL",

  activeSessionId: null,

  activeRunId: null,
  activeStep: null,
  activeStepIndex: 0,
  activePhase: "idle",
  phaseStartedAt: null,
  phaseEndsAt: null,
  postedMarkerCount: 0,
  markerPostFailures: 0,

  ...createSelectionActions(...api),
  ...createProtocolActions(...api),
  ...createSessionActions(...api),
  ...createRunActions(...api),
}));

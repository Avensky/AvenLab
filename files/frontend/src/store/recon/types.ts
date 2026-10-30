import { type CanInterface, type CanMode } from "./canBusStore";
import {
  type MissionRank,
  type ReconMarkerDefinition,
  type ReconMissionDefinition,
  type ReconMissionProtocol,
  type ReconPhaseName,
  type ReconStepAnalysisMetadata,
  type ReconStepDefinition,
  type ReconTiming,
} from "./catalog";

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

export type SwitchMissionArgs = {
  mission: ReconMission;
  busInterface: CanInterface;
  busMode: CanMode;
  restartActiveSession?: boolean;
};

export type SignalReconState = {
  vehicleSlug: string;
  vehicleIdentity: CanVehicleIdentity;
  missions: ReconMission[];
  steps: ReconStep[];
  selectedMission: ReconMission | null;
  selectedRank: MissionRank | "ALL";
  missionProtocols: Record<string, ReconMissionProtocol>;

  activeSessionId: string | null;

  activeRunId: string | null;
  activeStep: ReconStep | null;
  activeStepIndex: number;
  activePhase: ReconRunPhase;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  postedMarkerCount: number;
  markerPostFailures: number;

  setVehicleSlug: (slug: string) => void;
  setVehicleIdentity: (vehicle: CanVehicleIdentity) => void;
  setSelectedRank: (rank: MissionRank | "ALL") => void;
  loadMissions: () => Promise<void>;
  selectMission: (mission: ReconMission) => Promise<void>;
  selectMissionByCode: (missionCode: string) => Promise<void>;
  switchMission: (args: SwitchMissionArgs) => Promise<string | null>;
  selectStepByIndex: (index: number) => void;

  setMissionEnabledPhases: (
    missionCode: string,
    phases: ReconPhaseName[],
  ) => void;
  addMissionMarker: (
    missionCode: string,
    marker?: Partial<ReconMarkerDefinition>,
  ) => void;
  updateMissionMarker: (
    missionCode: string,
    markerId: string,
    patch: Partial<ReconMarkerDefinition>,
  ) => void;
  removeMissionMarker: (missionCode: string, markerId: string) => void;
  updateStepTiming: (
    missionCode: string,
    stepId: string,
    timing: Partial<ReconTiming>,
  ) => void;
  updateStepAnalysis: (
    missionCode: string,
    stepId: string,
    analysis: Partial<ReconStepAnalysisMetadata>,
  ) => void;
  resetMissionProtocol: (missionCode: string) => void;

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
  flushMarkerPosts: () => Promise<void>;

  runStep: (step?: ReconStep) => Promise<void>;
  runSelectedMission: () => Promise<void>;
  cancelActiveRun: () => Promise<void>;

  stopSession: (metadata?: Record<string, unknown>) => Promise<void>;
};

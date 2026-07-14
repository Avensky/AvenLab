// store/signalReconMissions.ts
// Central mission catalog for Signal Recon.
// Keep this file data-first: UI components should read missions/steps from the store,
// and the store should use these definitions to post timed markers to the backend.

export const BASELINE_MS = 2000;
export const COUNTDOWN_MS = 3000;
export const ACTION_MS = 1800;
export const CAPTURE_MS = 1500;

export type MissionAnalysisMode =
    | "baseline_profile"
    | "target_correlation"
    | "state_compare"
    | "playback_validation";

export type MissionAnalyzerProfile =
    | "baseline_profile"
    | "boolean_transition"
    | "ordinal_level"
    | "continuous_trace"
    | "enum_state"
    | "pulse_event";

export type ExpectedDirection =
    | "increase"
    | "decrease"
    | "bidirectional"
    | "categorical"
    | "unknown";

export type ReconStepAnalysisMetadata = {
    analyzer_profile?: MissionAnalyzerProfile;
    expected_value?: number;
    expected_unit?: string;
    expected_direction?: ExpectedDirection;
    return_value?: number;
    hold_ms?: number;
    repetition?: number;
    field_widths?: Array<8 | 16 | 24 | 32>;
    allow_signed?: boolean;
    allow_little_endian?: boolean;
    allow_big_endian?: boolean;
};

export type MissionRank = "BASELINE" | "S" | "A" | "B" | "C";
export type MissionStatus = "ready" | "research" | "optional";
export type RecordingStage =
    | "baseline"
    | "quick_wins"
    | "core_driving"
    | "body_controls"
    | "misc";

export type ReconPhaseName = "baseline" | "countdown" | "action" | "capture";

export type ReconMarkerTrigger =
    | "step_start"
    | ReconPhaseName
    | "step_complete"
    | "run_cancelled";

export type ReconMarkerLabelSource =
    | "step_label"
    | "action_text"
    | "custom";

export type ReconTiming = {
    baseline_ms: number;
    countdown_ms: number;
    action_ms: number;
    capture_ms: number;
};

export type ReconMarkerDefinition = {
    id: string;
    trigger: ReconMarkerTrigger;
    marker_type: string;
    label_source: ReconMarkerLabelSource;
    label?: string;
    enabled?: boolean;
};

export type ReconMissionProtocol = {
    enabled_phases: ReconPhaseName[];
    markers: ReconMarkerDefinition[];
    step_timing_overrides: Record<string, Partial<ReconTiming>>;
    step_analysis_overrides: Record<string, Partial<ReconStepAnalysisMetadata>>;
};

export type MissionDifficulty = {
    rank: MissionRank;
    label: string;
    difficulty_score: number;
    research_value: number;
    demo_value: number;
    reason: string;
};

export type ReconStepDefinition = {
    id: string;
    step_code: string;
    label: string;
    instruction?: string;
    action_text?: string;
    sort_order: number;
    baseline_ms?: number;
    countdown_ms?: number;
    action_ms?: number;
    capture_ms?: number;
    metadata?: Record<string, unknown>;
};

type ReconStepTemplate = Omit<
    ReconStepDefinition,
    "id" | "sort_order" | "baseline_ms" | "countdown_ms" | "action_ms" | "capture_ms"
> & {
    timing?: Partial<ReconTiming>;
};

export type ReconSubMissionDefinition = {
    sub_mission_code: string;
    title: string;
    description?: string;
    steps: ReconStepTemplate[];
    metadata?: Record<string, unknown>;
};

export type ReconMissionDefinition = {
    analysis_mode: MissionAnalysisMode;
    analyzer_profile: MissionAnalyzerProfile;
    id: string;
    mission_code: string;
    title: string;
    target: string;
    rank: MissionRank;
    category: string;
    status: MissionStatus;
    recording_stage: RecordingStage;
    recording_order: number;
    difficulty: MissionDifficulty;
    description?: string;
    default_timing: ReconTiming;
    protocol?: Partial<Omit<ReconMissionProtocol, "step_timing_overrides">>;
    steps?: ReconStepTemplate[];
    sub_missions?: ReconSubMissionDefinition[];
    metadata?: Record<string, unknown>;
};

export const DEFAULT_RECON_TIMING: ReconTiming = {
    baseline_ms: BASELINE_MS,
    countdown_ms: COUNTDOWN_MS,
    action_ms: ACTION_MS,
    capture_ms: CAPTURE_MS,
};

export const ALL_RECON_PHASES: ReconPhaseName[] = [
    "baseline",
    "countdown",
    "action",
    "capture",
];

export const DEFAULT_TARGET_MARKERS: ReconMarkerDefinition[] = [
    {
        id: "action-start",
        trigger: "action",
        marker_type: "action_start",
        label_source: "action_text",
        enabled: true,
    },
];

function cloneMarkers(
    markers: ReconMarkerDefinition[],
): ReconMarkerDefinition[] {
    return markers.map((marker) => ({ ...marker }));
}

export function getDefaultMissionProtocol(
    mission: ReconMissionDefinition,
): ReconMissionProtocol {
    const baselineProfile =
        mission.analysis_mode === "baseline_profile" ||
        mission.rank === "BASELINE";

    const enabledPhases =
        mission.protocol?.enabled_phases?.length
            ? [...mission.protocol.enabled_phases]
            : baselineProfile
                ? (["capture"] as ReconPhaseName[])
                : [...ALL_RECON_PHASES];

    const markers =
        mission.protocol?.markers !== undefined
            ? cloneMarkers(mission.protocol.markers)
            : baselineProfile
                ? []
                : cloneMarkers(DEFAULT_TARGET_MARKERS);

    return {
        enabled_phases: enabledPhases,
        markers,
        step_timing_overrides: {},
        step_analysis_overrides: {},
    };
}

export const MISSION_RANKS: Record<MissionRank, MissionDifficulty> = {
    BASELINE: {
        rank: "BASELINE",
        label: "Baseline / calibration",
        difficulty_score: 1,
        research_value: 5,
        demo_value: 5,
        reason: "Required control recordings for every later comparison.",
    },
    S: {
        rank: "S",
        label: "Hardest / highest research value",
        difficulty_score: 5,
        research_value: 5,
        demo_value: 4,
        reason: "Often analog, encoded, multi-byte, high-rate, or correlation-based.",
    },
    A: {
        rank: "A",
        label: "Demo + paper critical",
        difficulty_score: 4,
        research_value: 4,
        demo_value: 5,
        reason: "Clear proof signals that are easier to validate and replay.",
    },
    B: {
        rank: "B",
        label: "Important breadth",
        difficulty_score: 3,
        research_value: 3,
        demo_value: 3,
        reason: "Useful body/control signals that broaden the dataset.",
    },
    C: {
        rank: "C",
        label: "Nice-to-have richness",
        difficulty_score: 2,
        research_value: 2,
        demo_value: 2,
        reason: "Good extra context, but not required for the core paper.",
    },
};

const STAGE_ORDER: Record<RecordingStage, number> = {
    baseline: 0,
    quick_wins: 100,
    core_driving: 200,
    body_controls: 300,
    misc: 400,
};

function timing(overrides: Partial<ReconTiming> = {}): ReconTiming {
    return { ...DEFAULT_RECON_TIMING, ...overrides };
}

function step(
    step_code: string,
    label: string,
    instruction: string,
    action_text: string,
    options: {
        timing?: Partial<ReconTiming>;
        metadata?: Record<string, unknown>;
    } = {}
): ReconStepTemplate {
    return {
        step_code,
        label,
        instruction,
        action_text,
        timing: options.timing,
        metadata: options.metadata,
    };
}

function toggleSteps(target: string, onInstruction: string, offInstruction: string): ReconStepTemplate[] {
    return [
        step(`${target}_on`, "Turn ON", onInstruction, "Turn ON"),
        step(`${target}_off`, "Turn OFF", offInstruction, "Turn OFF"),
    ];
}

function pressSteps(target: string, pressInstruction: string, releaseInstruction: string): ReconStepTemplate[] {
    return [
        step(`${target}_press`, "Press / activate", pressInstruction, "Press"),
        step(`${target}_release`, "Release", releaseInstruction, "Release"),
    ];
}

function openCloseSteps(target: string, openInstruction: string, closeInstruction: string): ReconStepTemplate[] {
    return [
        step(`${target}_open`, "Open", openInstruction, "Open"),
        step(`${target}_close`, "Close", closeInstruction, "Close"),
    ];
}

function mission(args: {
    code: string;
    title: string;
    target: string;
    rank: MissionRank;
    category: string;
    stage: RecordingStage;
    index: number;
    analysis_mode?: MissionAnalysisMode;
    analyzer_profile?: MissionAnalyzerProfile;
    analysis_contract?: Partial<ReconStepAnalysisMetadata>;
    description?: string;
    status?: MissionStatus;
    timing?: Partial<ReconTiming>;
    protocol?: Partial<Omit<ReconMissionProtocol, "step_timing_overrides">>;
    steps?: ReconStepTemplate[];
    sub_missions?: ReconSubMissionDefinition[];
    metadata?: Record<string, unknown>;
}): ReconMissionDefinition {

    const analysisMode =
        args.analysis_mode ??
        (args.rank === "BASELINE" || args.stage === "baseline"
            ? "baseline_profile"
            : "target_correlation");

    const baselineProfile = analysisMode === "baseline_profile";
    const analyzerProfile =
        args.analyzer_profile ??
        (baselineProfile
            ? "baseline_profile"
            : "boolean_transition");
    const protocol = {
        enabled_phases:
            args.protocol?.enabled_phases?.length
                ? [...args.protocol.enabled_phases]
                : baselineProfile
                    ? (["capture"] as ReconPhaseName[])
                    : [...ALL_RECON_PHASES],
        markers:
            args.protocol?.markers !== undefined
                ? cloneMarkers(args.protocol.markers)
                : baselineProfile
                    ? []
                    : cloneMarkers(DEFAULT_TARGET_MARKERS),
    };

    return {
        id: args.code,
        mission_code: args.code,
        title: args.title,
        target: args.target,
        rank: args.rank,
        category: args.category,
        status: args.status ?? (args.rank === "S" ? "research" : "ready"),
        recording_stage: args.stage,
        recording_order: STAGE_ORDER[args.stage] + args.index,
        difficulty: MISSION_RANKS[args.rank],
        description: args.description,
        default_timing: timing(args.timing),
        protocol,
        steps: args.steps,
        sub_missions: args.sub_missions,
        analysis_mode: analysisMode,
        analyzer_profile: analyzerProfile,
        metadata: {
            source: "signal-recon",
            target: args.target,
            rank: args.rank,
            category: args.category,
            recording_stage: args.stage,
            difficulty: MISSION_RANKS[args.rank],
            default_timing: timing(args.timing),
            protocol,
            analyzer_profile: analyzerProfile,
            ...args.analysis_contract,
            ...args.metadata,

            analysis_mode: analysisMode,
            expected_target:
                analysisMode === "baseline_profile"
                    ? null
                    : args.target,

            frontend_started_at: new Date().toISOString(),
        },
    };
}

export function getMissionSteps(mission: ReconMissionDefinition): ReconStepDefinition[] {
    const subMissions: ReconSubMissionDefinition[] = mission.sub_missions?.length
        ? mission.sub_missions
        : [
            {
                sub_mission_code: "main",
                title: mission.title,
                steps: mission.steps ?? [],
            },
        ];

    let sortOrder = 0;

    return subMissions.flatMap((subMission) =>
        subMission.steps.map((template) => {
            const mergedTiming = timing({ ...mission.default_timing, ...template.timing });
            sortOrder += 1;

            return {
                id: `${mission.mission_code}:${subMission.sub_mission_code}:${template.step_code}`,
                step_code: template.step_code,
                label: template.label,
                instruction: template.instruction,
                action_text: template.action_text,
                sort_order: sortOrder,
                baseline_ms: mergedTiming.baseline_ms,
                countdown_ms: mergedTiming.countdown_ms,
                action_ms: mergedTiming.action_ms,
                capture_ms: mergedTiming.capture_ms,
                metadata: {
                    rank: mission.rank,
                    category: mission.category,
                    target: mission.target,
                    sub_mission_code: subMission.sub_mission_code,
                    sub_mission_title: subMission.title,
                    ...mission.metadata,
                    ...subMission.metadata,
                    ...template.metadata,
                },
            };
        })
    );
}

export function applyMissionProtocolToSteps(
    mission: ReconMissionDefinition,
    protocol: ReconMissionProtocol,
): ReconStepDefinition[] {
    return getMissionSteps(mission).map((step) => {
        const override = protocol.step_timing_overrides[step.id] ?? {};
        const analysisOverride =
            protocol.step_analysis_overrides[step.id] ?? {};
        return {
            ...step,
            ...override,
            metadata: {
                ...(step.metadata ?? {}),
                ...analysisOverride,
            },
        };
    });
}

export function getMissionByCode(code: string): ReconMissionDefinition | undefined {
    return RECON_MISSIONS.find((mission) => mission.mission_code === code);
}

export function getMissionsByRank(rank: MissionRank): ReconMissionDefinition[] {
    return RECON_MISSIONS.filter((mission) => mission.rank === rank);
}

export function getStepTotalMs(
    stepDef: Pick<
        ReconStepDefinition,
        "baseline_ms" | "countdown_ms" | "action_ms" | "capture_ms"
    >,
    enabledPhases: ReconPhaseName[] = ALL_RECON_PHASES,
): number {
    return enabledPhases.reduce((total, phase) => {
        if (phase === "baseline") {
            return total + (stepDef.baseline_ms ?? BASELINE_MS);
        }
        if (phase === "countdown") {
            return total + (stepDef.countdown_ms ?? COUNTDOWN_MS);
        }
        if (phase === "action") {
            return total + (stepDef.action_ms ?? ACTION_MS);
        }
        return total + (stepDef.capture_ms ?? CAPTURE_MS);
    }, 0);
}

const BASELINE_MISSIONS: ReconMissionDefinition[] = [
    mission({
        code: "BASE_OFF",
        title: "Baseline: Vehicle OFF",
        target: "baseline_off",
        rank: "BASELINE",
        category: "Baselines",
        stage: "baseline",
        index: 1,
        description: "Capture the CAN bus with the vehicle fully off before any action missions.",
        timing: { action_ms: 3000, capture_ms: 3000 },
        steps: [
            step("off_still", "OFF stillness", "Vehicle OFF. Do not touch controls.", "Hold still", {
                timing: { action_ms: 3000, capture_ms: 3000 },
            }),
        ],
    }),
    mission({
        code: "BASE_ACC",
        title: "Baseline: ACC",
        target: "baseline_acc",
        rank: "BASELINE",
        category: "Baselines",
        stage: "baseline",
        index: 2,
        description: "Capture accessory mode with no deliberate control inputs.",
        timing: { action_ms: 3000, capture_ms: 3000 },
        steps: [step("acc_still", "ACC stillness", "Set vehicle to ACC. Do not touch controls.", "Hold ACC")],
    }),
    mission({
        code: "BASE_IGNITION_ON",
        title: "Baseline: Ignition ON",
        target: "baseline_ignition_on",
        rank: "BASELINE",
        category: "Baselines",
        stage: "baseline",
        index: 3,
        description: "Capture ignition-on engine-off state.",
        timing: { action_ms: 3000, capture_ms: 3000 },
        steps: [
            step(
                "ignition_on_still",
                "Ignition ON stillness",
                "Set ignition ON with engine not running. Do not touch controls.",
                "Hold ignition ON"
            ),
        ],
    }),
    mission({
        code: "BASE_IDLE",
        title: "Baseline: Engine IDLE",
        target: "baseline_idle",
        rank: "BASELINE",
        category: "Baselines",
        stage: "baseline",
        index: 4,
        description: "Capture engine idle with no deliberate control inputs.",
        timing: { action_ms: 5000, capture_ms: 3000 },
        steps: [step("idle_still", "Idle stillness", "Engine running at idle. Do not touch controls.", "Hold idle")],
    }),
];

const A_MISSIONS: ReconMissionDefinition[] = [
    mission({
        code: "A01",
        title: "Left Turn Signal",
        target: "left_turn_signal",
        rank: "A",
        category: "Exterior lights",
        stage: "quick_wins",
        index: 1,
        steps: toggleSteps("left_turn_signal", "Move stalk to LEFT signal.", "Cancel the left signal."),
    }),
    mission({
        code: "A02",
        title: "Right Turn Signal",
        target: "right_turn_signal",
        rank: "A",
        category: "Exterior lights",
        stage: "quick_wins",
        index: 2,
        steps: toggleSteps("right_turn_signal", "Move stalk to RIGHT signal.", "Cancel the right signal."),
    }),
    mission({
        code: "A03",
        title: "Hazard Lights",
        target: "hazard_lights",
        rank: "A",
        category: "Exterior lights",
        stage: "quick_wins",
        index: 3,
        steps: toggleSteps("hazard_lights", "Press hazard button ON.", "Press hazard button OFF."),
    }),
    mission({
        code: "A04",
        title: "Headlights",
        target: "headlights",
        rank: "A",
        category: "Exterior lights",
        stage: "quick_wins",
        index: 4,
        steps: toggleSteps("headlights", "Turn headlights ON.", "Turn headlights OFF."),
    }),
    mission({
        code: "A05",
        title: "High Beams",
        target: "high_beams",
        rank: "A",
        category: "Exterior lights",
        stage: "quick_wins",
        index: 5,
        steps: pressSteps("high_beams", "Activate high beams / flash-to-pass.", "Release high beams."),
    }),
    mission({
        code: "A06",
        title: "Brake Lights",
        target: "brake_lights",
        rank: "A",
        category: "Exterior lights",
        stage: "quick_wins",
        index: 6,
        steps: pressSteps("brake_lights", "Press brake pedal enough to trigger brake lights.", "Release brake pedal."),
    }),
    mission({
        code: "A07",
        title: "Parking Brake",
        target: "parking_brake",
        rank: "A",
        category: "Driver controls",
        stage: "quick_wins",
        index: 7,
        steps: toggleSteps("parking_brake", "Engage parking brake.", "Release parking brake."),
    }),
    mission({
        code: "A08",
        title: "Driver Door Open / Close",
        target: "driver_door",
        rank: "A",
        category: "Body state",
        stage: "quick_wins",
        index: 8,
        sub_missions: [
            {
                sub_mission_code: "driver_door",
                title: "Driver door physical switch",
                steps: openCloseSteps("driver_door", "Open the driver door.", "Close the driver door."),
                metadata: { side: "driver", source: "physical_door" },
            },
        ],
    }),
    mission({
        code: "A09",
        title: "Lock",
        target: "lock",
        rank: "A",
        category: "Body state",
        stage: "quick_wins",
        index: 9,
        sub_missions: [
            {
                sub_mission_code: "lock_fob",
                title: "Lock using key fob",
                steps: [step("lock_fob_press", "Fob lock", "Press LOCK on the key fob once.", "Press fob LOCK")],
                metadata: { source: "fob" },
            },
            {
                sub_mission_code: "lock_door_switch",
                title: "Lock using door switch",
                steps: [step("lock_switch_press", "Door switch lock", "Press the interior LOCK switch once.", "Press LOCK switch")],
                metadata: { source: "door_switch" },
            },
        ],
    }),
    mission({
        code: "A10",
        title: "Unlock",
        target: "unlock",
        rank: "A",
        category: "Body state",
        stage: "quick_wins",
        index: 10,
        sub_missions: [
            {
                sub_mission_code: "unlock_fob",
                title: "Unlock using key fob",
                steps: [step("unlock_fob_press", "Fob unlock", "Press UNLOCK on the key fob once.", "Press fob UNLOCK")],
                metadata: { source: "fob" },
            },
            {
                sub_mission_code: "unlock_door_switch",
                title: "Unlock using door switch",
                steps: [step("unlock_switch_press", "Door switch unlock", "Press the interior UNLOCK switch once.", "Press UNLOCK switch")],
                metadata: { source: "door_switch" },
            },
        ],
    }),
    mission({
        code: "A11",
        title: "Seatbelt",
        target: "seatbelt",
        rank: "A",
        category: "Body state",
        stage: "quick_wins",
        index: 11,
        steps: toggleSteps("seatbelt", "Latch the driver seatbelt.", "Unlatch the driver seatbelt."),
    }),
    mission({
        code: "A12",
        title: "Reverse Gear",
        target: "reverse_gear",
        rank: "A",
        category: "Drivetrain state",
        stage: "quick_wins",
        index: 12,
        steps: toggleSteps("reverse_gear", "Shift into reverse while stationary.", "Shift back to neutral."),
        metadata: { safety: "Stationary vehicle only." },
    }),
];

const S_MISSIONS: ReconMissionDefinition[] = [
    mission({
        code: "S01",
        title: "Steering Angle",
        target: "steering_angle",
        rank: "S",
        category: "Analog driver input",
        stage: "core_driving",
        index: 1,
        analyzer_profile: "continuous_trace",
        analysis_contract: {
            expected_unit: "percent_left_right",
            expected_direction: "bidirectional",
            return_value: 0,
            field_widths: [8, 16],
            allow_signed: true,
            allow_little_endian: true,
            allow_big_endian: true,
        },
        description: "Correlate signed or centered fields across known left/right positions.",
        timing: { action_ms: 2500, capture_ms: 2500 },
        steps: [
            step("steering_center_a", "Steering centered", "Hold steering wheel centered.", "Hold center", { metadata: { expected_value: 0 } }),
            step("steering_left_half", "Steering left 50%", "Turn steering wheel about half-left and hold.", "Hold left 50%", { metadata: { expected_value: -50 } }),
            step("steering_center_b", "Return center", "Return steering wheel to center and hold.", "Return center", { metadata: { expected_value: 0 } }),
            step("steering_left_full", "Steering left 100%", "Turn steering wheel full-left and hold briefly.", "Hold left 100%", { metadata: { expected_value: -100 } }),
            step("steering_center_c", "Return center", "Return steering wheel to center and hold.", "Return center", { metadata: { expected_value: 0 } }),
            step("steering_right_half", "Steering right 50%", "Turn steering wheel about half-right and hold.", "Hold right 50%", { metadata: { expected_value: 50 } }),
            step("steering_center_d", "Return center", "Return steering wheel to center and hold.", "Return center", { metadata: { expected_value: 0 } }),
            step("steering_right_full", "Steering right 100%", "Turn steering wheel full-right and hold briefly.", "Hold right 100%", { metadata: { expected_value: 100 } }),
            step("steering_center_e", "Return center", "Return steering wheel to center and hold.", "Return center", { metadata: { expected_value: 0 } }),
        ],
    }),
    mission({
        code: "S02",
        title: "Accelerator Pedal Position",
        target: "accelerator_pedal_position",
        rank: "S",
        category: "Analog driver input",
        stage: "core_driving",
        index: 2,
        analyzer_profile: "ordinal_level",
        analysis_contract: {
            expected_unit: "percent",
            expected_direction: "increase",
            return_value: 0,
            field_widths: [8, 16],
            allow_signed: false,
            allow_little_endian: true,
            allow_big_endian: true,
        },
        description: "Find one exact field that rises monotonically across 0/25/50/70% holds and returns to zero.",
        timing: { action_ms: 2500, capture_ms: 1800 },
        metadata: { safety: "Stationary, neutral/parked capture unless intentionally testing driving data." },
        steps: [
            step("accel_0_a", "Pedal 0%", "Hold accelerator fully released.", "Hold 0%", { metadata: { expected_value: 0 } }),
            step("accel_25", "Accelerator 25%", "Press accelerator to about 25% and hold.", "Hold 25%", { metadata: { expected_value: 25 } }),
            step("accel_0_b", "Return 0%", "Release accelerator completely and hold.", "Return 0%", { metadata: { expected_value: 0 } }),
            step("accel_50", "Accelerator 50%", "Press accelerator to about 50% and hold.", "Hold 50%", { metadata: { expected_value: 50 } }),
            step("accel_0_c", "Return 0%", "Release accelerator completely and hold.", "Return 0%", { metadata: { expected_value: 0 } }),
            step("accel_70", "Accelerator 70%", "Press accelerator to about 70% and hold.", "Hold 70%", { metadata: { expected_value: 70 } }),
            step("accel_0_d", "Return 0%", "Release accelerator completely and hold.", "Return 0%", { metadata: { expected_value: 0 } }),
        ],
    }),
    mission({
        code: "S03",
        title: "Brake Pedal Pressure / Brake Switch",
        target: "brake_pedal",
        rank: "S",
        category: "Analog/switch driver input",
        stage: "core_driving",
        index: 3,
        analyzer_profile: "ordinal_level",
        analysis_contract: {
            expected_unit: "percent_effort",
            expected_direction: "increase",
            return_value: 0,
            field_widths: [8, 16],
            allow_signed: false,
            allow_little_endian: true,
            allow_big_endian: true,
        },
        description: "Search for both an exact brake-switch bit and a pressure/position proxy field.",
        steps: [
            step("brake_0_a", "Brake 0%", "Hold brake pedal fully released.", "Hold 0%", { metadata: { expected_value: 0 } }),
            step("brake_25", "Brake 25%", "Press brake lightly and hold.", "Hold 25%", { metadata: { expected_value: 25 } }),
            step("brake_0_b", "Return 0%", "Release brake completely and hold.", "Return 0%", { metadata: { expected_value: 0 } }),
            step("brake_50", "Brake 50%", "Press brake to medium effort and hold.", "Hold 50%", { metadata: { expected_value: 50 } }),
            step("brake_0_c", "Return 0%", "Release brake completely and hold.", "Return 0%", { metadata: { expected_value: 0 } }),
            step("brake_70", "Brake 70%", "Press brake firmly to about 70% effort and hold.", "Hold 70%", { metadata: { expected_value: 70 } }),
            step("brake_0_d", "Return 0%", "Release brake completely and hold.", "Return 0%", { metadata: { expected_value: 0 } }),
        ],
    }),
    mission({
        code: "S04",
        title: "Engine RPM",
        target: "engine_rpm",
        rank: "S",
        category: "Powertrain",
        stage: "core_driving",
        index: 4,
        analyzer_profile: "ordinal_level",
        analysis_contract: {
            expected_unit: "rpm",
            expected_direction: "increase",
            return_value: 800,
            field_widths: [8, 16, 24],
            allow_signed: false,
            allow_little_endian: true,
            allow_big_endian: true,
        },
        timing: { action_ms: 3000, capture_ms: 2500 },
        steps: [
            step("rpm_idle_a", "Idle RPM", "Hold engine at stable idle.", "Hold idle", { metadata: { expected_value: 800 } }),
            step("rpm_1500", "1500 RPM", "Raise engine speed to about 1500 RPM and hold.", "Hold 1500 RPM", { metadata: { expected_value: 1500 } }),
            step("rpm_idle_b", "Return idle", "Release accelerator and return to stable idle.", "Return idle", { metadata: { expected_value: 800 } }),
            step("rpm_2500", "2500 RPM", "Raise engine speed to about 2500 RPM and hold.", "Hold 2500 RPM", { metadata: { expected_value: 2500 } }),
            step("rpm_idle_c", "Return idle", "Release accelerator and return to stable idle.", "Return idle", { metadata: { expected_value: 800 } }),
        ],
        metadata: { safety: "Use neutral and avoid extended high-RPM holds." },
    }),
    mission({
        code: "S05",
        title: "Vehicle Speed",
        target: "vehicle_speed",
        rank: "S",
        category: "Motion state",
        stage: "core_driving",
        index: 5,
        analyzer_profile: "ordinal_level",
        analysis_contract: {
            expected_unit: "mph",
            expected_direction: "increase",
            return_value: 0,
            field_widths: [8, 16, 24],
            allow_signed: false,
            allow_little_endian: true,
            allow_big_endian: true,
        },
        timing: { action_ms: 4000, capture_ms: 3000 },
        steps: [
            step("speed_0_a", "Stationary", "Hold vehicle completely stopped.", "Hold 0 mph", { metadata: { expected_value: 0 } }),
            step("speed_5", "About 5 mph", "Hold approximately 5 mph in a safe controlled area.", "Hold 5 mph", { metadata: { expected_value: 5 } }),
            step("speed_0_b", "Stop", "Bring vehicle to a complete stop and hold.", "Return 0 mph", { metadata: { expected_value: 0 } }),
            step("speed_10", "About 10 mph", "Hold approximately 10 mph in a safe controlled area.", "Hold 10 mph", { metadata: { expected_value: 10 } }),
            step("speed_0_c", "Stop", "Bring vehicle to a complete stop and hold.", "Return 0 mph", { metadata: { expected_value: 0 } }),
        ],
        metadata: { safety: "Controlled area only; do not perform on public roads while operating the UI." },
    }),
    mission({
        code: "S06",
        title: "Gear Position",
        target: "gear_position",
        rank: "S",
        category: "Drivetrain state",
        stage: "core_driving",
        index: 6,
        analyzer_profile: "enum_state",
        analysis_contract: {
            expected_unit: "gear_code",
            expected_direction: "categorical",
            return_value: 0,
            field_widths: [8, 16],
            allow_signed: true,
            allow_little_endian: true,
            allow_big_endian: true,
        },
        steps: [
            step("gear_neutral_a", "Neutral", "Shift to neutral and hold.", "Hold neutral", { metadata: { expected_value: 0 } }),
            step("gear_reverse", "Reverse", "Shift to reverse while stationary and hold.", "Hold reverse", { metadata: { expected_value: -1 } }),
            step("gear_neutral_b", "Return neutral", "Return shifter to neutral.", "Return neutral", { metadata: { expected_value: 0 } }),
            step("gear_first", "First gear", "Shift to first gear while stationary and hold clutch as needed.", "Hold first", { metadata: { expected_value: 1 } }),
            step("gear_neutral_c", "Return neutral", "Return shifter to neutral.", "Return neutral", { metadata: { expected_value: 0 } }),
            step("gear_second", "Second gear", "Shift to second gear while stationary and hold clutch as needed.", "Hold second", { metadata: { expected_value: 2 } }),
            step("gear_neutral_d", "Return neutral", "Return shifter to neutral.", "Return neutral", { metadata: { expected_value: 0 } }),
        ],
        metadata: { transmission: "manual", safety: "Stationary capture; clutch as needed." },
    }),
    mission({
        code: "S07",
        title: "Clutch Pedal",
        target: "clutch_pedal",
        rank: "S",
        category: "Driver input",
        stage: "core_driving",
        index: 7,
        steps: [
            step("clutch_released", "Clutch released", "Hold clutch pedal released.", "Hold released"),
            step("clutch_pressed", "Clutch pressed", "Press clutch pedal fully and hold.", "Press clutch"),
            step("clutch_release", "Clutch release", "Release clutch pedal smoothly.", "Release clutch"),
        ],
        metadata: { transmission: "manual" },
    }),
    mission({
        code: "S08",
        title: "Yaw / Stability / Traction Events",
        target: "yaw_stability_traction",
        rank: "S",
        category: "Vehicle dynamics",
        stage: "core_driving",
        index: 8,
        timing: { action_ms: 4500, capture_ms: 3000 },
        steps: [
            step("yaw_still", "Still yaw baseline", "Hold vehicle stationary.", "Hold still"),
            step("yaw_left_turn", "Low-speed left turn", "Drive a gentle low-speed left turn in a controlled area.", "Gentle left turn"),
            step("yaw_right_turn", "Low-speed right turn", "Drive a gentle low-speed right turn in a controlled area.", "Gentle right turn"),
            step("traction_toggle", "Traction control toggle", "Press traction/stability control button once, if safe and available.", "Toggle traction", {
                timing: { action_ms: 1800, capture_ms: 2500 },
            }),
        ],
        metadata: { safety: "Do not intentionally lose control; controlled low-speed tests only." },
    }),
    mission({
        code: "S09",
        title: "ABS / Wheel Speed Signals",
        target: "abs_wheel_speed",
        rank: "S",
        category: "Vehicle dynamics",
        stage: "core_driving",
        index: 9,
        timing: { action_ms: 4500, capture_ms: 3000 },
        sub_missions: [
            {
                sub_mission_code: "wheel_speed_roll",
                title: "Wheel speed while rolling",
                steps: [
                    step("wheel_speed_stationary", "Stationary", "Hold vehicle stopped.", "Hold stopped"),
                    step("wheel_speed_roll", "Steady low roll", "Roll at a steady low speed in a controlled area.", "Hold low roll"),
                    step("wheel_speed_stop", "Stop", "Bring vehicle to a complete stop.", "Stop"),
                ],
                metadata: { source: "wheel_speed" },
            },
            {
                sub_mission_code: "abs_event_optional",
                title: "Optional ABS event",
                steps: [
                    step("abs_controlled_brake", "Controlled firm brake", "Only on a safe closed course, perform a controlled firm brake event.", "Firm brake", {
                        timing: { action_ms: 2500, capture_ms: 3500 },
                    }),
                ],
                metadata: { optional: true, source: "abs", safety: "Closed course only." },
            },
        ],
    }),
    mission({
        code: "S10",
        title: "Engine Start / Ignition State",
        target: "engine_start_ignition_state",
        rank: "S",
        category: "Power state",
        stage: "core_driving",
        index: 10,
        timing: { action_ms: 3000, capture_ms: 3000 },
        steps: [
            step("ignition_off", "Ignition OFF", "Hold ignition OFF.", "Hold OFF"),
            step("ignition_acc", "ACC", "Switch to ACC.", "ACC"),
            step("ignition_on", "Ignition ON", "Switch to ignition ON without starting engine.", "Ignition ON"),
            step("engine_start", "Engine start", "Start the engine.", "Start engine", { timing: { action_ms: 4000, capture_ms: 3500 } }),
            step("engine_stop", "Engine stop", "Turn engine OFF.", "Stop engine"),
        ],
    }),
];

const B_MISSIONS: ReconMissionDefinition[] = [
    mission({ code: "B01", title: "Wipers Low", target: "wipers_low", rank: "B", category: "Body controls", stage: "body_controls", index: 1, steps: toggleSteps("wipers_low", "Set wipers to LOW.", "Turn wipers OFF.") }),
    mission({ code: "B02", title: "Wipers High", target: "wipers_high", rank: "B", category: "Body controls", stage: "body_controls", index: 2, steps: toggleSteps("wipers_high", "Set wipers to HIGH.", "Turn wipers OFF.") }),
    mission({ code: "B03", title: "Washer Spray", target: "washer_spray", rank: "B", category: "Body controls", stage: "body_controls", index: 3, steps: pressSteps("washer_spray", "Pull/press washer spray.", "Release washer control.") }),
    mission({ code: "B04", title: "Horn", target: "horn", rank: "B", category: "Body controls", stage: "body_controls", index: 4, steps: pressSteps("horn", "Tap horn once.", "Release horn."), timing: { action_ms: 900, capture_ms: 2000 } }),
    mission({ code: "B05", title: "Trunk Open", target: "trunk_open", rank: "B", category: "Body state", stage: "body_controls", index: 5, steps: openCloseSteps("trunk", "Open trunk.", "Close trunk.") }),
    mission({
        code: "B06",
        title: "Passenger Door",
        target: "passenger_door",
        rank: "B",
        category: "Body state",
        stage: "body_controls",
        index: 6,
        sub_missions: [
            {
                sub_mission_code: "passenger_door",
                title: "Passenger door physical switch",
                steps: openCloseSteps("passenger_door", "Open passenger door.", "Close passenger door."),
                metadata: { side: "passenger", source: "physical_door" },
            },
        ],
    }),
    mission({ code: "B07", title: "Window Driver Up", target: "window_driver_up", rank: "B", category: "Windows", stage: "body_controls", index: 7, steps: pressSteps("window_driver_up", "Hold driver window UP switch.", "Release driver window switch."), timing: { action_ms: 2500, capture_ms: 2000 } }),
    mission({ code: "B08", title: "Window Driver Down", target: "window_driver_down", rank: "B", category: "Windows", stage: "body_controls", index: 8, steps: pressSteps("window_driver_down", "Hold driver window DOWN switch.", "Release driver window switch."), timing: { action_ms: 2500, capture_ms: 2000 } }),
    mission({ code: "B09", title: "Window Passenger Up", target: "window_passenger_up", rank: "B", category: "Windows", stage: "body_controls", index: 9, steps: pressSteps("window_passenger_up", "Hold passenger window UP switch.", "Release passenger window switch."), timing: { action_ms: 2500, capture_ms: 2000 } }),
    mission({ code: "B10", title: "Window Passenger Down", target: "window_passenger_down", rank: "B", category: "Windows", stage: "body_controls", index: 10, steps: pressSteps("window_passenger_down", "Hold passenger window DOWN switch.", "Release passenger window switch."), timing: { action_ms: 2500, capture_ms: 2000 } }),
    mission({ code: "B11", title: "Cruise On", target: "cruise_on", rank: "B", category: "Driver controls", stage: "body_controls", index: 11, steps: toggleSteps("cruise_on", "Turn cruise control ON.", "Turn cruise control OFF.") }),
    mission({ code: "B12", title: "Cruise Set / Cancel", target: "cruise_set_cancel", rank: "B", category: "Driver controls", stage: "body_controls", index: 12, steps: [step("cruise_set", "Cruise set", "Press cruise SET.", "Press SET"), step("cruise_cancel", "Cruise cancel", "Press cruise CANCEL.", "Press CANCEL")] }),
];

const C_MISSIONS: ReconMissionDefinition[] = [
    mission({ code: "C01", title: "Fan Speed", target: "fan_speed", rank: "C", category: "HVAC", stage: "misc", index: 1, steps: [step("fan_off", "Fan OFF", "Set fan speed OFF/0.", "Fan OFF"), step("fan_1", "Fan 1", "Set fan speed 1.", "Fan 1"), step("fan_2", "Fan 2", "Set fan speed 2.", "Fan 2"), step("fan_3", "Fan 3", "Set fan speed 3.", "Fan 3")] }),
    mission({ code: "C02", title: "A/C Button", target: "ac_button", rank: "C", category: "HVAC", stage: "misc", index: 2, steps: toggleSteps("ac_button", "Press A/C ON.", "Press A/C OFF.") }),
    mission({ code: "C03", title: "Defrost", target: "defrost", rank: "C", category: "HVAC", stage: "misc", index: 3, steps: toggleSteps("defrost", "Turn defrost ON.", "Turn defrost OFF.") }),
    mission({ code: "C04", title: "Recirculation", target: "recirculation", rank: "C", category: "HVAC", stage: "misc", index: 4, steps: toggleSteps("recirculation", "Turn recirculation ON.", "Turn recirculation OFF.") }),
    mission({ code: "C05", title: "Temperature Knob", target: "temperature_knob", rank: "C", category: "HVAC", stage: "misc", index: 5, timing: { action_ms: 2500, capture_ms: 2000 }, steps: [step("temp_cold", "Cold", "Turn temperature knob full cold.", "Full cold"), step("temp_mid", "Middle", "Turn temperature knob to middle.", "Middle"), step("temp_hot", "Hot", "Turn temperature knob full hot.", "Full hot")] }),
    mission({ code: "C06", title: "Radio Volume Up", target: "radio_volume_up", rank: "C", category: "Infotainment", stage: "misc", index: 6, steps: pressSteps("radio_volume_up", "Press volume UP once.", "Release volume UP.") }),
    mission({ code: "C07", title: "Radio Volume Down", target: "radio_volume_down", rank: "C", category: "Infotainment", stage: "misc", index: 7, steps: pressSteps("radio_volume_down", "Press volume DOWN once.", "Release volume DOWN.") }),
    mission({ code: "C08", title: "Steering Wheel Buttons", target: "steering_wheel_buttons", rank: "C", category: "Infotainment", stage: "misc", index: 8, sub_missions: [{ sub_mission_code: "wheel_buttons", title: "Common steering buttons", steps: [step("wheel_button_mode", "Mode", "Press steering wheel MODE button.", "Press MODE"), step("wheel_button_next", "Next", "Press steering wheel NEXT/TRACK button.", "Press NEXT"), step("wheel_button_back", "Back", "Press steering wheel BACK/TRACK button.", "Press BACK")], metadata: { source: "steering_wheel" } }] }),
    mission({ code: "C09", title: "Dome Light", target: "dome_light", rank: "C", category: "Interior lights", stage: "misc", index: 9, steps: toggleSteps("dome_light", "Turn dome light ON.", "Turn dome light OFF.") }),
    mission({ code: "C10", title: "Mirror Controls", target: "mirror_controls", rank: "C", category: "Body controls", stage: "misc", index: 10, sub_missions: [{ sub_mission_code: "driver_mirror", title: "Driver mirror directional control", steps: [step("mirror_left", "Mirror left", "Move mirror control LEFT briefly.", "Mirror left"), step("mirror_right", "Mirror right", "Move mirror control RIGHT briefly.", "Mirror right"), step("mirror_up", "Mirror up", "Move mirror control UP briefly.", "Mirror up"), step("mirror_down", "Mirror down", "Move mirror control DOWN briefly.", "Mirror down")], metadata: { side: "driver" } }] }),
];

export const RECON_MISSIONS: ReconMissionDefinition[] = [
    ...BASELINE_MISSIONS,
    ...A_MISSIONS,
    ...S_MISSIONS,
    ...B_MISSIONS,
    ...C_MISSIONS,
].sort((a, b) => a.recording_order - b.recording_order);
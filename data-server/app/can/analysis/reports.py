"""Analysis / reports: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .memory import (
    compact_byte_evidence,
    compact_byte_roles,
    compact_candidate_payload,
    compact_signal_hypothesis,
    vector_memory_prompt_text,
)
from .shared import (
    ANALYSIS_MODE_BASELINE,
    Any,
    Candidate,
    Counter,
    FrameRow,
    LLM_BYTE_EVIDENCE_LIMIT,
    LLM_CANDIDATE_LIMIT,
    Optional,
    UUID,
)
from .utilities import (
    is_baseline_mode,
    select_analysis_markers,
)

def build_baseline_profile(frames: list[FrameRow], candidates: list[Candidate]) -> dict[str, Any]:
    observed_ids = len({frame.can_id for frame in frames})
    total_frames = len(frames)
    high_rate_ids = [
        compact_candidate_payload(
            candidate,
            include_byte_evidence=False,
        )
        for candidate in candidates
        if candidate.frequency_hz is not None
        and candidate.frequency_hz >= 20
    ][:15]
    noisy_ids = [
        compact_candidate_payload(
            candidate,
            include_byte_evidence=False,
        )
        for candidate in candidates
        if candidate.change_count > 0
    ][:15]
    stable_ids = [
        compact_candidate_payload(
            candidate,
            include_byte_evidence=False,
        )
        for candidate in candidates
        if candidate.change_count == 0
    ][:15]

    role_counts = Counter(
        hypothesis.hypothesis_kind
        for candidate in candidates
        for hypothesis in candidate.byte_role_hypotheses
    )

    return {
        "kind": ANALYSIS_MODE_BASELINE,
        "target_expected": False,
        "total_frames": total_frames,
        "observed_ids": observed_ids,
        "byte_role_counts": dict(role_counts),
        "high_rate_ids": high_rate_ids,
        "noisy_ids": noisy_ids,
        "stable_ids": stable_ids,
        "guidance": (
            "This is a passive/noise profile. Use these IDs as background traffic "
            "when scoring later action missions. Do not treat the highest-ranked ID "
            "as a decoded target signal."
        ),
    }


def build_fallback_report(
    session_id: UUID,
    analysis_mode: str,
    frames_count: int,
    markers_count: int,
    candidates: list[Candidate],
    baseline_profile: Optional[dict[str, Any]],
    baseline_context: Optional[dict[str, Any]] = None,
    ml_context: Optional[dict[str, Any]] = None,
    vector_context: Optional[dict[str, Any]] = None,
) -> str:
    if is_baseline_mode(analysis_mode):
        profile = baseline_profile or {}
        background_lines = [
            (
                f"- {candidate.can_id_hex}: role={candidate.candidate_role}, "
                f"frames={candidate.frame_count}, hz={candidate.frequency_hz}, "
                f"changes={candidate.change_count}, "
                f"change_ratio={candidate.change_ratio}, "
                f"bytes={candidate.byte_change_counts}, roles={compact_byte_roles(candidate)}"
            )
            for candidate in candidates[:5]
        ] or ["- No CAN IDs were available for baseline analysis."]

        byte_lines = [
            f"- {candidate.can_id_hex}: {compact_byte_evidence(candidate)}"
            for candidate in candidates[:3]
        ] or ["- No changing-byte evidence was available."]

        return "\n".join(
            [
                "# 1. Executive Summary",
                "",
                (
                    f"Statistical baseline analysis completed for session {session_id}. "
                    f"It analyzed {frames_count} frames, {markers_count} markers, and "
                    f"observed {profile.get('observed_ids', 0)} CAN IDs. This is a "
                    "noise profile, not a decoded target signal."
                ),
                "",
                "# 2. Baseline Traffic Profile",
                *background_lines,
                "",
                "# 3. Byte-Level Baseline Evidence",
                *byte_lines,
                "",
                "# 4. Warnings and Uncertainty",
                "- No LLM interpretation was available; this is a deterministic fallback report.",
                "- High-rate or high-change IDs may be normal background traffic.",
                "- Baseline observations should be matched to the same vehicle and operating state.",
                "",
                "# 5. Recommendations and Next Mission",
                "1. Preserve this baseline as a negative-control profile.",
                "2. Repeat the same baseline state to measure natural variability.",
                "3. Compare the next action mission against these naturally active IDs and bytes.",
                "Recommended next mission: record one repeated target action with at least four repetitions and idle recovery between actions.",
            ]
        )

    baseline_context = baseline_context or {}
    ml_context = ml_context or {}
    vector_context = vector_context or {}
    vector_match_count = int(vector_context.get("match_count") or 0)
    ml_model_text = (
        str(ml_context.get("model_id"))
        if ml_context.get("applied")
        else "none"
    )
    baseline_session_text = (
        str(baseline_context.get("session_id"))
        if baseline_context.get("applied")
        else "none"
    )

    candidate_lines = [
        (
            f"- {candidate.can_id_hex}: confidence={candidate.confidence}, "
            f"pre_baseline_confidence={candidate.confidence_before_baseline}, "
            f"baseline_overlap={candidate.baseline_overlap_score}, "
            f"baseline_penalty={candidate.baseline_penalty}, "
            f"baseline_adjusted_change_ratio={candidate.baseline_adjusted_change_ratio}, "
            f"ml_probability={candidate.ml_probability}, "
            f"pre_ml_confidence={candidate.confidence_before_ml}, "
            f"adjusted_correlation={candidate.correlation_score}, "
            f"raw_marker_fraction={candidate.raw_marker_fraction}, "
            f"window_coverage={candidate.marker_window_coverage}, "
            f"changes={candidate.change_count}, "
            f"change_ratio={candidate.change_ratio}, "
            f"markers={candidate.likely_marker_types}"
        )
        for candidate in candidates[:5]
    ] or ["- No candidate CAN IDs were found."]

    byte_lines = [
        f"- {candidate.can_id_hex}: {compact_byte_evidence(candidate)}"
        for candidate in candidates[:3]
    ] or ["- No changing-byte evidence was available."]

    return "\n".join(
        [
            "# 1. Executive Summary",
            "",
            (
                f"Statistical target-correlation analysis completed for session {session_id}. "
                f"It analyzed {frames_count} frames and {markers_count} markers. "
                "The following results are hypotheses, not confirmed decodes. "
                f"Matched baseline session: {baseline_session_text}. "
                f"Supervised model: {ml_model_text}."
            ),
            "",
            "# 2. Top CAN ID Hypotheses",
            *candidate_lines,
            "",
            "# 3. Byte-Level Evidence",
            *byte_lines,
            "",
            "# 4. Warnings and Uncertainty",
            "- No LLM interpretation was available; this is a deterministic fallback report.",
            "- Correlation is adjusted for the percentage of the timeline covered by marker windows.",
            "- Even adjusted marker correlation does not prove that an ID owns the intended signal.",
            (
                f"- Matched baseline session {baseline_session_text} was used with normalized per-byte subtraction."
                if baseline_context.get("applied")
                else "- No compatible analyzed baseline was available."
            ),
            "- Baseline subtraction reduces false positives but does not prove signal ownership.",
            (
                f"- Scoped vector memory retrieved {vector_match_count} similar prior sessions; "
                "those matches did not alter numerical confidence."
                if vector_context.get("requested")
                else "- Vector memory was not requested for this analysis."
            ),
            (
                f"- Supervised model {ml_model_text} was applied using explicit human labels."
                if ml_context.get("applied")
                else "- No supervised model was applied; ranking remains statistical and rule-based."
            ),
            "",
            "# 5. Recommendations and Next Mission",
            "1. Repeat the target action at least four times and verify the same byte transition each time.",
            "2. Record an equal-duration no-action control and reject candidates that behave similarly there.",
            "3. Verify that the candidate returns to its pre-action value after deactivation.",
            "Recommended next mission: 2-second baseline, four action repetitions, 1.8-second action windows, 1.5-second capture windows, and 2-second idle recovery between repetitions.",
        ]
    )


def compact_heatmap_payload(
    candidates: list[Candidate],
) -> dict[str, dict[str, Any]]:
    """Return visualization data without duplicating full byte evidence."""
    return {
        candidate.can_id_hex: {
            "can_id": candidate.can_id,
            "analysis_mode": candidate.analysis_mode,
            "candidate_role": candidate.candidate_role,
            "byte_change_counts": candidate.byte_change_counts,
            "byte_entropy": candidate.byte_entropy,
            "change_count": candidate.change_count,
            "change_ratio": candidate.change_ratio,
            "changed_frame_count": candidate.changed_frame_count,
            "changed_frame_ratio": candidate.changed_frame_ratio,
            "frame_count": candidate.frame_count,
            "frequency_hz": candidate.frequency_hz,
            "baseline_score": candidate.baseline_score,
            "byte_transition_score": candidate.byte_transition_score,
            "byte_transition_evidence": candidate.byte_transition_evidence,
            "raw_marker_fraction": candidate.raw_marker_fraction,
            "marker_window_coverage": candidate.marker_window_coverage,
            "correlation_lift": candidate.correlation_lift,
            "correlation_score": candidate.correlation_score,
            "confidence": candidate.confidence,
            "baseline_applied": candidate.baseline_applied,
            "baseline_session_id": candidate.baseline_session_id,
            "baseline_id_present": candidate.baseline_id_present,
            "baseline_overlap_score": candidate.baseline_overlap_score,
            "baseline_penalty": candidate.baseline_penalty,
            "baseline_adjusted_change_ratio": (
                candidate.baseline_adjusted_change_ratio
            ),
            "confidence_before_baseline": (
                candidate.confidence_before_baseline
            ),
            "ml_applied": candidate.ml_applied,
            "ml_model_id": candidate.ml_model_id,
            "ml_probability": candidate.ml_probability,
            "ml_blend_weight": candidate.ml_blend_weight,
            "confidence_before_ml": candidate.confidence_before_ml,
        }
        for candidate in candidates
    }


def build_llm_prompt(
    session: dict[str, Any],
    markers: list[dict[str, Any]],
    candidates: list[Candidate],
    analysis_mode: str,
    baseline_profile: Optional[dict[str, Any]] = None,
    baseline_context: Optional[dict[str, Any]] = None,
    ml_context: Optional[dict[str, Any]] = None,
    vector_context: Optional[dict[str, Any]] = None,
) -> str:
    selected_action_markers, prompt_marker_context = select_analysis_markers(
        markers,
        baseline_mode=is_baseline_mode(analysis_mode),
    )
    selected_ids = {
        str(marker.get("id"))
        for marker in selected_action_markers
        if marker.get("id") is not None
    }
    control_markers = [
        marker
        for marker in markers
        if str(marker.get("id")) not in selected_ids
    ]

    action_marker_lines = "\n".join(
        (
            f"- {marker.get('timestamp_ms')}ms "
            f"{marker.get('marker_type')} "
            f"{marker.get('step_code') or ''}: "
            f"{marker.get('label') or ''}"
        )
        for marker in selected_action_markers[:40]
    ) or "- no explicit action markers"

    control_marker_lines = "\n".join(
        (
            f"- {marker.get('timestamp_ms')}ms "
            f"{marker.get('marker_type')} "
            f"{marker.get('step_code') or ''}: "
            f"{marker.get('label') or ''}"
        )
        for marker in control_markers[:40]
    ) or "- no structural/control markers"

    baseline_context = baseline_context or {}
    ml_context = ml_context or {}
    vector_context = vector_context or {
        "requested": False,
        "retrieved": False,
        "reason": "Vector memory was not requested.",
        "matches": [],
    }
    historical_memory = vector_memory_prompt_text(vector_context)

    if ml_context.get("applied"):
        ml_summary = (
            f"model={ml_context.get('model_id')}, "
            f"scope={ml_context.get('mission_code') or 'vehicle-wide'}, "
            f"labels={ml_context.get('label_count')}, "
            f"blend_weight={ml_context.get('blend_weight')}"
        )
    else:
        ml_summary = (
            "not applied; "
            f"reason={ml_context.get('reason') or 'not requested'}"
        )

    if baseline_context.get("applied"):
        baseline_summary = (
            f"session={baseline_context.get('session_id')}, "
            f"mission={baseline_context.get('mission_code') or baseline_context.get('label')}, "
            f"features={baseline_context.get('feature_count')}, "
            f"penalty_weight={baseline_context.get('penalty_weight')}"
        )
    else:
        baseline_summary = (
            "not applied; "
            f"reason={baseline_context.get('reason') or 'not requested'}"
        )

    if is_baseline_mode(analysis_mode):
        candidate_heading = "Background / noise-profile CAN IDs"
        candidate_lines = "\n".join(
            (
                f"- {c.can_id_hex}: role={c.candidate_role}, frames={c.frame_count}, "
                f"hz={c.frequency_hz}, changes={c.change_count}, entropy={c.entropy:.3f}, "
                f"baseline_score={c.baseline_score:.3f}, change_ratio={c.change_ratio:.5f}, "
                f"byte_changes={c.byte_change_counts}, byte_entropy={c.byte_entropy}, "
                f"byte_roles=[{compact_byte_roles(c)}], "
                f"byte_evidence=[{compact_byte_evidence(c, limit=LLM_BYTE_EVIDENCE_LIMIT)}]"
            )
            for c in candidates[:LLM_CANDIDATE_LIMIT]
        ) or "- no background IDs"

        profile = baseline_profile or {}

        mode_instructions = f"""
        This is a PASSIVE BASELINE / NOISE-SNIFFING mission.
        There is no intended target action and no expected CAN ID to decode.
        Do not say any ID is "the right ID" for a command.
        Do not present confidence as a probability of a target signal.
        Instead, summarize background traffic for this vehicle state:
        - observed_ids: {profile.get('observed_ids')}
        - total_frames: {profile.get('total_frames')}
        - high-rate periodic IDs
        - naturally noisy bytes
        - stable IDs
        - which IDs should be filtered or down-weighted during future action missions.
        """

        response_structure = """
        Return exactly these five numbered sections.

        1. Executive Summary
        - Maximum 100 words.
        - State that this is a baseline/noise profile, not a decoded target.

        2. Baseline Traffic Profile
        - Include no more than five CAN IDs.
        - Use a compact table with:
          CAN ID | background role | frequency | strongest changing bytes | why it matters

        3. Byte-Level Baseline Evidence
        - Discuss only the top three background IDs.
        - Identify stable, periodic, and naturally noisy bytes from the supplied evidence.
        - Do not invent encodings.

        4. Warnings and Uncertainty
        - Maximum five bullets.
        - Explain that baseline activity can cause false positives in later target missions.

        5. Recommendations and Next Mission
        - This section is mandatory.
        - Include exactly three practical recommendations.
        - End with one target-action mission that should be recorded next.
        - If the output budget is low, shorten sections 2 and 3, but always produce section 5.
        """
    else:
        candidate_heading = "Ranked exact signal hypotheses grouped by CAN ID"
        candidate_lines = "\n".join(
            (
                f"- {c.can_id_hex}: frames={c.frame_count}, hz={c.frequency_hz}, "
                f"changes={c.change_count}, entropy={c.entropy:.3f}, "
                f"score={c.correlation_score:.3f}, confidence={c.confidence:.3f}, "
                f"raw_marker_fraction={c.raw_marker_fraction:.3f}, "
                f"marker_window_coverage={c.marker_window_coverage:.3f}, "
                f"correlation_lift={c.correlation_lift:.3f}, "
                f"change_ratio={c.change_ratio:.5f}, changed_frames={c.changed_frame_count}, "
                f"byte_changes={c.byte_change_counts}, byte_entropy={c.byte_entropy}, "
                f"markers={c.likely_marker_types}, "
                f"baseline_present={c.baseline_id_present}, "
                f"baseline_overlap={c.baseline_overlap_score:.3f}, "
                f"baseline_penalty={c.baseline_penalty:.3f}, "
                f"baseline_adjusted_change_ratio={c.baseline_adjusted_change_ratio:.5f}, "
                f"confidence_before_baseline={c.confidence_before_baseline:.3f}, "
                f"byte_transition_score={c.byte_transition_score:.3f}, "
                f"byte_transition_evidence={c.byte_transition_evidence}, "
                f"label_prior={c.label_prior}, "
                f"ml_probability={c.ml_probability}, "
                f"confidence_before_ml={c.confidence_before_ml:.3f}, "
                f"historical_support={c.historical_support}, "
                f"quick_id_method={c.quick_id_method}, "
                f"top_signal=[{compact_signal_hypothesis(c)}], "
                f"byte_roles=[{compact_byte_roles(c)}], "
                f"byte_evidence=[{compact_byte_evidence(c, limit=LLM_BYTE_EVIDENCE_LIMIT)}]"
            )
            for c in candidates[:LLM_CANDIDATE_LIMIT]
        ) or "- no candidates"

        mode_instructions = """
        This is a TARGET CORRELATION mission.
        For opposing ON/OFF actions, rank the exact CAN ID + byte + bit location,
        not the total number of changes in the CAN ID. A clean hypothesis should
        transition at the same location for ON and OFF, show inverse states, and
        have few or no flips outside action windows. Aggregate ID changes are
        diagnostic only and must not outweigh exact-location evidence.
        If the best role is byte_transition_candidate, describe it as byte-level
        evidence only. Do not call it ON/OFF unless a bit_signal_hypothesis
        isolates the bit. Nibble sequences such as 0..F or F..0 are usually
        counters or encoded fields, not direct human action bits.
        Confidence is a research score, not proof.
        When a matched baseline is available, interpret baseline_overlap as the
        fraction of target byte activity already present in the control session.
        Interpret baseline_adjusted_change_ratio as activity remaining after
        normalized per-byte subtraction.
        When ml_probability is present, treat it as a classifier estimate
        learned only from explicit human labels. It is supporting evidence,
        not proof.
        """

        response_structure = """
        Return exactly these five numbered sections.

        1. Executive Summary
        - Maximum 120 words.
        - State whether evidence is strong, moderate, weak, or insufficient.
        - Name no more than three leading CAN IDs.

        2. Top CAN ID Hypotheses
        - Include no more than five candidates.
        - Use a compact table with:
          CAN ID | suspected role | strongest byte | observed evidence | confidence | false-positive risk

        3. Byte-Level Evidence
        - Discuss only the top three candidates.
        - Distinguish observed values and transitions from interpretation.
        - Do not invent byte values, bit positions, scale, offset, or endianness.

        4. Warnings and Uncertainty
        - Maximum five bullets.
        - Mention missing controls, baseline noise, marker ambiguity, and insufficient repetition when applicable.

        5. Recommendations and Next Mission
        - This section is mandatory.
        - Include exactly three validation experiments.
        - End with one recommended mission containing:
          action, repetitions, baseline duration, action duration, capture duration, and expected evidence.
        - If the output budget is low, shorten sections 2 and 3, but always produce section 5.
        """

    return f"""
    You are a CAN bus reverse-engineering assistant for AvenLab.

    You must be conservative. Do not claim a signal is decoded unless the evidence supports it.
    Treat the output as a research hypothesis for the selected vehicle dataset only.
    Do not assume every session belongs to a 2015 Scion FR-S. Practice vehicles such as AE86, vcan interface, and simulation mode must keep as separate hypotheses from live captures.

    The intended target describes the human action being tested. It does not prove
    that any candidate carries that signal. Use it only to evaluate temporal and
    behavioral consistency.

    You are given raw observed byte values, transition counts, bit-flip counts,
    byte deltas, modulo byte/nibble deltas, Hamming distances, and pre/action/post
    marker-window summaries. These observations do not have confirmed semantic
    meaning. Do not claim a decoded signal, scale, offset, signedness, endianness,
    or bit assignment unless repeated evidence supports it.

    Analysis mode:
    - analysis_mode: {analysis_mode}
    {mode_instructions}

    Session:
    - session_id: {session.get('id')}
    - vehicle_slug: {session.get('vehicle_slug')}
    - vehicle: {session.get('year')} {session.get('make')} {session.get('model')}
    - mission_code: {session.get('mission_code')}
    - mission_title: {session.get('mission_title')}
    - intended_target: {session.get('mission_target')}
    - bus_interface: {session.get('bus_interface')}
    - bus_mode: {session.get('bus_mode')}

    Matched baseline:
    - {baseline_summary}

    Supervised model:
    - {ml_summary}

    Retrieved vector memory:
    {historical_memory}

    Vector-memory rule:
    - Historical similarity is supporting context only.
    - Do not change or overrule current-session evidence solely because a prior
      report is semantically similar.
    - Prefer repeated agreement in CAN ID, active byte, bit transitions,
      latency, return state, baseline behavior, and human labels.

    Marker selection:
    - strategy: {prompt_marker_context.get('strategy')}
    - action markers used for correlation: {prompt_marker_context.get('action_markers')}
    - structural/control markers excluded from correlation: {prompt_marker_context.get('control_markers')}

    Explicit action markers used for correlation:
    {action_marker_lines}

    Structural/control markers retained only as context:
    {control_marker_lines}

    {candidate_heading}:
    {candidate_lines}

    Detailed reporting requirements:
    - Write a full technical report, not a short list.
    - For each top CAN ID, explain why it ranked high and why it might be a false positive.
    - Discuss only the active byte evidence explicitly supplied in the prompt.
    - Compare marker timing against byte changes.
    - Separate evidence, hypothesis, and next validation steps.
    - Follow the exact recommendation count required by section 5.
    - Do not stop after listing IDs.
    {response_structure}
    """.strip()

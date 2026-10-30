"""Analysis / baseline: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .shared import (
    ANALYSIS_MODE_BASELINE,
    Any,
    BASELINE_CODE_PREFIXES,
    BASELINE_PENALTY_WEIGHT,
    Candidate,
    FIELD_ANALYZER_PROFILES,
    HTTPException,
    Optional,
    QUICK_ID_BIT_FIRST_METHOD,
    UUID,
)
from .utilities import (
    metadata_dict,
    normalize_analysis_mode,
    score_candidate_confidence,
)

def normalized_byte_change_rates(
    frame_count: int,
    byte_change_counts: dict[str, int],
) -> dict[str, float]:
    transitions = max(int(frame_count) - 1, 1)
    return {
        str(byte_index): round(
            float(byte_change_counts.get(str(byte_index), 0) or 0)
            / transitions,
            8,
        )
        for byte_index in range(8)
    }


def baseline_feature_map(
    rows: list[Any],
) -> dict[int, dict[str, Any]]:
    features: dict[int, dict[str, Any]] = {}

    for raw_row in rows:
        row = dict(raw_row)
        metadata = metadata_dict(row.get("metadata"))
        counts_raw = metadata_dict(row.get("byte_change_counts"))
        counts = {
            str(byte_index): int(
                counts_raw.get(str(byte_index), 0) or 0
            )
            for byte_index in range(8)
        }
        frame_count = int(row.get("frame_count") or 0)
        change_count = int(row.get("change_count") or 0)

        stored_ratio = float(metadata.get("change_ratio") or 0.0)
        try:
            change_ratio = float(stored_ratio)
        except (TypeError, ValueError):
            change_ratio = (
                change_count / max((frame_count - 1) * 8, 1)
            )

        features[int(row["can_id"])] = {
            "can_id": int(row["can_id"]),
            "frame_count": frame_count,
            "change_count": change_count,
            "change_ratio": max(0.0, change_ratio),
            "byte_change_rates": normalized_byte_change_rates(
                frame_count,
                counts,
            ),
            "frequency_hz": (
                float(row["frequency_hz"])
                if row.get("frequency_hz") is not None
                else None
            ),
            "entropy": float(row.get("entropy") or 0.0),
            "baseline_score": float(
                metadata.get("baseline_score") or 0.0
            ),
            "byte_role_hypotheses": (
                metadata.get("byte_role_hypotheses")
                if isinstance(metadata.get("byte_role_hypotheses"), list)
                else []
            ),
        }

    return features


def baseline_row_is_valid(row: dict[str, Any]) -> bool:
    for metadata_key in (
        "report_metadata",
        "session_metadata",
        "mission_metadata",
    ):
        metadata = metadata_dict(row.get(metadata_key))
        if (
            normalize_analysis_mode(metadata.get("analysis_mode"))
            == ANALYSIS_MODE_BASELINE
        ):
            return True

    mission_code = str(row.get("mission_code") or "").upper()
    mission_title = str(row.get("mission_title") or "").upper()
    label = str(row.get("label") or "").upper()
    searchable_text = f"{mission_title} {label}"

    return (
        mission_code.startswith(BASELINE_CODE_PREFIXES)
        or "BASELINE" in searchable_text
        or "NOISE" in searchable_text
        or "SNIFF" in searchable_text
        or "PROFILE" in searchable_text
    )


async def load_baseline_reference(
    conn: Any,
    target_session: dict[str, Any],
    requested_baseline_session_id: Optional[UUID],
) -> tuple[dict[str, Any], dict[int, dict[str, Any]]]:
    """Load the newest compatible analyzed baseline for a target session."""
    vehicle_id = target_session.get("vehicle_id")
    target_id = target_session.get("id")
    bus_interface = target_session.get("bus_interface")
    bus_mode = target_session.get("bus_mode")
    target_started_at = target_session.get("started_at")

    common_select = """
        SELECT
            bs.id AS session_id,
            bs.vehicle_id,
            bs.label,
            bs.bus_interface,
            bs.bus_mode,
            bs.started_at,
            bs.ended_at,
            bs.metadata AS session_metadata,
            rm.mission_code,
            rm.title AS mission_title,
            rm.target AS mission_target,
            rm.metadata AS mission_metadata,
            sr.metadata AS report_metadata
        FROM can_sessions bs
        LEFT JOIN recon_missions rm ON rm.id = bs.mission_id
        LEFT JOIN LATERAL (
            SELECT metadata
            FROM session_reports
            WHERE session_id = bs.id
              AND report_type = 'ai_analysis'
            ORDER BY created_at DESC
            LIMIT 1
        ) sr ON true
    """

    if requested_baseline_session_id is not None:
        baseline_row = await conn.fetchrow(
            common_select
            + """
            WHERE bs.id = $1
              AND bs.vehicle_id = $2
              AND bs.id <> $3
            """,
            requested_baseline_session_id,
            vehicle_id,
            target_id,
        )
        selection = "explicit"
    else:
        baseline_row = await conn.fetchrow(
            common_select
            + """
            WHERE bs.vehicle_id = $1
              AND bs.id <> $2
              AND bs.bus_interface IS NOT DISTINCT FROM $3
              AND bs.bus_mode IS NOT DISTINCT FROM $4
              AND bs.ended_at IS NOT NULL
              AND (
                    $5::timestamptz IS NULL
                    OR bs.started_at <= $5::timestamptz
              )
              AND EXISTS (
                  SELECT 1
                  FROM can_id_features cif
                  WHERE cif.session_id = bs.id
              )
              AND (
                    COALESCE(bs.metadata->>'analysis_mode', '') = $6
                    OR COALESCE(sr.metadata->>'analysis_mode', '') = $6
                    OR UPPER(COALESCE(rm.mission_code, ''))
                       ~ '^(BASE|NOISE|SNIFF|PROFILE)'
                    OR UPPER(COALESCE(rm.title, '')) LIKE '%BASELINE%'
                    OR UPPER(COALESCE(rm.title, '')) LIKE '%NOISE%'
                    OR UPPER(COALESCE(rm.title, '')) LIKE '%SNIFF%'
                    OR UPPER(COALESCE(rm.title, '')) LIKE '%PROFILE%'
                    OR UPPER(COALESCE(bs.label, '')) LIKE '%BASELINE%'
                    OR UPPER(COALESCE(bs.label, '')) LIKE '%NOISE%'
                    OR UPPER(COALESCE(bs.label, '')) LIKE '%SNIFF%'
                    OR UPPER(COALESCE(bs.label, '')) LIKE '%PROFILE%'
              )
            ORDER BY bs.started_at DESC
            LIMIT 1
            """,
            vehicle_id,
            target_id,
            bus_interface,
            bus_mode,
            target_started_at,
            ANALYSIS_MODE_BASELINE,
        )
        selection = "automatic"

    if baseline_row is None:
        return (
            {
                "applied": False,
                "found": False,
                "selection": selection,
                "reason": (
                    "No compatible analyzed baseline was found for the same "
                    "vehicle, CAN interface, and bus mode."
                ),
                "penalty_weight": BASELINE_PENALTY_WEIGHT,
            },
            {},
        )

    baseline = dict(baseline_row)
    if not baseline_row_is_valid(baseline):
        if requested_baseline_session_id is not None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Requested baseline is not labeled or analyzed as a "
                    "baseline/noise profile."
                ),
            )
        return (
            {
                "applied": False,
                "found": False,
                "selection": selection,
                "reason": "Selected session was not recognized as a baseline.",
                "penalty_weight": BASELINE_PENALTY_WEIGHT,
            },
            {},
        )

    if requested_baseline_session_id is not None and (
        baseline.get("bus_interface") != bus_interface
        or baseline.get("bus_mode") != bus_mode
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Requested baseline must use the same CAN interface and "
                "bus mode as the target session."
            ),
        )

    feature_rows = await conn.fetch(
        """
        SELECT
            can_id,
            frame_count,
            change_count,
            byte_change_counts,
            entropy,
            frequency_hz,
            metadata
        FROM can_id_features
        WHERE session_id = $1
        ORDER BY can_id ASC
        """,
        baseline["session_id"],
    )
    features = baseline_feature_map(list(feature_rows))

    if not features:
        return (
            {
                "applied": False,
                "found": False,
                "selection": selection,
                "session_id": str(baseline["session_id"]),
                "reason": "Selected baseline has no persisted CAN-ID features.",
                "penalty_weight": BASELINE_PENALTY_WEIGHT,
            },
            {},
        )

    return (
        {
            "applied": True,
            "found": True,
            "selection": selection,
            "session_id": str(baseline["session_id"]),
            "mission_code": baseline.get("mission_code"),
            "mission_title": baseline.get("mission_title"),
            "label": baseline.get("label"),
            "bus_interface": baseline.get("bus_interface"),
            "bus_mode": baseline.get("bus_mode"),
            "started_at": baseline.get("started_at"),
            "ended_at": baseline.get("ended_at"),
            "feature_count": len(features),
            "penalty_weight": BASELINE_PENALTY_WEIGHT,
            "method": (
                "Normalized per-byte transition rates are subtracted. "
                "Activity already present in the matched baseline applies a "
                "bounded confidence penalty; raw counts are never subtracted."
            ),
        },
        features,
    )


def apply_baseline_subtraction(
    candidates: list[Candidate],
    baseline_features: dict[int, dict[str, Any]],
    baseline_context: dict[str, Any],
) -> None:
    """Adjust candidate confidence using matched baseline activity."""
    applied = bool(
        baseline_context.get("applied")
        and baseline_features
    )
    baseline_session_id = (
        str(baseline_context.get("session_id"))
        if applied
        else None
    )

    for candidate in candidates:
        candidate.confidence_before_baseline = candidate.confidence
        candidate.baseline_adjusted_change_ratio = candidate.change_ratio

        if not applied:
            continue

        candidate.baseline_applied = True
        candidate.baseline_session_id = baseline_session_id

        target_rates = normalized_byte_change_rates(
            candidate.frame_count,
            candidate.byte_change_counts,
        )
        baseline = baseline_features.get(candidate.can_id)

        if baseline is None:
            candidate.baseline_id_present = False
            candidate.baseline_evidence = {
                "target_byte_change_rates": target_rates,
                "baseline_byte_change_rates": {
                    str(byte_index): 0.0
                    for byte_index in range(8)
                },
                "excess_byte_change_rates": target_rates,
                "baseline_change_ratio": 0.0,
            }
            if candidate.correlation_score >= 0.05:
                candidate.notes = (
                    f"{candidate.notes}; CAN ID absent from matched baseline"
                )
            continue

        candidate.baseline_id_present = True
        baseline_rates = {
            str(byte_index): float(
                baseline.get("byte_change_rates", {}).get(
                    str(byte_index),
                    0.0,
                )
            )
            for byte_index in range(8)
        }
        excess_rates = {
            str(byte_index): max(
                0.0,
                target_rates[str(byte_index)]
                - baseline_rates[str(byte_index)],
            )
            for byte_index in range(8)
        }

        target_activity = sum(target_rates.values())
        overlap_activity = sum(
            min(
                target_rates[str(byte_index)],
                baseline_rates[str(byte_index)],
            )
            for byte_index in range(8)
        )
        overlap_score = (
            min(1.0, overlap_activity / target_activity)
            if target_activity > 0
            else 0.0
        )
        adjusted_change_ratio = sum(excess_rates.values()) / 8.0
        penalty = min(
            BASELINE_PENALTY_WEIGHT,
            overlap_score * BASELINE_PENALTY_WEIGHT,
        )

        top_signal = (
            candidate.signal_hypotheses[0]
            if candidate.signal_hypotheses
            else None
        )
        top_field = (
            candidate.field_hypotheses[0]
            if candidate.field_hypotheses
            else None
        )
        if (
            candidate.quick_id_method == QUICK_ID_BIT_FIRST_METHOD
            and top_signal is not None
        ):
            baseline_role_penalty = 0.0
            for role in baseline.get("byte_role_hypotheses", []):
                if not isinstance(role, dict):
                    continue
                role_byte_index = role.get("byte_index")
                if (
                    role_byte_index is None
                    or int(role_byte_index) != top_signal.byte_index
                ):
                    continue
                kind = str(role.get("hypothesis_kind") or "")
                if kind in {"rolling_counter", "checksum_candidate"}:
                    baseline_role_penalty = max(baseline_role_penalty, 0.45)
                elif kind == "payload_or_noise":
                    baseline_role_penalty = max(baseline_role_penalty, 0.15)

            target_bit_rate = top_signal.total_flips / max(
                candidate.frame_count - 1,
                1,
            )
            baseline_byte_rate = baseline_rates.get(
                str(top_signal.byte_index),
                0.0,
            )
            bit_overlap = min(
                1.0,
                baseline_byte_rate / max(target_bit_rate, 1e-9),
            )
            bit_penalty = min(
                BASELINE_PENALTY_WEIGHT,
                (bit_overlap * 0.50) + baseline_role_penalty,
            )
            top_signal.baseline_penalty = round(bit_penalty, 6)
            top_signal.baseline_adjusted_score = round(
                top_signal.score * (1.0 - bit_penalty),
                6,
            )
            byte_adjusted_confidence = (
                score_candidate_confidence(
                    candidate.byte_transition_score,
                    adjusted_change_ratio,
                    candidate.frame_count,
                )
                * (1.0 - penalty)
                if candidate.byte_transition_score > 0.0
                else 0.0
            )
            adjusted_confidence = max(
                top_signal.baseline_adjusted_score,
                byte_adjusted_confidence,
            )
        elif top_field is not None and candidate.analyzer_profile in FIELD_ANALYZER_PROFILES:
            width_bytes = max(1, top_field.width_bits // 8)
            role_penalty = 0.0
            field_bytes = set(range(top_field.start_byte, top_field.start_byte + width_bytes))
            for role in baseline.get("byte_role_hypotheses", []):
                if not isinstance(role, dict):
                    continue
                role_byte_index = role.get("byte_index")
                if role_byte_index is None or int(role_byte_index) not in field_bytes:
                    continue
                kind = str(role.get("hypothesis_kind") or "")
                if kind in {"rolling_counter", "checksum_candidate"}:
                    role_penalty = max(role_penalty, 0.50)
                elif kind == "payload_or_noise":
                    role_penalty = max(role_penalty, 0.12)
            baseline_field_rate = sum(
                baseline_rates.get(str(byte_index), 0.0)
                for byte_index in field_bytes
            ) / max(len(field_bytes), 1)
            field_penalty = min(
                BASELINE_PENALTY_WEIGHT,
                role_penalty + min(0.35, baseline_field_rate * 2.0),
            )
            top_field.baseline_penalty = round(field_penalty, 6)
            top_field.baseline_adjusted_score = round(
                top_field.score * (1.0 - field_penalty),
                6,
            )
            adjusted_confidence = top_field.baseline_adjusted_score
        else:
            adjusted_confidence = (
                score_candidate_confidence(
                    candidate.correlation_score,
                    adjusted_change_ratio,
                    candidate.frame_count,
                )
                * (1.0 - penalty)
            )

        candidate.baseline_overlap_score = round(overlap_score, 8)
        candidate.baseline_penalty = round(penalty, 8)
        candidate.baseline_adjusted_change_ratio = round(
            adjusted_change_ratio,
            8,
        )
        candidate.confidence = round(adjusted_confidence, 5)
        candidate.baseline_evidence = {
            "target_byte_change_rates": target_rates,
            "baseline_byte_change_rates": baseline_rates,
            "excess_byte_change_rates": {
                key: round(value, 8)
                for key, value in excess_rates.items()
            },
            "baseline_change_ratio": round(
                float(baseline.get("change_ratio") or 0.0),
                8,
            ),
            "baseline_frequency_hz": baseline.get("frequency_hz"),
            "baseline_entropy": baseline.get("entropy"),
            "baseline_byte_roles": baseline.get("byte_role_hypotheses", []),
        }

        if (
            overlap_score >= 0.80
            and adjusted_change_ratio
                <= max(candidate.change_ratio * 0.20, 0.001)
        ):
            candidate.candidate_role = "baseline_like_candidate"
            candidate.notes = (
                "candidate activity substantially overlaps matched baseline"
            )
        elif candidate.correlation_score >= 0.05:
            candidate.notes = (
                "correlated changes remain after matched-baseline subtraction"
            )

    candidates.sort(
        key=lambda candidate: (
            candidate.confidence,
            candidate.correlation_score,
            candidate.baseline_adjusted_change_ratio,
            candidate.change_count,
        ),
        reverse=True,
    )

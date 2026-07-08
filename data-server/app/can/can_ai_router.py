from __future__ import annotations

import json
import math
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.db import connect_db

router = APIRouter(prefix="/data/can", tags=["can-ai"])

OLLAMA_URL = "http://127.0.0.1:11434"
DEFAULT_LLM_MODEL = "qwen2.5:3b"
DEFAULT_EMBED_MODEL = "nomic-embed-text"
MAX_ANALYSIS_FRAMES = 75_000
MAX_DELTAS_TO_STORE = 50_000
VECTOR_DIMENSION = 768
EMBED_ONLY_MODEL_HINTS = ("embed", "embedding", "nomic-embed-text", "all-minilm")

ANALYSIS_MODE_BASELINE = "baseline_profile"
ANALYSIS_MODE_TARGET = "target_correlation"
BASELINE_CODE_PREFIXES = ("BASE", "NOISE", "SNIFF", "PROFILE")


def json_dumps(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True, default=str)


def can_hex(can_id: int) -> str:
    return f"0x{can_id:03X}"


def entropy(values: list[int]) -> float:
    if not values:
        return 0.0
    total = len(values)
    counts = Counter(values)
    return float(-sum((n / total) * math.log2(n / total) for n in counts.values()))


def normalize_data(data: Any, dlc: int = 8) -> list[int]:
    if data is None:
        return [0] * dlc
    if isinstance(data, memoryview):
        raw = data.tobytes()
    elif isinstance(data, bytes):
        raw = data
    elif isinstance(data, bytearray):
        raw = bytes(data)
    else:
        raw = bytes(data)
    padded = list(raw[:dlc])
    while len(padded) < dlc:
        padded.append(0)
    return padded


def metadata_dict(value: Any) -> dict[str, Any]:
    """Return a safe dict from asyncpg json/jsonb, JSON text, or None."""
    if value is None:
        return {}
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return dict(parsed) if isinstance(parsed, dict) else {}
    return {}


def normalize_analysis_mode(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None

    mode = value.strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "baseline": ANALYSIS_MODE_BASELINE,
        "baseline_noise": ANALYSIS_MODE_BASELINE,
        "noise": ANALYSIS_MODE_BASELINE,
        "noise_profile": ANALYSIS_MODE_BASELINE,
        "noise_sniffing": ANALYSIS_MODE_BASELINE,
        "sniff": ANALYSIS_MODE_BASELINE,
        "sniffing": ANALYSIS_MODE_BASELINE,
        "passive": ANALYSIS_MODE_BASELINE,
        "passive_sniff": ANALYSIS_MODE_BASELINE,
        "target": ANALYSIS_MODE_TARGET,
        "action": ANALYSIS_MODE_TARGET,
        "decode": ANALYSIS_MODE_TARGET,
        "correlation": ANALYSIS_MODE_TARGET,
        "target_correlation": ANALYSIS_MODE_TARGET,
    }
    if mode in aliases:
        return aliases[mode]
    if mode in {ANALYSIS_MODE_BASELINE, ANALYSIS_MODE_TARGET, "state_compare", "playback_validation"}:
        return mode
    return None


def infer_analysis_mode(session: dict[str, Any], markers: list[dict[str, Any]]) -> str:
    """Decide whether this session is baseline profiling or target correlation.

    Priority:
    1. Explicit analysis_mode in session / mission metadata.
    2. Baseline-looking mission code or label.
    3. Explicit marker metadata.
    4. Default to target correlation.
    """
    session_metadata = metadata_dict(session.get("session_metadata"))
    mission_metadata = metadata_dict(session.get("mission_metadata"))

    for metadata in (session_metadata, mission_metadata):
        mode = normalize_analysis_mode(metadata.get("analysis_mode"))
        if mode:
            return mode

    mission_code = str(session.get("mission_code") or "").upper()
    label = str(session.get("label") or "").upper()
    if mission_code.startswith(BASELINE_CODE_PREFIXES) or "BASELINE" in label or "NOISE" in label:
        return ANALYSIS_MODE_BASELINE

    for marker in markers:
        marker_metadata = metadata_dict(marker.get("metadata"))
        mode = normalize_analysis_mode(marker_metadata.get("analysis_mode"))
        if mode:
            return mode

    return ANALYSIS_MODE_TARGET


def is_baseline_mode(analysis_mode: str) -> bool:
    return normalize_analysis_mode(analysis_mode) == ANALYSIS_MODE_BASELINE


def build_baseline_profile(frames: list[FrameRow], candidates: list[Candidate]) -> dict[str, Any]:
    observed_ids = len({frame.can_id for frame in frames})
    total_frames = len(frames)
    high_rate_ids = [
        c.model_dump()
        for c in candidates
        if c.frequency_hz is not None and c.frequency_hz >= 20
    ][:15]
    noisy_ids = [
        c.model_dump()
        for c in candidates
        if c.change_count > 0
    ][:15]
    stable_ids = [
        c.model_dump()
        for c in candidates
        if c.change_count == 0
    ][:15]

    return {
        "kind": ANALYSIS_MODE_BASELINE,
        "target_expected": False,
        "total_frames": total_frames,
        "observed_ids": observed_ids,
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
) -> str:
    if is_baseline_mode(analysis_mode):
        profile = baseline_profile or {}
        lines = [
            "# CAN Baseline / Noise Profile",
            "",
            f"Session: {session_id}",
            f"Frames analyzed: {frames_count}",
            f"Markers: {markers_count}",
            f"Observed CAN IDs: {profile.get('observed_ids', 0)}",
            "",
            "## Background IDs to filter in future action missions",
            *[
                (
                    f"- {c.can_id_hex}: frames={c.frame_count}, hz={c.frequency_hz}, "
                    f"changes={c.change_count}, entropy={c.entropy}, "
                    f"baseline_score={c.baseline_score}, role={c.candidate_role}, "
                    f"bytes={c.byte_change_counts}"
                )
                for c in candidates[:15]
            ],
            "",
            "## Analyst note",
            "No target action was expected in this mission, so confidence values are not treated as signal probabilities.",
        ]
        return "\n".join(lines)

    return "\n".join(
        [
            "# CAN Session Analysis",
            "",
            f"Session: {session_id}",
            f"Frames analyzed: {frames_count}",
            f"Markers: {markers_count}",
            "",
            "## Top candidates",
            *[
                f"- {c.can_id_hex}: confidence={c.confidence}, score={c.correlation_score}, changes={c.change_count}, bytes={c.byte_change_counts}"
                for c in candidates[:15]
            ],
        ]
    )


class AnalyzeSessionRequest(BaseModel):
    marker_window_ms: int = Field(default=900, ge=100, le=10_000)
    max_frames: int = Field(default=MAX_ANALYSIS_FRAMES, ge=100, le=250_000)
    use_llm: bool = True
    use_embeddings: bool = True
    llm_model: str = DEFAULT_LLM_MODEL
    embed_model: str = DEFAULT_EMBED_MODEL
    persist: bool = True


class Candidate(BaseModel):
    can_id: int
    can_id_hex: str
    frame_count: int
    frequency_hz: Optional[float]
    change_count: int
    byte_change_counts: dict[str, int]
    entropy: float
    correlation_score: float
    confidence: float
    likely_marker_types: list[str]
    notes: str
    analysis_mode: str = ANALYSIS_MODE_TARGET
    candidate_role: str = "target_candidate"
    baseline_score: float = 0.0


@dataclass
class FrameRow:
    id: int
    timestamp_ms: int
    can_id: int
    dlc: int
    data: list[int]


def is_embedding_only_model(model_name: str) -> bool:
    lowered = model_name.lower()
    return any(hint in lowered for hint in EMBED_ONLY_MODEL_HINTS)


async def list_ollama_models() -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags")
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return []

    names: list[str] = []
    for model in payload.get("models", []):
        name = model.get("name")
        if isinstance(name, str) and name:
            names.append(name)
    return names


async def resolve_llm_model(requested_model: str) -> tuple[str, list[str]]:
    installed = await list_ollama_models()
    generate_capable = [name for name in installed if not is_embedding_only_model(name)]

    if requested_model in generate_capable:
        return requested_model, installed

    if generate_capable:
        return generate_capable[0], installed

    if installed and requested_model in installed and is_embedding_only_model(requested_model):
        raise RuntimeError(
            f"Ollama model '{requested_model}' is installed, but it appears to be embedding-only. "
            "Pull a generate-capable model, for example: ollama pull qwen2.5:3b"
        )

    raise RuntimeError(
        f"No generate-capable Ollama model is installed. Installed models: {installed or 'none'}. "
        f"Requested model: {requested_model}. Run: ollama pull {requested_model}"
    )


async def call_ollama_generate(model: str, prompt: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False},
        )
        if response.status_code >= 400:
            detail = response.text.strip()
            raise RuntimeError(
                f"Ollama generate failed for model '{model}' "
                f"with HTTP {response.status_code}: {detail}"
            )
        return response.json()


async def call_ollama_embed(model: str, text: str) -> Optional[list[float]]:
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/embed",
                json={"model": model, "input": text},
            )
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return None

    embeddings = payload.get("embeddings")
    if isinstance(embeddings, list) and embeddings:
        first = embeddings[0]
        if isinstance(first, list):
            return [float(x) for x in first]

    embedding = payload.get("embedding")
    if isinstance(embedding, list):
        return [float(x) for x in embedding]

    return None


def build_llm_prompt(
    session: dict[str, Any],
    markers: list[dict[str, Any]],
    candidates: list[Candidate],
    analysis_mode: str,
    baseline_profile: Optional[dict[str, Any]] = None,
) -> str:
    marker_lines = "\n".join(
        f"- {m.get('timestamp_ms')}ms {m.get('marker_type')} {m.get('step_code') or ''}: {m.get('label') or ''}"
        for m in markers[:40]
    ) or "- no markers"

    if is_baseline_mode(analysis_mode):
        candidate_heading = "Background / noise-profile CAN IDs"
        candidate_lines = "\n".join(
            (
                f"- {c.can_id_hex}: role={c.candidate_role}, frames={c.frame_count}, "
                f"hz={c.frequency_hz}, changes={c.change_count}, entropy={c.entropy:.3f}, "
                f"baseline_score={c.baseline_score:.3f}, byte_changes={c.byte_change_counts}"
            )
            for c in candidates[:20]
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
Respond in this exact structure:
1. Executive summary
2. Baseline traffic profile table with: CAN ID, role, frequency, byte activity, why it matters
3. Background/noise filter recommendations
4. Warnings / uncertainty
5. Recommended next recording mission
"""
    else:
        candidate_heading = "Ranked statistical CAN-ID candidates"
        candidate_lines = "\n".join(
            (
                f"- {c.can_id_hex}: frames={c.frame_count}, hz={c.frequency_hz}, "
                f"changes={c.change_count}, entropy={c.entropy:.3f}, "
                f"score={c.correlation_score:.3f}, confidence={c.confidence:.3f}, "
                f"byte_changes={c.byte_change_counts}, markers={c.likely_marker_types}"
            )
            for c in candidates[:20]
        ) or "- no candidates"

        mode_instructions = """
This is a TARGET CORRELATION mission.
Rank candidate CAN IDs by evidence near action/capture markers.
Confidence is a research score, not proof.
Prefer IDs that changed near the intended action and are not merely noisy baseline traffic.
"""
        response_structure = """
Respond in this exact structure:
1. Executive summary
2. Top CAN ID hypotheses table with: CAN ID, likely signal, evidence, confidence, next validation experiment
3. Byte-level observations and heatmap interpretation
4. Warnings / uncertainty
5. Recommended next recording mission
"""

    return f"""
You are a CAN bus reverse-engineering assistant for AvenLab.

You must be conservative. Do not claim a signal is decoded unless the evidence supports it.
Treat the output as a research hypothesis for the selected vehicle dataset only.
Do not assume every session belongs to a 2015 Scion FR-S. Practice vehicles such as AE86 custom ECU, BRZ, Camaro, and Tank must keep separate hypotheses from live FR-S captures.

Analysis mode:
- analysis_mode: {analysis_mode}
{mode_instructions}

Session:
- session_id: {session.get('id')}
- vehicle_slug: {session.get('vehicle_slug')}
- vehicle: {session.get('year')} {session.get('make')} {session.get('model')}
- mission_code: {session.get('mission_code')}
- bus_interface: {session.get('bus_interface')}
- bus_mode: {session.get('bus_mode')}

Human event markers:
{marker_lines}

{candidate_heading}:
{candidate_lines}

{response_structure}
""".strip()


def analyze_frames(
    frames: list[FrameRow],
    markers: list[dict[str, Any]],
    marker_window_ms: int,
    analysis_mode: str = ANALYSIS_MODE_TARGET,
) -> tuple[list[Candidate], list[dict[str, Any]], dict[str, Any]]:
    baseline_mode = is_baseline_mode(analysis_mode)

    by_id: dict[int, list[FrameRow]] = defaultdict(list)
    for frame in frames:
        by_id[frame.can_id].append(frame)

    all_deltas: list[dict[str, Any]] = []
    candidates: list[Candidate] = []
    heatmap: dict[str, Any] = {}

    marker_windows: list[tuple[int, int, dict[str, Any]]] = []
    for marker in markers:
        t = int(marker.get("timestamp_ms") or 0)
        marker_windows.append((t - marker_window_ms, t + marker_window_ms, marker))

    for can_id, rows in sorted(by_id.items()):
        rows.sort(key=lambda r: (r.timestamp_ms, r.id))
        byte_change_counts = [0] * 8
        changed_timestamps: list[int] = []
        byte_values: list[int] = []

        previous: Optional[FrameRow] = None
        for row in rows:
            byte_values.extend(row.data[:8])
            if previous is not None:
                for idx, (prev_byte, cur_byte) in enumerate(zip(previous.data[:8], row.data[:8])):
                    if prev_byte != cur_byte:
                        byte_change_counts[idx] += 1
                        changed_timestamps.append(row.timestamp_ms)
                        if len(all_deltas) < MAX_DELTAS_TO_STORE:
                            all_deltas.append(
                                {
                                    "session_id": None,
                                    "can_id": can_id,
                                    "timestamp_ms": row.timestamp_ms,
                                    "byte_index": idx,
                                    "previous_value": prev_byte,
                                    "current_value": cur_byte,
                                    "delta": int(cur_byte) - int(prev_byte),
                                    "metadata": {
                                        "can_id_hex": can_hex(can_id),
                                        "raw_frame_id": row.id,
                                        "analysis_mode": analysis_mode,
                                    },
                                }
                            )
            previous = row

        first_t = rows[0].timestamp_ms if rows else 0
        last_t = rows[-1].timestamp_ms if rows else first_t
        duration_s = max((last_t - first_t) / 1000.0, 0.001)
        frequency_hz = len(rows) / duration_s if len(rows) > 1 else None
        change_count = sum(byte_change_counts)
        entropy_score = entropy(byte_values)
        change_ratio = min(change_count / max(len(rows), 1), 1.0)
        frame_volume_score = min(len(rows) / 200.0, 1.0)
        entropy_norm = min(entropy_score / 8.0, 1.0)
        baseline_score = min(
            1.0,
            (frame_volume_score * 0.35)
            + (change_ratio * 0.35)
            + (entropy_norm * 0.30),
        )

        marker_hits: Counter[str] = Counter()
        window_delta_count = 0
        for start, end, marker in marker_windows:
            hits = sum(1 for t in changed_timestamps if start <= t <= end)
            if hits:
                marker_type = marker.get("marker_type") or "unknown_marker"
                step_code = marker.get("step_code") or marker.get("label") or marker_type
                marker_hits[str(step_code)] += hits
                window_delta_count += hits

        if baseline_mode:
            # Baseline missions are not trying to decode a target action.
            correlation_score = 0.0
            confidence = 0.0

            if change_count == 0 and frequency_hz is not None and frequency_hz >= 5:
                candidate_role = "periodic_stable_background"
                notes = "baseline periodic traffic; useful for down-weighting future false positives"
            elif change_count > 0:
                candidate_role = "baseline_noisy_background"
                notes = "naturally changing baseline traffic; filter before target correlation"
            else:
                candidate_role = "stable_background"
                notes = "stable/background traffic observed during passive profile"
        else:
            if change_count > 0:
                correlation_score = min(1.0, window_delta_count / max(change_count, 1))
            else:
                correlation_score = 0.0

            confidence = min(
                1.0,
                (correlation_score * 0.72)
                + (change_ratio * 0.18)
                + (frame_volume_score * 0.10),
            )

            candidate_role = "target_candidate" if correlation_score >= 0.05 else "weak_or_background_candidate"
            if correlation_score >= 0.05 or change_count > 0:
                notes = "correlated changes near markers" if correlation_score >= 0.05 else "changed during session but weak marker correlation"
            else:
                notes = "stable/background traffic"

        byte_change_map = {str(i): int(v) for i, v in enumerate(byte_change_counts)}
        top_markers = [] if baseline_mode else [name for name, _ in marker_hits.most_common(5)]

        candidates.append(
            Candidate(
                can_id=can_id,
                can_id_hex=can_hex(can_id),
                frame_count=len(rows),
                frequency_hz=round(frequency_hz, 3) if frequency_hz else None,
                change_count=change_count,
                byte_change_counts=byte_change_map,
                entropy=round(entropy_score, 4),
                correlation_score=round(correlation_score, 5),
                confidence=round(confidence, 5),
                likely_marker_types=top_markers,
                notes=notes,
                analysis_mode=analysis_mode,
                candidate_role=candidate_role,
                baseline_score=round(baseline_score, 5),
            )
        )

        heatmap[can_hex(can_id)] = {
            "can_id": can_id,
            "analysis_mode": analysis_mode,
            "candidate_role": candidate_role,
            "byte_change_counts": byte_change_map,
            "change_count": change_count,
            "frame_count": len(rows),
            "frequency_hz": round(frequency_hz, 3) if frequency_hz else None,
            "baseline_score": round(baseline_score, 5),
        }

    if baseline_mode:
        candidates.sort(key=lambda c: (c.baseline_score, c.change_count, c.frame_count), reverse=True)
    else:
        candidates.sort(key=lambda c: (c.confidence, c.correlation_score, c.change_count, c.frame_count), reverse=True)

    return candidates, all_deltas, heatmap


@router.get("/ai/status")
async def get_ai_status() -> dict[str, Any]:
    models = await list_ollama_models()
    generate_models = [name for name in models if not is_embedding_only_model(name)]
    embedding_models = [name for name in models if is_embedding_only_model(name)]
    return {
        "ok": True,
        "ollama_url": OLLAMA_URL,
        "models": models,
        "generate_models": generate_models,
        "embedding_models": embedding_models,
        "default_llm_model": DEFAULT_LLM_MODEL,
        "default_embed_model": DEFAULT_EMBED_MODEL,
        "llm_ready": len(generate_models) > 0,
    }


@router.post("/session/{session_id}/analyze")
async def analyze_session(session_id: UUID, payload: AnalyzeSessionRequest) -> dict[str, Any]:
    pool = await connect_db()
    async with pool.acquire() as conn:
        session = await conn.fetchrow(
            """
            SELECT
                cs.id, cs.vehicle_id, cs.mission_id, cs.label, cs.bus_interface, cs.bus_mode,
                cs.metadata AS session_metadata,
                rm.mission_code, rm.metadata AS mission_metadata,
                v.slug AS vehicle_slug, v.year, v.make, v.model
            FROM can_sessions cs
            JOIN vehicles v ON v.id = cs.vehicle_id
            LEFT JOIN recon_missions rm ON rm.id = cs.mission_id
            WHERE cs.id = $1
            """,
            session_id,
        )
        if not session:
            raise HTTPException(status_code=404, detail="CAN session not found")

        markers = await conn.fetch(
            """
            SELECT csm.id, csm.marker_type, csm.label, csm.timestamp_ms, csm.metadata,
                   rs.step_code
            FROM can_session_markers csm
            LEFT JOIN recon_steps rs ON rs.id = csm.step_id
            WHERE csm.session_id = $1
            ORDER BY csm.timestamp_ms ASC, csm.created_at ASC
            """,
            session_id,
        )

        raw_rows = await conn.fetch(
            """
            SELECT id, timestamp_ms, can_id, dlc, data
            FROM can_frames_raw
            WHERE session_id = $1
            ORDER BY timestamp_ms ASC, id ASC
            LIMIT $2
            """,
            session_id,
            payload.max_frames,
        )

    frames = [
        FrameRow(
            id=int(row["id"]),
            timestamp_ms=int(row["timestamp_ms"]),
            can_id=int(row["can_id"]),
            dlc=int(row["dlc"] or 8),
            data=normalize_data(row["data"], int(row["dlc"] or 8)),
        )
        for row in raw_rows
    ]
    marker_dicts = [dict(row) for row in markers]
    for marker in marker_dicts:
        marker["metadata"] = metadata_dict(marker.get("metadata"))

    session_dict = dict(session)
    session_dict["session_metadata"] = metadata_dict(session_dict.get("session_metadata"))
    session_dict["mission_metadata"] = metadata_dict(session_dict.get("mission_metadata"))

    analysis_mode = infer_analysis_mode(session_dict, marker_dicts)
    baseline_mode = is_baseline_mode(analysis_mode)

    candidates, deltas, heatmap = analyze_frames(
        frames,
        marker_dicts,
        payload.marker_window_ms,
        analysis_mode,
    )
    baseline_profile = build_baseline_profile(frames, candidates) if baseline_mode else None

    llm_response: Optional[str] = None
    llm_error: Optional[str] = None
    resolved_llm_model: Optional[str] = payload.llm_model if payload.use_llm else None
    installed_ollama_models: list[str] = []
    if payload.use_llm:
        try:
            resolved_llm_model, installed_ollama_models = await resolve_llm_model(payload.llm_model)
            prompt = build_llm_prompt(session_dict, marker_dicts, candidates, analysis_mode, baseline_profile)
            result = await call_ollama_generate(resolved_llm_model, prompt)
            llm_response = result.get("response", "")
        except Exception as exc:
            llm_error = str(exc)
            llm_response = None

    report_content = llm_response or build_fallback_report(
        session_id=session_id,
        analysis_mode=analysis_mode,
        frames_count=len(frames),
        markers_count=len(marker_dicts),
        candidates=candidates,
        baseline_profile=baseline_profile,
    )

    if payload.persist:
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute("DELETE FROM can_frame_deltas WHERE session_id = $1", session_id)
                await conn.execute("DELETE FROM can_id_features WHERE session_id = $1", session_id)
                await conn.execute("DELETE FROM can_id_correlations WHERE session_id = $1", session_id)

                if deltas:
                    await conn.executemany(
                        """
                        INSERT INTO can_frame_deltas (
                            session_id, can_id, timestamp_ms, byte_index,
                            previous_value, current_value, delta, metadata
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
                        """,
                        [
                            (
                                session_id,
                                d["can_id"],
                                d["timestamp_ms"],
                                d["byte_index"],
                                d["previous_value"],
                                d["current_value"],
                                d["delta"],
                                json_dumps(d["metadata"]),
                            )
                            for d in deltas
                        ],
                    )

                await conn.executemany(
                    """
                    INSERT INTO can_id_features (
                        session_id, can_id, frame_count, change_count,
                        byte_change_counts, entropy, frequency_hz, metadata
                    ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb)
                    ON CONFLICT (session_id, can_id) DO UPDATE SET
                        frame_count = EXCLUDED.frame_count,
                        change_count = EXCLUDED.change_count,
                        byte_change_counts = EXCLUDED.byte_change_counts,
                        entropy = EXCLUDED.entropy,
                        frequency_hz = EXCLUDED.frequency_hz,
                        metadata = EXCLUDED.metadata
                    """,
                    [
                        (
                            session_id,
                            c.can_id,
                            c.frame_count,
                            c.change_count,
                            json_dumps(c.byte_change_counts),
                            c.entropy,
                            c.frequency_hz,
                            json_dumps({
                                "can_id_hex": c.can_id_hex,
                                "notes": c.notes,
                                "analysis_mode": analysis_mode,
                                "candidate_role": c.candidate_role,
                                "baseline_score": c.baseline_score,
                            }),
                        )
                        for c in candidates
                    ],
                )

                await conn.executemany(
                    """
                    INSERT INTO can_id_correlations (
                        session_id, can_id, marker_type, score, confidence, notes, metadata
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
                    """,
                    [
                        (
                            session_id,
                            c.can_id,
                            ",".join(c.likely_marker_types) if c.likely_marker_types else analysis_mode,
                            c.correlation_score,
                            c.confidence,
                            c.notes,
                            json_dumps({
                                "can_id_hex": c.can_id_hex,
                                "byte_change_counts": c.byte_change_counts,
                                "entropy": c.entropy,
                                "frequency_hz": c.frequency_hz,
                                "analysis_mode": analysis_mode,
                                "candidate_role": c.candidate_role,
                                "baseline_score": c.baseline_score,
                            }),
                        )
                        for c in candidates
                    ],
                )

                report_row = await conn.fetchrow(
                    """
                    INSERT INTO session_reports (
                        session_id, report_type, title, content, metadata
                    ) VALUES ($1, 'ai_analysis', $2, $3, $4::jsonb)
                    RETURNING id
                    """,
                    session_id,
                    (
                        f"CAN baseline profile for {session_dict.get('vehicle_slug')} session {session_id}"
                        if baseline_mode
                        else f"AI CAN analysis for {session_dict.get('vehicle_slug')} session {session_id}"
                    ),
                    report_content,
                    json_dumps({
                        "vehicle_slug": session_dict.get("vehicle_slug"),
                        "analysis_mode": analysis_mode,
                        "baseline_profile": baseline_profile,
                        "frames_analyzed": len(frames),
                        "markers": len(marker_dicts),
                        "model": resolved_llm_model,
                        "llm_error": llm_error,
                        "top_candidates": [c.model_dump() for c in candidates[:10]],
                        "heatmap": heatmap,
                    }),
                )

                if payload.use_llm and llm_response:
                    prompt = build_llm_prompt(session_dict, marker_dicts, candidates, analysis_mode, baseline_profile)
                    await conn.execute(
                        """
                        INSERT INTO ai_insights (session_id, vehicle_id, prompt, response, model, metadata)
                        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                        """,
                        session_id,
                        session["vehicle_id"],
                        prompt,
                        llm_response,
                        resolved_llm_model,
                        json_dumps({
                            "report_id": str(report_row["id"]),
                            "vehicle_slug": session_dict.get("vehicle_slug"),
                            "analysis_mode": analysis_mode,
                        }),
                    )

                embedding_inserted = False
                embedding_error = None
                if payload.use_embeddings and candidates:
                    if baseline_mode:
                        text = (
                            f"CAN baseline profile {session_dict.get('vehicle_slug')} session {session_id}. Background IDs: "
                            + "; ".join(
                                f"{c.can_id_hex} role {c.candidate_role} baseline_score {c.baseline_score} changes {c.change_count}"
                                for c in candidates[:10]
                            )
                        )
                    else:
                        text = (
                            f"CAN analysis {session_dict.get('vehicle_slug')} session {session_id}. Top candidates: "
                            + "; ".join(
                                f"{c.can_id_hex} confidence {c.confidence} changes {c.change_count} markers {c.likely_marker_types}"
                                for c in candidates[:10]
                            )
                        )
                    embedding = await call_ollama_embed(payload.embed_model, text)
                    if embedding and len(embedding) == VECTOR_DIMENSION:
                        vector_literal = "[" + ",".join(f"{x:.8f}" for x in embedding) + "]"
                        await conn.execute(
                            """
                            INSERT INTO signal_embeddings (vehicle_id, session_id, text, embedding, metadata)
                            VALUES ($1, $2, $3, $4::vector, $5::jsonb)
                            """,
                            session["vehicle_id"],
                            session_id,
                            text,
                            vector_literal,
                            json_dumps({
                                "model": payload.embed_model,
                                "dimension": len(embedding),
                                "analysis_mode": analysis_mode,
                            }),
                        )
                        embedding_inserted = True
                    elif embedding:
                        embedding_error = f"Embedding dimension {len(embedding)} does not match schema vector({VECTOR_DIMENSION})"
                    else:
                        embedding_error = "Embedding request failed or returned no embedding"

    return {
        "ok": True,
        "session_id": str(session_id),
        "analysis_mode": analysis_mode,
        "baseline_profile": baseline_profile,
        "target_expected": not baseline_mode,
        "frames_analyzed": len(frames),
        "markers": len(marker_dicts),
        "candidates": [c.model_dump() for c in candidates[:50]],
        "heatmap": heatmap,
        "llm_model": resolved_llm_model,
        "llm_available": llm_response is not None,
        "llm_error": llm_error,
        "installed_ollama_models": installed_ollama_models,
        "analysis": llm_response,
        "persisted": payload.persist,
    }


@router.get("/session/{session_id}/analysis")
async def get_session_analysis(session_id: UUID) -> dict[str, Any]:
    pool = await connect_db()
    async with pool.acquire() as conn:
        features = await conn.fetch(
            """
            SELECT can_id, frame_count, change_count, byte_change_counts,
                   entropy, frequency_hz, metadata, created_at
            FROM can_id_features
            WHERE session_id = $1
            ORDER BY change_count DESC, frame_count DESC
            """,
            session_id,
        )
        correlations = await conn.fetch(
            """
            SELECT can_id, marker_type, score, confidence, notes, metadata, created_at
            FROM can_id_correlations
            WHERE session_id = $1
            ORDER BY confidence DESC, score DESC
            """,
            session_id,
        )
        report = await conn.fetchrow(
            """
            SELECT id, title, content, metadata, created_at
            FROM session_reports
            WHERE session_id = $1 AND report_type = 'ai_analysis'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            session_id,
        )

    latest_report = dict(report) if report else None
    latest_report_metadata = metadata_dict(latest_report.get("metadata")) if latest_report else {}
    if latest_report:
        latest_report["metadata"] = latest_report_metadata

    return {
        "ok": True,
        "session_id": str(session_id),
        "analysis_mode": latest_report_metadata.get("analysis_mode"),
        "baseline_profile": latest_report_metadata.get("baseline_profile"),
        "target_expected": latest_report_metadata.get("analysis_mode") != ANALYSIS_MODE_BASELINE if latest_report_metadata else None,
        "features": [dict(row) for row in features],
        "correlations": [dict(row) for row in correlations],
        "latest_report": latest_report,
    }

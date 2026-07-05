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


@dataclass
class FrameRow:
    id: int
    timestamp_ms: int
    can_id: int
    dlc: int
    data: list[int]


async def call_ollama_generate(model: str, prompt: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False},
        )
        response.raise_for_status()
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


def build_llm_prompt(session: dict[str, Any], markers: list[dict[str, Any]], candidates: list[Candidate]) -> str:
    marker_lines = "\n".join(
        f"- {m.get('timestamp_ms')}ms {m.get('marker_type')} {m.get('step_code') or ''}: {m.get('label') or ''}"
        for m in markers[:40]
    ) or "- no markers"

    candidate_lines = "\n".join(
        (
            f"- {c.can_id_hex}: frames={c.frame_count}, hz={c.frequency_hz}, "
            f"changes={c.change_count}, entropy={c.entropy:.3f}, "
            f"score={c.correlation_score:.3f}, confidence={c.confidence:.3f}, "
            f"byte_changes={c.byte_change_counts}, markers={c.likely_marker_types}"
        )
        for c in candidates[:20]
    ) or "- no candidates"

    return f"""
You are a CAN bus reverse-engineering assistant for AvenLab.

You must be conservative. Do not claim a signal is decoded unless the evidence supports it.
Treat the output as a research hypothesis for the user's own 2015 Scion FR-S dataset.

Session:
- session_id: {session.get('id')}
- vehicle: {session.get('year')} {session.get('make')} {session.get('model')}
- mission_code: {session.get('mission_code')}
- bus_interface: {session.get('bus_interface')}
- bus_mode: {session.get('bus_mode')}

Human event markers:
{marker_lines}

Ranked statistical CAN-ID candidates:
{candidate_lines}

Respond in this exact structure:
1. Executive summary
2. Top CAN ID hypotheses table with: CAN ID, likely signal, evidence, confidence, next validation experiment
3. Byte-level observations and heatmap interpretation
4. Warnings / uncertainty
5. Recommended next recording mission
""".strip()


def analyze_frames(frames: list[FrameRow], markers: list[dict[str, Any]], marker_window_ms: int) -> tuple[list[Candidate], list[dict[str, Any]], dict[str, Any]]:
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
                                    },
                                }
                            )
            previous = row

        first_t = rows[0].timestamp_ms if rows else 0
        last_t = rows[-1].timestamp_ms if rows else first_t
        duration_s = max((last_t - first_t) / 1000.0, 0.001)
        frequency_hz = len(rows) / duration_s if len(rows) > 1 else None
        change_count = sum(byte_change_counts)

        marker_hits: Counter[str] = Counter()
        window_delta_count = 0
        for start, end, marker in marker_windows:
            hits = sum(1 for t in changed_timestamps if start <= t <= end)
            if hits:
                marker_type = marker.get("marker_type") or "unknown_marker"
                step_code = marker.get("step_code") or marker.get("label") or marker_type
                marker_hits[str(step_code)] += hits
                window_delta_count += hits

        if change_count > 0:
            correlation_score = min(1.0, window_delta_count / max(change_count, 1))
        else:
            # Stable IDs can still be useful as baseline, but not action candidates.
            correlation_score = 0.0

        entropy_score = entropy(byte_values)
        confidence = min(
            1.0,
            (correlation_score * 0.72)
            + (min(change_count / max(len(rows), 1), 1.0) * 0.18)
            + (min(len(rows) / 200.0, 1.0) * 0.10),
        )

        byte_change_map = {str(i): int(v) for i, v in enumerate(byte_change_counts)}
        top_markers = [name for name, _ in marker_hits.most_common(5)]

        if correlation_score >= 0.05 or change_count > 0:
            notes = "correlated changes near markers" if correlation_score >= 0.05 else "changed during session but weak marker correlation"
        else:
            notes = "stable/background traffic"

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
            )
        )

        heatmap[can_hex(can_id)] = {
            "can_id": can_id,
            "byte_change_counts": byte_change_map,
            "change_count": change_count,
            "frame_count": len(rows),
            "frequency_hz": round(frequency_hz, 3) if frequency_hz else None,
        }

    candidates.sort(key=lambda c: (c.confidence, c.correlation_score, c.change_count, c.frame_count), reverse=True)
    return candidates, all_deltas, heatmap


@router.post("/session/{session_id}/analyze")
async def analyze_session(session_id: UUID, payload: AnalyzeSessionRequest) -> dict[str, Any]:
    pool = await connect_db()
    async with pool.acquire() as conn:
        session = await conn.fetchrow(
            """
            SELECT
                cs.id, cs.vehicle_id, cs.mission_id, cs.label, cs.bus_interface, cs.bus_mode,
                rm.mission_code,
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
    session_dict = dict(session)

    candidates, deltas, heatmap = analyze_frames(frames, marker_dicts, payload.marker_window_ms)

    llm_response: Optional[str] = None
    llm_error: Optional[str] = None
    if payload.use_llm:
        try:
            prompt = build_llm_prompt(session_dict, marker_dicts, candidates)
            result = await call_ollama_generate(payload.llm_model, prompt)
            llm_response = result.get("response", "")
        except Exception as exc:
            llm_error = str(exc)
            llm_response = None

    report_content = llm_response or "\n".join(
        [
            "# CAN Session Analysis",
            "",
            f"Session: {session_id}",
            f"Frames analyzed: {len(frames)}",
            f"Markers: {len(marker_dicts)}",
            "",
            "## Top candidates",
            *[
                f"- {c.can_id_hex}: confidence={c.confidence}, score={c.correlation_score}, changes={c.change_count}, bytes={c.byte_change_counts}"
                for c in candidates[:15]
            ],
        ]
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
                            json_dumps({"can_id_hex": c.can_id_hex, "notes": c.notes}),
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
                            ",".join(c.likely_marker_types) if c.likely_marker_types else None,
                            c.correlation_score,
                            c.confidence,
                            c.notes,
                            json_dumps({
                                "can_id_hex": c.can_id_hex,
                                "byte_change_counts": c.byte_change_counts,
                                "entropy": c.entropy,
                                "frequency_hz": c.frequency_hz,
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
                    f"AI CAN analysis for session {session_id}",
                    report_content,
                    json_dumps({
                        "frames_analyzed": len(frames),
                        "markers": len(marker_dicts),
                        "model": payload.llm_model if payload.use_llm else None,
                        "llm_error": llm_error,
                        "top_candidates": [c.model_dump() for c in candidates[:10]],
                        "heatmap": heatmap,
                    }),
                )

                if payload.use_llm and llm_response:
                    prompt = build_llm_prompt(session_dict, marker_dicts, candidates)
                    await conn.execute(
                        """
                        INSERT INTO ai_insights (session_id, vehicle_id, prompt, response, model, metadata)
                        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                        """,
                        session_id,
                        session["vehicle_id"],
                        prompt,
                        llm_response,
                        payload.llm_model,
                        json_dumps({"report_id": str(report_row["id"])}),
                    )

                embedding_inserted = False
                embedding_error = None
                if payload.use_embeddings and candidates:
                    text = (
                        f"CAN analysis session {session_id}. Top candidates: "
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
                            json_dumps({"model": payload.embed_model, "dimension": len(embedding)}),
                        )
                        embedding_inserted = True
                    elif embedding:
                        embedding_error = f"Embedding dimension {len(embedding)} does not match schema vector({VECTOR_DIMENSION})"
                    else:
                        embedding_error = "Embedding request failed or returned no embedding"

    return {
        "ok": True,
        "session_id": str(session_id),
        "frames_analyzed": len(frames),
        "markers": len(marker_dicts),
        "candidates": [c.model_dump() for c in candidates[:50]],
        "heatmap": heatmap,
        "llm_model": payload.llm_model if payload.use_llm else None,
        "llm_available": llm_response is not None,
        "llm_error": llm_error,
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

    return {
        "ok": True,
        "session_id": str(session_id),
        "features": [dict(row) for row in features],
        "correlations": [dict(row) for row in correlations],
        "latest_report": dict(report) if report else None,
    }

"""Analysis / run: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .baseline import (
    apply_baseline_subtraction,
    load_baseline_reference,
)
from .bytes import (
    resolve_analyzer_profile,
)
from .memory import (
    apply_vector_historical_support,
    build_embedding_document,
    compact_candidate_payload,
    embedding_candidate_metadata,
    retrieve_vector_memory,
    vector_literal,
)
from .ollama import (
    call_ollama_embed,
    call_ollama_generate,
    resolve_llm_model,
)
from .queries import (
    load_analysis_frame_rows,
)
from .reports import (
    build_baseline_profile,
    build_fallback_report,
    build_llm_prompt,
    compact_heatmap_payload,
)
from .roles import (
    apply_human_byte_hypotheses,
    load_human_byte_hypotheses,
    rescore_candidates_after_human_byte_roles,
)
from .scoring import (
    analyze_frames,
)
from .shared import (
    AnalyzeSessionRequest,
    Any,
    BASELINE_PENALTY_WEIGHT,
    CONFIDENCE_SEMANTICS,
    FrameRow,
    HTTPException,
    LLM_BYTE_EVIDENCE_LIMIT,
    LLM_CANDIDATE_LIMIT,
    LLM_DEADLINE_SECONDS,
    LLM_HTTP_READ_TIMEOUT_SECONDS,
    LLM_NUM_CTX,
    LLM_NUM_PREDICT,
    MAX_DELTAS_TO_PERSIST,
    MAX_DELTA_CANDIDATES_TO_PERSIST,
    MAX_PERSISTED_REPORT_CANDIDATES,
    MAX_RESPONSE_BYTE_EVIDENCE,
    MAX_RESPONSE_CANDIDATES,
    MAX_RESPONSE_EVIDENCE_CANDIDATES,
    ML_BLEND_WEIGHT,
    OLLAMA_KEEP_ALIVE,
    OLLAMA_URL,
    Optional,
    UUID,
    VECTOR_DIMENSION,
    VECTOR_MEMORY_SCHEMA_VERSION,
    apply_candidate_label_priors,
    apply_supervised_model,
    asyncio,
    connect_db,
    load_active_ml_model,
    load_candidate_label_priors,
    router,
    time,
)
from .utilities import (
    can_ai_log,
    capture_kind_for,
    ensure_complete_five_section_report,
    infer_analysis_mode,
    is_baseline_mode,
    json_dumps,
    metadata_dict,
    normalize_data,
    select_analysis_markers,
    split_numbered_report_sections,
)

@router.post("/session/{session_id}/analyze")
async def analyze_session(session_id: UUID, payload: AnalyzeSessionRequest) -> dict[str, Any]:
    analysis_started = time.perf_counter()
    phase_started = analysis_started

    can_ai_log(
        "analysis_started",
        session=session_id,
        marker_window_ms=payload.marker_window_ms,
        max_frames=payload.max_frames,
        use_llm=payload.use_llm,
        use_embeddings=payload.use_embeddings,
        use_baseline=payload.use_baseline,
        requested_baseline_session=payload.baseline_session_id,
        use_ml_model=payload.use_ml_model,
        requested_ml_model=payload.ml_model_id,
        persist=payload.persist,
        llm_deadline_seconds=(
            LLM_DEADLINE_SECONDS
            if payload.use_llm
            else None
        ),
        llm_num_ctx=LLM_NUM_CTX if payload.use_llm else None,
        llm_num_predict=LLM_NUM_PREDICT if payload.use_llm else None,
    )

    pool = await connect_db()
    async with pool.acquire() as conn:
        session = await conn.fetchrow(
            """
            SELECT
                cs.id, cs.vehicle_id, cs.mission_id, cs.label, cs.bus_interface, cs.bus_mode,
                cs.started_at, cs.ended_at, cs.finalized_at,
                cs.capture_status, cs.final_frame_id, cs.final_frame_count,
                cs.final_marker_count, cs.capture_quality,
                cs.metadata AS session_metadata,
                rm.mission_code,
                rm.title AS mission_title,
                rm.target AS mission_target,
                rm.metadata AS mission_metadata,
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

        if session["capture_status"] != "finalized":
            raise HTTPException(
                status_code=409,
                detail=(
                    "CAN session must be finalized before analysis. "
                    f"Current capture_status={session['capture_status']}."
                ),
            )
        if session["ended_at"] is None or session["finalized_at"] is None:
            raise HTTPException(
                status_code=409,
                detail="Finalized session is missing ended_at/finalized_at integrity fields.",
            )

        markers = await conn.fetch(
            """
            SELECT csm.id, csm.marker_type, csm.label, csm.timestamp_ms, csm.metadata,
                   COALESCE(rs.step_code, csm.metadata->>'step_code') AS step_code,
                   COALESCE(rm.mission_code, csm.metadata->>'mission_code') AS mission_code
            FROM can_session_markers csm
            LEFT JOIN recon_steps rs ON rs.id = csm.step_id
            LEFT JOIN recon_missions rm ON rm.id = csm.mission_id
            WHERE csm.session_id = $1
            ORDER BY csm.timestamp_ms ASC, csm.created_at ASC
            """,
            session_id,
        )

        marker_dicts = [dict(row) for row in markers]
        for marker in marker_dicts:
            marker["metadata"] = metadata_dict(marker.get("metadata"))

        session_dict = dict(session)
        session_dict["session_metadata"] = metadata_dict(
            session_dict.get("session_metadata")
        )
        session_dict["mission_metadata"] = metadata_dict(
            session_dict.get("mission_metadata")
        )
        session_dict["capture_quality"] = metadata_dict(
            session_dict.get("capture_quality")
        )
        if (
            session_dict["capture_quality"].get("usable_for_analysis") is False
            and not payload.allow_low_quality
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Capture quality gate rejected this session. "
                    "Set allow_low_quality=true only for explicit forensic review."
                ),
            )

        analysis_mode = infer_analysis_mode(session_dict, marker_dicts)
        baseline_mode = is_baseline_mode(analysis_mode)

        raw_rows, frame_selection = await load_analysis_frame_rows(
            conn,
            session_id=session_id,
            max_frames=payload.max_frames,
            markers=marker_dicts,
            marker_window_ms=payload.marker_window_ms,
            analysis_mode=analysis_mode,
        )
        finalized_count = int(session["final_frame_count"] or 0)
        observed_count = int(frame_selection.get("total_frames") or 0)
        if finalized_count and observed_count != finalized_count:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Finalized frame-count integrity mismatch: "
                    f"expected {finalized_count}, observed {observed_count}."
                ),
            )

    can_ai_log(
        "database_input_loaded",
        session=session_id,
        raw_frames=len(raw_rows),
        total_raw_frames=frame_selection.get("total_frames"),
        frame_selection=frame_selection.get("strategy"),
        truncated=frame_selection.get("truncated"),
        markers=len(markers),
        elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
    )
    phase_started = time.perf_counter()

    frames = [
        FrameRow(
            id=int(row["id"]),
            timestamp_ms=int(row["timestamp_ms"]),
            can_id=int(row["can_id"]),
            dlc=int(row["dlc"] or 8),
            data=normalize_data(row["data"], int(row["dlc"] or 8)),
            segment_id=int(row.get("_segment_id", 0)),
        )
        for row in raw_rows
    ]
    short_dlc_frames = sum(1 for row in raw_rows if int(row["dlc"] or 0) < 8)
    invalid_width_frames = sum(1 for frame in frames if len(frame.data) != 8)

    can_ai_log(
        "frames_normalized",
        session=session_id,
        frames=len(frames),
        short_dlc_frames=short_dlc_frames,
        invalid_width_frames=invalid_width_frames,
        elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
    )
    phase_started = time.perf_counter()

    if not frames:
        can_ai_log("analysis_rejected_no_frames", session=session_id)
        raise HTTPException(
            status_code=400,
            detail="CAN session contains no frames to analyze",
        )

    if baseline_mode:
        baseline_context = {
            "applied": False,
            "found": False,
            "selection": "not_applicable",
            "reason": "Baseline profiles are not subtracted from themselves.",
            "penalty_weight": BASELINE_PENALTY_WEIGHT,
        }
        baseline_features: dict[int, dict[str, Any]] = {}
    elif not payload.use_baseline:
        baseline_context = {
            "applied": False,
            "found": False,
            "selection": "disabled",
            "reason": "Baseline subtraction was disabled for this request.",
            "penalty_weight": BASELINE_PENALTY_WEIGHT,
        }
        baseline_features = {}
    else:
        async with pool.acquire() as conn:
            baseline_context, baseline_features = (
                await load_baseline_reference(
                    conn,
                    session_dict,
                    payload.baseline_session_id,
                )
            )

    can_ai_log(
        "baseline_selected",
        session=session_id,
        applied=baseline_context.get("applied"),
        selection=baseline_context.get("selection"),
        baseline_session=baseline_context.get("session_id"),
        feature_count=len(baseline_features),
        reason=baseline_context.get("reason"),
    )

    analyzer_profile = resolve_analyzer_profile(
        session_dict,
        marker_dicts,
        analysis_mode,
    )
    _, marker_selection_preview = select_analysis_markers(
        marker_dicts,
        baseline_mode=baseline_mode,
    )

    can_ai_log(
        "statistics_started",
        session=session_id,
        analysis_mode=analysis_mode,
        frames=len(frames),
        markers=len(marker_dicts),
        selected_action_markers=marker_selection_preview.get("action_markers"),
        marker_strategy=marker_selection_preview.get("strategy"),
        analyzer_profile=analyzer_profile,
    )

    try:
        candidates, deltas, heatmap, marker_selection = analyze_frames(
            frames,
            marker_dicts,
            payload.marker_window_ms,
            analysis_mode,
            analyzer_profile,
            session_dict,
        )
        human_hypotheses: list[dict[str, Any]] = []
        try:
            async with pool.acquire() as conn:
                human_hypotheses = await load_human_byte_hypotheses(
                    conn,
                    session_id,
                )
            apply_human_byte_hypotheses(candidates, human_hypotheses)
            rescore_candidates_after_human_byte_roles(
                candidates,
                heatmap,
                apply_confidence_penalty=False,
            )
        except Exception as hypothesis_exc:
            can_ai_log(
                "human_hypothesis_load_failed",
                session=session_id,
                error_type=type(hypothesis_exc).__name__,
                error=repr(hypothesis_exc),
            )
    except Exception as exc:
        can_ai_log(
            "statistics_failed",
            session=session_id,
            error_type=type(exc).__name__,
            error=repr(exc),
            elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
        )
        raise

    if not baseline_mode:
        apply_baseline_subtraction(
            candidates,
            baseline_features,
            baseline_context,
        )

    # Baseline subtraction may replace exact-bit/field confidence. Apply the
    # saved human structural-byte decision once, after that statistical stage
    # and before supervised ML/ID-level priors.
    if human_hypotheses:
        rescore_candidates_after_human_byte_roles(
            candidates,
            heatmap,
            apply_confidence_penalty=True,
        )

    # Preserve the statistical/baseline-adjusted score even when no model exists.
    for candidate in candidates:
        candidate.confidence_before_ml = candidate.confidence

    ml_context: dict[str, Any]
    ml_model: dict[str, Any]

    if baseline_mode:
        ml_context = {
            "applied": False,
            "found": False,
            "selection": "not_applicable",
            "reason": (
                "Baseline profiles are not candidate-classification targets."
            ),
        }
        ml_model = {}
    elif not payload.use_ml_model:
        ml_context = {
            "applied": False,
            "found": False,
            "selection": "disabled",
            "reason": "Supervised model use was disabled for this request.",
        }
        ml_model = {}
    else:
        try:
            async with pool.acquire() as conn:
                ml_context, ml_model = await load_active_ml_model(
                    conn,
                    vehicle_id=session["vehicle_id"],
                    mission_code=session_dict.get("mission_code"),
                    bus_interface=session_dict.get("bus_interface"),
                    bus_mode=session_dict.get("bus_mode"),
                    capture_kind=capture_kind_for(
                        session_dict.get("bus_interface"),
                        session_dict.get("bus_mode"),
                    ),
                    requested_model_id=payload.ml_model_id,
                )
        except HTTPException as exc:
            if exc.status_code == 503:
                ml_context = {
                    "applied": False,
                    "found": False,
                    "selection": "unavailable",
                    "reason": exc.detail,
                }
                ml_model = {}
            else:
                raise

    if ml_context.get("applied"):
        apply_supervised_model(
            candidates,
            ml_model,
            ml_context,
        )

    label_prior_context: dict[str, Any] = {
        "applied": False,
        "compatible_id_priors": 0,
        "candidates_adjusted": 0,
        "reason": (
            "Baseline profiles are not candidate-classification targets."
            if baseline_mode
            else "No compatible labels loaded."
        ),
    }
    if not baseline_mode:
        try:
            async with pool.acquire() as conn:
                label_priors = await load_candidate_label_priors(
                    conn,
                    session_id=session_id,
                    vehicle_id=session["vehicle_id"],
                    mission_code=session_dict.get("mission_code"),
                    bus_interface=session_dict.get("bus_interface"),
                    bus_mode=session_dict.get("bus_mode"),
                    capture_kind=capture_kind_for(
                        session_dict.get("bus_interface"),
                        session_dict.get("bus_mode"),
                    ),
                )
            label_prior_context = apply_candidate_label_priors(
                candidates,
                label_priors,
                supervised_model_applied=bool(ml_context.get("applied")),
            )
            label_prior_context["applied"] = (
                int(label_prior_context.get("candidates_adjusted") or 0) > 0
            )
        except Exception as label_exc:
            label_prior_context = {
                "applied": False,
                "compatible_id_priors": 0,
                "candidates_adjusted": 0,
                "reason": "Could not load compatible human labels.",
                "error_type": type(label_exc).__name__,
            }
            can_ai_log(
                "label_prior_load_failed",
                session=session_id,
                error_type=type(label_exc).__name__,
                error=repr(label_exc),
            )

    can_ai_log(
        "ml_model_selected",
        session=session_id,
        applied=ml_context.get("applied"),
        selection=ml_context.get("selection"),
        model_id=ml_context.get("model_id"),
        label_count=ml_context.get("label_count"),
        label_priors=label_prior_context.get("compatible_id_priors"),
        label_prior_adjusted=label_prior_context.get("candidates_adjusted"),
        reason=ml_context.get("reason"),
    )

    baseline_profile = build_baseline_profile(frames, candidates) if baseline_mode else None

    embedding_text: Optional[str] = None
    query_embedding: Optional[list[float]] = None
    vector_context: dict[str, Any] = {
        "requested": payload.use_embeddings,
        "query_embedded": False,
        "retrieved": False,
        "match_count": 0,
        "matches": [],
        "stored": False,
        "confidence_influence": False,
    }

    if payload.use_embeddings and candidates:
        embedding_text = build_embedding_document(
            session_dict,
            candidates,
            analysis_mode,
            payload.marker_window_ms,
            baseline_context,
            ml_context,
        )
        can_ai_log(
            "vector_memory_embedding_started",
            session=session_id,
            model=payload.embed_model,
            document_chars=len(embedding_text),
        )
        vector_phase_started = time.perf_counter()
        query_embedding = await call_ollama_embed(
            payload.embed_model,
            embedding_text,
        )
        if query_embedding and len(query_embedding) == VECTOR_DIMENSION:
            async with pool.acquire() as conn:
                vector_context = await retrieve_vector_memory(
                    conn,
                    query_embedding=query_embedding,
                    session=session_dict,
                    analysis_mode=analysis_mode,
                    embed_model=payload.embed_model,
                )
            apply_vector_historical_support(candidates, vector_context)
        elif query_embedding:
            vector_context.update({
                "query_embedded": False,
                "error": (
                    f"Embedding dimension {len(query_embedding)} does not "
                    f"match schema vector({VECTOR_DIMENSION})."
                ),
                "reason": "Embedding dimension mismatch.",
            })
            query_embedding = None
        else:
            vector_context.update({
                "query_embedded": False,
                "error": "Embedding request failed or returned no embedding.",
                "reason": "Query embedding was unavailable.",
            })

        can_ai_log(
            "vector_memory_retrieval_completed",
            session=session_id,
            query_embedded=vector_context.get("query_embedded"),
            retrieved=vector_context.get("retrieved"),
            match_count=vector_context.get("match_count"),
            error=vector_context.get("error"),
            elapsed_ms=round(
                (time.perf_counter() - vector_phase_started) * 1000,
                2,
            ),
        )
    elif payload.use_embeddings:
        vector_context["reason"] = "No candidates were available to embed."
    else:
        vector_context["reason"] = "Vector memory was disabled for this request."

    can_ai_log(
        "statistics_completed",
        session=session_id,
        candidates=len(candidates),
        deltas=len(deltas),
        heatmap_ids=len(heatmap),
        baseline_applied=baseline_context.get("applied"),
        baseline_session=baseline_context.get("session_id"),
        ml_applied=ml_context.get("applied"),
        ml_model_id=ml_context.get("model_id"),
        vector_matches=vector_context.get("match_count"),
        top_candidate=(
            candidates[0].can_id_hex
            if candidates
            else None
        ),
        top_confidence=(
            candidates[0].confidence
            if candidates
            else None
        ),
        elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
    )
    phase_started = time.perf_counter()

    llm_response: Optional[str] = None
    llm_error: Optional[str] = None
    llm_timed_out = False
    resolved_llm_model: Optional[str] = payload.llm_model if payload.use_llm else None
    installed_ollama_models: list[str] = []
    generation_metadata: dict[str, Any] = {}
    if payload.use_llm:
        try:
            can_ai_log(
                "llm_resolution_started",
                session=session_id,
                requested_model=payload.llm_model,
            )
            resolved_llm_model, installed_ollama_models = await resolve_llm_model(payload.llm_model)
            prompt = build_llm_prompt(
                session_dict,
                marker_dicts,
                candidates,
                analysis_mode,
                baseline_profile,
                baseline_context,
                ml_context,
                vector_context,
            )
            can_ai_log(
                "llm_generation_started",
                session=session_id,
                resolved_model=resolved_llm_model,
                installed_models=len(installed_ollama_models),
                prompt_chars=len(prompt),
                elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
            )
            phase_started = time.perf_counter()
            try:
                async with asyncio.timeout(LLM_DEADLINE_SECONDS):
                    result = await call_ollama_generate(
                        resolved_llm_model,
                        prompt,
                    )
            except TimeoutError as exc:
                llm_timed_out = True
                raise RuntimeError(
                    f"Ollama exceeded the {LLM_DEADLINE_SECONDS:.0f}s "
                    "production response budget"
                ) from exc
            if result.get("done_reason") != "stop":
                print(
                    "[can-ai] LLM generation ended unexpectedly "
                    f"session={session_id} "
                    f"reason={result.get('done_reason')} "
                    f"output_tokens={result.get('eval_count')}",
                    flush=True,
                )
            generation_metadata = {
                "done": result.get("done"),
                "done_reason": result.get("done_reason"),
                "total_duration": result.get("total_duration"),
                "load_duration": result.get("load_duration"),
                "prompt_eval_count": result.get("prompt_eval_count"),
                "prompt_eval_duration": result.get("prompt_eval_duration"),
                "eval_count": result.get("eval_count"),
                "eval_duration": result.get("eval_duration"),
            }

            can_ai_log(
                "llm_generation_completed",
                session=session_id,
                resolved_model=resolved_llm_model,
                done=result.get("done"),
                done_reason=result.get("done_reason"),
                prompt_tokens=result.get("prompt_eval_count"),
                output_tokens=result.get("eval_count"),
                elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
            )
            phase_started = time.perf_counter()

            llm_response = result.get("response", "")

            text = result.get("response")
            if isinstance(text, str) and text.strip():
                llm_response = text.strip()
            else:
                raise RuntimeError(f"Ollama returned no usable response: {result}")

        except Exception as exc:
            llm_error = f"{type(exc).__name__}: {exc}"
            can_ai_log(
                "llm_generation_failed",
                session=session_id,
                requested_model=payload.llm_model,
                resolved_model=resolved_llm_model,
                error_type=type(exc).__name__,
                error=repr(exc),
                elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
            )
            llm_response = None

    fallback_report = build_fallback_report(
        session_id=session_id,
        analysis_mode=analysis_mode,
        frames_count=len(frames),
        markers_count=len(marker_dicts),
        candidates=candidates,
        baseline_profile=baseline_profile,
        baseline_context=baseline_context,
        ml_context=ml_context,
        vector_context=vector_context,
    )

    repaired_report_sections: list[int] = []
    if llm_response:
        report_content, repaired_report_sections = (
            ensure_complete_five_section_report(
                llm_response,
                fallback_report,
            )
        )
    else:
        report_content = fallback_report

    report_sections_present = sorted(
        split_numbered_report_sections(report_content).keys()
    )

    can_ai_log(
        "report_selected",
        session=session_id,
        source="llm" if llm_response else "fallback",
        report_chars=len(report_content),
        report_sections=report_sections_present,
        repaired_sections=repaired_report_sections,
        llm_error=llm_error,
    )

    response_candidates = [
        compact_candidate_payload(
            candidate,
            include_byte_evidence=(
                index < MAX_RESPONSE_EVIDENCE_CANDIDATES
            ),
        )
        for index, candidate in enumerate(
            candidates[:MAX_RESPONSE_CANDIDATES]
        )
    ]
    response_heatmap = compact_heatmap_payload(candidates)

    persisted_top_candidates = [
        compact_candidate_payload(
            candidate,
            include_byte_evidence=True,
        )
        for candidate in candidates[:MAX_PERSISTED_REPORT_CANDIDATES]
    ]
    persisted_heatmap = response_heatmap

    can_ai_log(
        "response_compacted",
        session=session_id,
        candidates_total=len(candidates),
        candidates_returned=len(response_candidates),
        evidence_candidates=min(
            len(response_candidates),
            MAX_RESPONSE_EVIDENCE_CANDIDATES,
        ),
        heatmap_ids=len(response_heatmap),
    )

    persisted_candidate_ids = {
        candidate.can_id
        for candidate in candidates[:MAX_DELTA_CANDIDATES_TO_PERSIST]
    }
    deltas_to_persist = [
        delta
        for delta in deltas
        if delta["can_id"] in persisted_candidate_ids
    ][:MAX_DELTAS_TO_PERSIST]

    if payload.persist:
        can_ai_log(
            "persistence_started",
            session=session_id,
            candidates=len(candidates),
            deltas_computed=len(deltas),
            deltas_selected=len(deltas_to_persist),
        )
        phase_started = time.perf_counter()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute("DELETE FROM can_frame_deltas WHERE session_id = $1", session_id)
                await conn.execute("DELETE FROM can_id_features WHERE session_id = $1", session_id)
                await conn.execute("DELETE FROM can_id_correlations WHERE session_id = $1", session_id)

                if deltas_to_persist:
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
                            for d in deltas_to_persist
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
                                "baseline_applied": c.baseline_applied,
                                "baseline_session_id": c.baseline_session_id,
                                "baseline_id_present": c.baseline_id_present,
                                "baseline_overlap_score": c.baseline_overlap_score,
                                "baseline_penalty": c.baseline_penalty,
                                "baseline_adjusted_change_ratio": (
                                    c.baseline_adjusted_change_ratio
                                ),
                                "confidence_before_baseline": (
                                    c.confidence_before_baseline
                                ),
                                "baseline_evidence": c.baseline_evidence,
                                "ml_applied": c.ml_applied,
                                "ml_model_id": c.ml_model_id,
                                "ml_probability": c.ml_probability,
                                "ml_blend_weight": c.ml_blend_weight,
                                "confidence_before_ml": c.confidence_before_ml,
                                "ml_feature_vector": c.ml_feature_vector,
                                "confidence_before_label_prior": (
                                    c.confidence_before_label_prior
                                ),
                                "label_prior_applied": c.label_prior_applied,
                                "label_prior": c.label_prior,
                                "raw_marker_fraction": c.raw_marker_fraction,
                                "marker_window_coverage": c.marker_window_coverage,
                                "correlation_lift": c.correlation_lift,
                                "byte_transition_score": c.byte_transition_score,
                                "byte_transition_evidence": c.byte_transition_evidence,
                                "change_ratio": c.change_ratio,
                                "changed_frame_count": c.changed_frame_count,
                                "changed_frame_ratio": c.changed_frame_ratio,
                                "byte_entropy": c.byte_entropy,
                                "byte_evidence": [
                                    item.model_dump()
                                    for item in c.byte_evidence
                                ],
                                "byte_role_hypotheses": [
                                    item.model_dump()
                                    for item in c.byte_role_hypotheses
                                ],
                                "signal_hypotheses": [
                                    item.model_dump()
                                    for item in c.signal_hypotheses[:12]
                                ],
                                "field_hypotheses": [
                                    item.model_dump()
                                    for item in c.field_hypotheses[:12]
                                ],
                                "analyzer_profile": c.analyzer_profile,
                                "quick_id_method": c.quick_id_method,
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
                                "baseline_applied": c.baseline_applied,
                                "baseline_session_id": c.baseline_session_id,
                                "baseline_id_present": c.baseline_id_present,
                                "baseline_overlap_score": c.baseline_overlap_score,
                                "baseline_penalty": c.baseline_penalty,
                                "baseline_adjusted_change_ratio": (
                                    c.baseline_adjusted_change_ratio
                                ),
                                "confidence_before_baseline": (
                                    c.confidence_before_baseline
                                ),
                                "baseline_evidence": c.baseline_evidence,
                                "ml_applied": c.ml_applied,
                                "ml_model_id": c.ml_model_id,
                                "ml_probability": c.ml_probability,
                                "ml_blend_weight": c.ml_blend_weight,
                                "confidence_before_ml": c.confidence_before_ml,
                                "ml_feature_vector": c.ml_feature_vector,
                                "confidence_before_label_prior": (
                                    c.confidence_before_label_prior
                                ),
                                "label_prior_applied": c.label_prior_applied,
                                "label_prior": c.label_prior,
                                "raw_marker_fraction": c.raw_marker_fraction,
                                "marker_window_coverage": c.marker_window_coverage,
                                "correlation_lift": c.correlation_lift,
                                "byte_transition_score": c.byte_transition_score,
                                "byte_transition_evidence": c.byte_transition_evidence,
                                "change_ratio": c.change_ratio,
                                "changed_frame_count": c.changed_frame_count,
                                "changed_frame_ratio": c.changed_frame_ratio,
                                "byte_entropy": c.byte_entropy,
                                "byte_evidence": [
                                    item.model_dump()
                                    for item in c.byte_evidence
                                ],
                                "byte_role_hypotheses": [
                                    item.model_dump()
                                    for item in c.byte_role_hypotheses
                                ],
                                "signal_hypotheses": [
                                    item.model_dump()
                                    for item in c.signal_hypotheses[:12]
                                ],
                                "field_hypotheses": [
                                    item.model_dump()
                                    for item in c.field_hypotheses[:12]
                                ],
                                "analyzer_profile": c.analyzer_profile,
                                "quick_id_method": c.quick_id_method,
                            }),
                        )
                        for c in candidates
                    ],
                )

                existing_report = await conn.fetchrow(
                    """
                    SELECT id, metadata
                    FROM session_reports
                    WHERE session_id = $1
                      AND report_type = 'ai_analysis'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    session_id,
                )
                previous_report_metadata = metadata_dict(
                    existing_report.get("metadata")
                    if existing_report
                    else None
                )
                analysis_revision = int(
                    previous_report_metadata.get("analysis_revision", 0) or 0
                ) + 1

                report_title = (
                    f"CAN baseline profile for {session_dict.get('vehicle_slug')} session {session_id}"
                    if baseline_mode
                    else f"AI CAN analysis for {session_dict.get('vehicle_slug')} session {session_id}"
                )
                report_metadata = {
                    "vehicle_slug": session_dict.get("vehicle_slug"),
                    "analysis_mode": analysis_mode,
                    "analysis_revision": analysis_revision,
                    "session_integrity": {
                        "capture_status": session_dict.get("capture_status"),
                        "finalized_at": session_dict.get("finalized_at"),
                        "final_frame_id": session_dict.get("final_frame_id"),
                        "final_frame_count": session_dict.get("final_frame_count"),
                        "final_marker_count": session_dict.get("final_marker_count"),
                        "capture_quality": session_dict.get("capture_quality"),
                        "timestamp_authority": "server",
                    },
                    "byte_hypothesis_count": sum(
                        len(candidate.byte_role_hypotheses)
                        + len(candidate.signal_hypotheses)
                        for candidate in candidates
                    ),
                    "field_hypothesis_count": sum(
                        len(candidate.field_hypotheses)
                        for candidate in candidates
                    ),
                    "analyzer_profile": analyzer_profile,
                    "quick_id_method": marker_selection.get("quick_id_method"),
                    "report_storage": "replace_latest_per_session",
                    "baseline_profile": baseline_profile,
                    "target_expected": not baseline_mode,
                    "baseline_subtraction": baseline_context,
                    "supervised_ml": ml_context,
                    "label_priors": label_prior_context,
                    "vector_memory": vector_context,
                    "marker_window_ms": payload.marker_window_ms,
                    "marker_selection": marker_selection,
                    "frame_selection": frame_selection,
                    "confidence_semantics": CONFIDENCE_SEMANTICS,
                    "frames_analyzed": len(frames),
                    "frames_available": frame_selection.get("total_frames"),
                    "markers": len(marker_dicts),
                    "model": resolved_llm_model,
                    "ollama_url": OLLAMA_URL,
                    "llm_deadline_seconds": LLM_DEADLINE_SECONDS,
                    "llm_http_read_timeout_seconds": LLM_HTTP_READ_TIMEOUT_SECONDS,
                    "llm_num_ctx": LLM_NUM_CTX,
                    "llm_num_predict": LLM_NUM_PREDICT,
                    "llm_candidate_limit": LLM_CANDIDATE_LIMIT,
                    "llm_byte_evidence_limit": LLM_BYTE_EVIDENCE_LIMIT,
                    "ollama_keep_alive": OLLAMA_KEEP_ALIVE,
                    "llm_requested": payload.use_llm,
                    "llm_succeeded": llm_response is not None,
                    "analysis_source": "llm" if llm_response else "fallback",
                    "llm_error": llm_error,
                    "llm_timed_out": llm_timed_out,
                    "report_sections_present": report_sections_present,
                    "report_repaired_sections": repaired_report_sections,
                    "marker_window_coverage": (
                        candidates[0].marker_window_coverage
                        if candidates
                        else 0.0
                    ),
                    "generation": generation_metadata,
                    "deltas_computed": len(deltas),
                    "deltas_persisted": len(deltas_to_persist),
                    "top_candidates": persisted_top_candidates,
                    "heatmap": persisted_heatmap,
                }

                await conn.execute(
                    """
                    DELETE FROM can_signal_hypotheses auto_role
                    WHERE auto_role.session_id = $1
                      AND auto_role.source = 'auto_analysis'
                      AND NOT EXISTS (
                          SELECT 1
                          FROM can_signal_hypotheses human_role
                          WHERE human_role.session_id = auto_role.session_id
                            AND human_role.source = 'human'
                            AND human_role.can_id = auto_role.can_id
                            AND human_role.byte_index = auto_role.byte_index
                            AND COALESCE(human_role.bit_mask, 0) = COALESCE(auto_role.bit_mask, 0)
                            AND human_role.hypothesis_kind = auto_role.hypothesis_kind
                      )
                    """,
                    session_id,
                )
                hypothesis_rows = []
                for candidate in candidates:
                    for hypothesis in candidate.byte_role_hypotheses:
                        if hypothesis.source == "human":
                            # The canonical human row already exists. Preserve
                            # any previous auto suggestion for side-by-side
                            # review instead of duplicating the human decision
                            # as an auto_analysis record.
                            continue
                        bit_mask = hypothesis.bit_mask
                        hypothesis_key = (
                            f"{candidate.can_id}:{hypothesis.byte_index}:"
                            f"{bit_mask if bit_mask is not None else 0}:"
                            f"{hypothesis.hypothesis_kind}"
                        )
                        hypothesis_rows.append((
                            session_id,
                            session["vehicle_id"],
                            session["mission_id"],
                            session_dict.get("mission_code"),
                            hypothesis_key,
                            candidate.can_id,
                            hypothesis.byte_index,
                            bit_mask,
                            hypothesis.hypothesis_kind,
                            None,
                            hypothesis.confidence,
                            hypothesis.reason,
                            json_dumps(hypothesis.metrics),
                            json_dumps({
                                "analysis_mode": analysis_mode,
                                "can_id_hex": candidate.can_id_hex,
                                "auto_detected": True,
                            }),
                        ))
                    for field in candidate.field_hypotheses[:12]:
                        field_key = (
                            f"{candidate.can_id}:{field.start_byte}:0:"
                            f"numeric_field_candidate:{field.width_bits}:"
                            f"{field.endianness}:{int(field.signed)}"
                        )
                        hypothesis_rows.append((
                            session_id,
                            session["vehicle_id"],
                            session["mission_id"],
                            session_dict.get("mission_code"),
                            field_key,
                            candidate.can_id,
                            field.start_byte,
                            None,
                            "numeric_field_candidate",
                            analyzer_profile,
                            field.score,
                            field.reason,
                            json_dumps(field.model_dump()),
                            json_dumps({
                                "analysis_mode": analysis_mode,
                                "analyzer_profile": analyzer_profile,
                                "can_id_hex": candidate.can_id_hex,
                                "auto_detected": True,
                                "width_bits": field.width_bits,
                                "endianness": field.endianness,
                                "signed": field.signed,
                                "quick_id_method": candidate.quick_id_method,
                            }),
                        ))
                    for signal in candidate.signal_hypotheses[:12]:
                        signal_key = (
                            f"{candidate.can_id}:{signal.byte_index}:"
                            f"{signal.bit_mask}:boolean_signal_candidate:"
                            f"{','.join(sorted(signal.action_groups))}"
                        )
                        hypothesis_rows.append((
                            session_id,
                            session["vehicle_id"],
                            session["mission_id"],
                            session_dict.get("mission_code"),
                            signal_key,
                            candidate.can_id,
                            signal.byte_index,
                            signal.bit_mask,
                            "boolean_signal_candidate",
                            ",".join(sorted(signal.action_groups)),
                            signal.score,
                            signal.reason,
                            json_dumps(signal.model_dump()),
                            json_dumps({
                                "analysis_mode": analysis_mode,
                                "can_id_hex": candidate.can_id_hex,
                                "auto_detected": True,
                                "bit_index": signal.bit_index,
                                "quick_id_method": candidate.quick_id_method,
                                "action_groups": sorted(signal.action_groups),
                            }),
                        ))
                if hypothesis_rows:
                    await conn.executemany(
                        """
                        INSERT INTO can_signal_hypotheses (
                            session_id, vehicle_id, mission_id, mission_code,
                            hypothesis_key, can_id, byte_index, bit_mask,
                            hypothesis_kind, action_group, confidence, source, notes,
                            evidence, metadata
                        ) VALUES (
                            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                            'auto_analysis',$12,$13::jsonb,$14::jsonb
                        )
                        ON CONFLICT (session_id, hypothesis_key)
                        DO UPDATE SET
                            confidence = EXCLUDED.confidence,
                            notes = CASE
                                WHEN can_signal_hypotheses.source = 'human'
                                    THEN can_signal_hypotheses.notes
                                ELSE EXCLUDED.notes
                            END,
                            evidence = CASE
                                WHEN can_signal_hypotheses.source = 'human'
                                    THEN can_signal_hypotheses.evidence || EXCLUDED.evidence
                                ELSE EXCLUDED.evidence
                            END,
                            metadata = can_signal_hypotheses.metadata || EXCLUDED.metadata,
                            updated_at = now()
                        """,
                        hypothesis_rows,
                    )

                if existing_report:
                    report_row = await conn.fetchrow(
                        """
                        UPDATE session_reports
                        SET
                            title = $2,
                            content = $3,
                            metadata = $4::jsonb,
                            created_at = NOW()
                        WHERE id = $1
                        RETURNING id
                        """,
                        existing_report["id"],
                        report_title,
                        report_content,
                        json_dumps(report_metadata),
                    )
                    await conn.execute(
                        """
                        DELETE FROM session_reports
                        WHERE session_id = $1
                          AND report_type = 'ai_analysis'
                          AND id <> $2
                        """,
                        session_id,
                        report_row["id"],
                    )
                else:
                    report_row = await conn.fetchrow(
                        """
                        INSERT INTO session_reports (
                            session_id,
                            report_type,
                            title,
                            content,
                            metadata
                        )
                        VALUES ($1, 'ai_analysis', $2, $3, $4::jsonb)
                        RETURNING id
                        """,
                        session_id,
                        report_title,
                        report_content,
                        json_dumps(report_metadata),
                    )


                if payload.use_llm and llm_response:
                    prompt = build_llm_prompt(
                        session_dict,
                        marker_dicts,
                        candidates,
                        analysis_mode,
                        baseline_profile,
                        baseline_context,
                        ml_context,
                        vector_context,
                    )
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
                            "baseline_subtraction": baseline_context,
                            "supervised_ml": ml_context,
                            "label_priors": label_prior_context,
                            "vector_memory": vector_context,
                            "marker_window_ms": payload.marker_window_ms,
                        }),
                    )

                embedding_inserted = False
                embedding_error = vector_context.get("error")
                if query_embedding is not None and embedding_text is not None:
                    try:
                        await conn.execute(
                            """
                            DELETE FROM signal_embeddings
                            WHERE session_id = $1
                              AND COALESCE(metadata->>'model', '') = $2
                              AND COALESCE(metadata->>'analysis_mode', '') = $3
                            """,
                            session_id,
                            payload.embed_model,
                            analysis_mode,
                        )
                        await conn.execute(
                            """
                            INSERT INTO signal_embeddings (
                                vehicle_id,
                                session_id,
                                text,
                                embedding,
                                metadata
                            )
                            VALUES ($1, $2, $3, $4::vector, $5::jsonb)
                            """,
                            session["vehicle_id"],
                            session_id,
                            embedding_text,
                            vector_literal(query_embedding),
                            json_dumps({
                                "schema_version": VECTOR_MEMORY_SCHEMA_VERSION,
                                "model": payload.embed_model,
                                "dimension": len(query_embedding),
                                "vehicle_slug": session_dict.get("vehicle_slug"),
                                "mission_code": session_dict.get("mission_code"),
                                "bus_interface": session_dict.get("bus_interface"),
                                "bus_mode": session_dict.get("bus_mode"),
                                "capture_kind": capture_kind_for(
                                    session_dict.get("bus_interface"),
                                    session_dict.get("bus_mode"),
                                ),
                                "analysis_mode": analysis_mode,
                                "marker_window_ms": payload.marker_window_ms,
                                "baseline_subtraction": baseline_context,
                                "supervised_ml": ml_context,
                                "label_priors": label_prior_context,
                                "retrieved_session_ids": [
                                    match.get("session_id")
                                    for match in vector_context.get("matches", [])
                                    if isinstance(match, dict)
                                ],
                                "top_candidates": [
                                    embedding_candidate_metadata(candidate)
                                    for candidate in candidates[:10]
                                ],
                            }),
                        )
                        embedding_inserted = True
                    except Exception as exc:
                        embedding_error = f"{type(exc).__name__}: {exc}"

                vector_context["stored"] = embedding_inserted
                vector_context["storage_error"] = embedding_error
                await conn.execute(
                    """
                    UPDATE session_reports
                    SET metadata = metadata || jsonb_build_object(
                        'vector_memory', $2::jsonb
                    )
                    WHERE id = $1
                    """,
                    report_row["id"],
                    json_dumps(vector_context),
                )

                can_ai_log(
                    "vector_memory_storage_completed",
                    session=session_id,
                    model=payload.embed_model,
                    inserted=embedding_inserted,
                    error=embedding_error,
                )


        can_ai_log(
            "persistence_completed",
            session=session_id,
            elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
        )

    can_ai_log(
        "analysis_completed",
        session=session_id,
        source="llm" if llm_response else "fallback",
        candidates=len(candidates),
        persisted=payload.persist,
        total_elapsed_ms=round(
            (time.perf_counter() - analysis_started) * 1000,
            2,
        ),
    )

    return {
        "generation": generation_metadata,
        "ok": True,
        "session_id": str(session_id),
        "analysis_mode": analysis_mode,
        "analyzer_profile": analyzer_profile,
        "session_integrity": {
            "capture_status": session_dict.get("capture_status"),
            "finalized_at": session_dict.get("finalized_at"),
            "final_frame_id": session_dict.get("final_frame_id"),
            "final_frame_count": session_dict.get("final_frame_count"),
            "final_marker_count": session_dict.get("final_marker_count"),
            "capture_quality": session_dict.get("capture_quality"),
            "timestamp_authority": "server",
        },
        "byte_hypothesis_count": sum(
            len(candidate.byte_role_hypotheses)
            + len(candidate.signal_hypotheses)
            for candidate in candidates
        ),
        "field_hypothesis_count": sum(
            len(candidate.field_hypotheses)
            for candidate in candidates
        ),
        "baseline_profile": baseline_profile,
        "baseline_subtraction": baseline_context,
        "supervised_ml": ml_context,
        "label_priors": label_prior_context,
        "target_expected": not baseline_mode,
        "frames_analyzed": len(frames),
        "short_dlc_frames": short_dlc_frames,
        "invalid_width_frames": invalid_width_frames,
        "markers": len(marker_dicts),
        "selected_action_markers": marker_selection.get("action_markers"),
        "marker_selection": marker_selection,
        "quick_id_method": marker_selection.get("quick_id_method"),
        "marker_window_ms": payload.marker_window_ms,
        "marker_window_coverage": (
            candidates[0].marker_window_coverage
            if candidates
            else 0.0
        ),
        "vector_memory": vector_context,
        "frame_selection": frame_selection,
        "frames_available": frame_selection.get("total_frames"),
        "confidence_semantics": CONFIDENCE_SEMANTICS,
        "candidate_count": len(candidates),
        "candidates": response_candidates,
        "heatmap": response_heatmap,
        "response_detail": {
            "candidate_limit": MAX_RESPONSE_CANDIDATES,
            "evidence_candidate_limit": MAX_RESPONSE_EVIDENCE_CANDIDATES,
            "byte_evidence_per_candidate": MAX_RESPONSE_BYTE_EVIDENCE,
            "heatmap_includes_byte_evidence": False,
        },

        # LLM status
        "llm_requested": payload.use_llm,
        "llm_succeeded": llm_response is not None,
        "llm_available": llm_response is not None,
        "llm_model": resolved_llm_model,
        "llm_runtime": {
            "ollama_url": OLLAMA_URL,
            "deadline_seconds": LLM_DEADLINE_SECONDS,
            "http_read_timeout_seconds": LLM_HTTP_READ_TIMEOUT_SECONDS,
            "num_ctx": LLM_NUM_CTX,
            "num_predict": LLM_NUM_PREDICT,
            "candidate_limit": LLM_CANDIDATE_LIMIT,
            "byte_evidence_limit": LLM_BYTE_EVIDENCE_LIMIT,
            "keep_alive": OLLAMA_KEEP_ALIVE,
            "baseline_penalty_weight": BASELINE_PENALTY_WEIGHT,
            "ml_blend_weight": ML_BLEND_WEIGHT,
        },
        "llm_error": llm_error,
        "llm_timed_out": llm_timed_out,
        "report_sections_present": report_sections_present,
        "report_repaired_sections": repaired_report_sections,
        "installed_ollama_models": installed_ollama_models,
        "deltas_computed": len(deltas),
        "deltas_persisted": (
            len(deltas_to_persist)
            if payload.persist
            else 0
        ),

        # Important: always return something the UI can render.
        "analysis": report_content,
        "analysis_source": "llm" if llm_response else "fallback",

        "persisted": payload.persist,
    }

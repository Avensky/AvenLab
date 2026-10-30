# CAN analysis

Evidence extraction, byte/field/bit hypotheses, baseline subtraction, vector memory, Ollama reporting and session analysis.

`__init__.py` is the public package API (the Python equivalent of index.ts).
`shared.py` owns one router/configuration/schema set. Importing the package registers routes; it does not start capture, inference or database work.

| Module | Functions / classes to edit |
| --- | --- |
| [baseline.py](baseline.py) | `normalized_byte_change_rates`, `baseline_feature_map`, `baseline_row_is_valid`, `load_baseline_reference`, `apply_baseline_subtraction` |
| [bytes.py](bytes.py) | `byte_encoding_hint`, `byte_role_map`, `byte_role_score_factor`, `byte_inverse_transition_evidence`, `strongest_byte_transition`, `build_byte_evidence`, `marker_polarity`, `has_opposing_action_markers`, `combined_marker_metadata`, `marker_expected_value`, `normalize_analyzer_profile`, `resolve_analyzer_profile`, `quick_id_method_for_profile`, `median_float`, `median_absolute_deviation` |
| [fields.py](fields.py) | `field_value`, `field_specs`, `pairwise_monotonicity`, `build_field_signal_hypotheses`, `build_bit_signal_hypotheses` |
| [memory.py](memory.py) | `compact_byte_evidence`, `compact_byte_roles`, `compact_signal_hypothesis`, `embedding_candidate_metadata`, `build_embedding_document`, `vector_literal`, `retrieve_vector_memory`, `apply_vector_historical_support`, `vector_memory_prompt_text`, `compact_candidate_payload` |
| [ollama.py](ollama.py) | `is_embedding_only_model`, `list_ollama_models`, `resolve_llm_model`, `call_ollama_generate`, `call_ollama_embed` |
| [queries.py](queries.py) | `get_ai_status`, `load_analysis_frame_rows` |
| [reports.py](reports.py) | `build_baseline_profile`, `build_fallback_report`, `compact_heatmap_payload`, `build_llm_prompt` |
| [results.py](results.py) | `get_session_analysis`, `get_mission_progress`, `get_latest_session_for_mission`, `delete_can_session`, `export_session` |
| [roles.py](roles.py) | `_modulo_counter_score`, `classify_byte_roles`, `load_human_byte_hypotheses`, `apply_human_byte_hypotheses`, `rescore_candidates_after_human_byte_roles` |
| [run.py](run.py) | `analyze_session` |
| [scoring.py](scoring.py) | `analyze_frames` |
| [shared.py](shared.py) | `env_float`, `env_int`, `AnalyzeSessionRequest`, `MarkerObservation`, `ByteEvidence`, `ByteRoleHypothesis`, `FieldMarkerObservation`, `FieldSignalHypothesis`, `BitSignalHypothesis`, `Candidate`, `FrameRow` |
| [utilities.py](utilities.py) | `json_dumps`, `can_hex`, `entropy`, `normalize_data`, `can_ai_log`, `frame_byte`, `metadata_dict`, `normalize_analysis_mode`, `infer_analysis_mode`, `is_baseline_mode`, `mode_value`, `top_count_map`, `dominant_count_fraction`, `merge_intervals`, `build_interval_index`, `interval_coverage_fraction`, `split_numbered_report_sections`, `ensure_complete_five_section_report`, `timestamp_in_intervals`, `timestamp_in_any_window`, `normalized_marker_type`, `marker_action_key`, `classify_marker_role`, `select_analysis_markers`, `marker_action_duration_ms`, `strict_consensus`, `score_candidate_confidence`, `capture_kind_for`, `source_label_for`, `safe_float` |

## Where to change behavior

Edit bytes.py for byte transitions/evidence, fields.py for numeric/bit signal hypotheses, roles.py for counter/checksum/human role weighting, and baseline.py for reference subtraction. utilities.py owns marker windows/metadata helpers. memory.py owns vector retrieval; ollama.py owns model calls; reports.py owns report/prompt formatting. scoring.py assembles candidates; run.py orchestrates one analysis request. queries.py/results.py expose lookup/progress/export routes.

## Editing rules

Keep the same router prefix and request/response shapes. Behavior modules import concrete dependencies; package entry points register endpoint modules once. Never copy ACTIVE_CAPTURES, the marker queue, session clock or model cache into another module. Preserve Pi/server marker timestamps and keep fake/generated capture explicitly labeled.

Run `python -m unittest discover -s tests -v` from data-server. A real PostgreSQL/SocketCAN/Ollama integration run is separate from these offline tests. The reorganization retained all 192 function/class bodies and the 34-path OpenAPI contract.

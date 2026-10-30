# CAN capture

Session setup, ordered markers, real SocketCAN capture, simulated frames and playback.

`__init__.py` is the public package API (the Python equivalent of index.ts).
`shared.py` owns one router/configuration/schema set. Importing the package registers routes; it does not start capture, inference or database work.

| Module | Functions / classes to edit |
| --- | --- |
| [identity.py](identity.py) | `slugify`, `json_object`, `vehicle_payload_value`, `normalized_vehicle_payload`, `ensure_vehicle`, `ensure_recon_mission`, `optional_int`, `recon_step_columns`, `upsert_recon_step`, `ensure_recon_steps`, `ensure_marker_step` |
| [playback.py](playback.py) | `parse_can_id_filter`, `parse_byte_value_filter`, `playback_filter_cte`, `get_session_playback_meta`, `get_session_playback_slices`, `get_session_frames`, `get_session_summary` |
| [sessions.py](sessions.py) | `can_status`, `start_session`, `list_vehicles`, `post_marker`, `finalize_session_capture`, `finalize_session`, `stop_session` |
| [shared.py](shared.py) | `CaptureState`, `StartSessionRequest`, `MarkerRequest`, `StopSessionRequest` |
| [simulation.py](simulation.py) | `clamp_byte`, `frame`, `marker_metadata_value`, `marker_number`, `inferred_step_state`, `simulation_signal_value`, `simulation_action_duration_ms`, `encoded_u8`, `encoded_u16`, `baseline_frames`, `mission_frames`, `insert_raw_frame`, `insert_fake_burst` |
| [socketcan.py](socketcan.py) | `normalize_mode`, `should_use_fake_capture`, `capture_kind_for`, `can_interface_state`, `parse_candump_line`, `insert_socketcan_batch`, `capture_socketcan_session`, `start_socketcan_capture`, `stop_socketcan_capture`, `server_capture_timestamp_ms`, `runtime_metadata` |

## Where to change behavior

To change vehicle upserts, edit identity.py. Real candump parsing/process lifecycle and the server capture clock are in socketcan.py. Generated electronics frames are in simulation.py. Start/mark/finalize routes are in sessions.py. Playback filtering/pagination lives in playback.py. Keep the ACTIVE_CAPTURES dictionary in shared.py and keep real/generated capture kinds explicit.

## Editing rules

Keep the same router prefix and request/response shapes. Behavior modules import concrete dependencies; package entry points register endpoint modules once. Never copy ACTIVE_CAPTURES, the marker queue, session clock or model cache into another module. Preserve Pi/server marker timestamps and keep fake/generated capture explicitly labeled.

Run `python -m unittest discover -s tests -v` from data-server. A real PostgreSQL/SocketCAN/Ollama integration run is separate from these offline tests. The reorganization retained all 192 function/class bodies and the 34-path OpenAPI contract.

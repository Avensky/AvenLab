# CAN learning

Candidate features, supervised calibration, human labels, grouped training and model status.

`__init__.py` is the public package API (the Python equivalent of index.ts).
`shared.py` owns one router/configuration/schema set. Importing the package registers routes; it does not start capture, inference or database work.

| Module | Functions / classes to edit |
| --- | --- |
| [features.py](features.py) | `_json_dumps`, `_json_object`, `_model_or_dict`, `_can_hex`, `_capture_kind`, `_require_ml_admin`, `_validated_positive_label`, `ml_configuration`, `_sigmoid`, `_safe_probability`, `_feature_vector_from_values`, `candidate_feature_vector`, `_persisted_feature_vector`, `_standardization_parameters`, `_standardized_vector`, `_train_logistic_model`, `_predict`, `_binary_metrics`, `_evaluate`, `_cross_validate_grouped`, `_train_and_evaluate` |
| [labels.py](labels.py) | `get_session_hypotheses`, `upsert_signal_hypothesis`, `label_candidate`, `get_session_ml_labels` |
| [models.py](models.py) | `ensure_ml_tables`, `load_active_ml_model`, `apply_supervised_model`, `load_candidate_label_priors`, `apply_candidate_label_priors` |
| [shared.py](shared.py) | `_env_float`, `_env_int`, `CandidateLabelRequest`, `SignalHypothesisRequest`, `TrainCandidateModelRequest` |
| [training.py](training.py) | `_load_training_rows`, `_training_examples`, `get_ml_readiness`, `train_candidate_model`, `get_ml_status` |

## Where to change behavior

features.py owns feature vectors, standardization and grouped evaluation math. models.py loads/applies active models and historical label priors. labels.py accepts human evidence. training.py selects examples, readiness and training/status routes. Keep schema/configuration and router ownership in shared.py; a model score must not become an unlabeled ground-truth vehicle signal.

## Editing rules

Keep the same router prefix and request/response shapes. Behavior modules import concrete dependencies; package entry points register endpoint modules once. Never copy ACTIVE_CAPTURES, the marker queue, session clock or model cache into another module. Preserve Pi/server marker timestamps and keep fake/generated capture explicitly labeled.

Run `python -m unittest discover -s tests -v` from data-server. A real PostgreSQL/SocketCAN/Ollama integration run is separate from these offline tests. The reorganization retained all 192 function/class bodies and the 34-path OpenAPI contract.

# Service composition

| Path | Edit here for |
| --- | --- |
| main.py | Health, generic AI/database endpoints and router composition |
| db.py | Database pool, SQL helpers and health/smoke checks |
| can/capture | Vehicle/session setup, server clock, SocketCAN and simulated capture, playback |
| can/analysis | CAN evidence, baseline, memory, reporting and analysis routes |
| can/learning | Candidate labels, features, training and model activation |
| services | Generic Ollama client |
| exports | CSV/PDF helper output |

Each CAN package registers one shared router through __init__.py. Do not start
background capture at import time. Read the package README before changing it.

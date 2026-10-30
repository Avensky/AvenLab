# CAN feature map

[capture](capture/README.md) → recorded frames / server-timed markers.
[analysis](analysis/README.md) → evidence / hypotheses / reports.
[learning](learning/README.md) → labels / calibrated models.

`status.py` probes service/interface availability. The old empty capture/session/
decoder stubs and giant can_router/can_ai_router/can_ml_service files have been
replaced by these packages. Change imports through each public __init__.py.
The existing HTTP paths are preserved; frontend clients do not change endpoints.

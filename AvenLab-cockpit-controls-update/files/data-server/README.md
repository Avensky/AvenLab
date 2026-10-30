# Data service

`app/main.py` composes FastAPI. `app/can/capture` owns recording/session/playback;
`analysis` owns evidence and reporting; `learning` owns labels and models.
Each package has a public `__init__.py` and a function-by-module editing guide.
`app/db.py` owns database access/pooling. `db/` contains SQL schema assets.
`app/services/ollama_client.py` is the generic Ollama client; CAN analysis owns
its specialized prompt/evidence flow. `app/exports` holds export helpers.

Install requirements into a virtual environment, then run `uvicorn app.main:app
--reload --host 127.0.0.1 --port 8001` from this folder. Configure the existing
service environment and PostgreSQL before capture. `APP_ENV=production` selects
production behavior; missing/other values use development defaults. Real CAN
interface access and AI inference need their existing host services.

Run offline checks with `python -m unittest discover -s tests -v`. Keep research
session ownership separate from Rust gameplay mission state and theme rewards.

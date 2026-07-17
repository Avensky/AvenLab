# app/main.py
from typing import Any, Dict, Optional

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.can.can_ai_router import router as can_ai_router
from app.can.can_router import APP_ENV, IS_PRODUCTION, RUNTIME_ENV, router as can_router
from app.can.status import get_can_status
from app.db import check_database, close_db, fetch, fetchrow, jsonb_dumps, smoke_test_database
from app.services.ollama_client import OLLAMA_URL, ask_question, embed_text

app = FastAPI(title="Aven Data Server")

# Only APP_ENV matters:
#   APP_ENV=production -> production=True
#   anything else / missing -> development=True
#
# In production, prefer same-origin hosting or a reverse proxy for the frontend.
# These localhost origins keep Vite dev working without adding another env var.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Always include the CAN router. The router decides runtime behavior using only
# APP_ENV=production; otherwise it assumes development/virtual CAN.
app.include_router(can_router)
app.include_router(can_ai_router)


@app.on_event("shutdown")
async def shutdown_db_pool():
    await close_db()


@app.get("/db/health")
async def db_health():
    return await check_database()


@app.post("/db/smoke-test")
async def db_smoke_test(persist: bool = False):
    return await smoke_test_database(persist=persist)



class EmbedRequest(BaseModel):
    text: str


class AskRequest(BaseModel):
    prompt: str


class GenerateRequest(BaseModel):
    prompt: str
    model: str = "qwen2.5:7b"


class CANQuestion(BaseModel):
    context: str
    question: str


class StartSessionRequest(BaseModel):
    vehicle_slug: str
    mission_code: Optional[str] = None
    label: Optional[str] = None
    bus_interface: str
    bus_mode: str
    metadata: Dict[str, Any] = {}


class MarkerRequest(BaseModel):
    mission_code: Optional[str] = None
    step_code: Optional[str] = None
    marker_type: str
    label: Optional[str] = None
    timestamp_ms: int
    metadata: Dict[str, Any] = {}


class StopSessionRequest(BaseModel):
    metadata: Dict[str, Any] = {}


@app.get("/db/missions/{vehicle_slug}")
async def list_missions(vehicle_slug: str):
    rows = await fetch(
        """
        SELECT
            rm.id,
            rm.mission_code,
            rm.title,
            rm.target,
            rm.status,
            rm.description,
            rm.metadata
        FROM recon_missions rm
        JOIN vehicles v ON v.id = rm.vehicle_id
        WHERE v.slug = $1
        ORDER BY rm.mission_code
        """,
        vehicle_slug,
    )

    return [dict(row) for row in rows]


@app.get("/db/missions/{vehicle_slug}/{mission_code}/steps")
async def list_mission_steps(vehicle_slug: str, mission_code: str):
    rows = await fetch(
        """
        SELECT
            rs.id,
            rs.step_code,
            rs.label,
            rs.instruction,
            rs.action_text,
            rs.sort_order,
            rs.baseline_ms,
            rs.countdown_ms,
            rs.action_ms,
            rs.capture_ms,
            rs.metadata
        FROM recon_steps rs
        JOIN recon_missions rm ON rm.id = rs.mission_id
        JOIN vehicles v ON v.id = rm.vehicle_id
        WHERE v.slug = $1
          AND rm.mission_code = $2
        ORDER BY rs.sort_order
        """,
        vehicle_slug,
        mission_code,
    )

    return [dict(row) for row in rows]


@app.get("/db/vehicles")
async def list_vehicles():
    rows = await fetch(
        "SELECT id, slug, year, make, model FROM vehicles ORDER BY created_at DESC"
    )
    return [dict(row) for row in rows]


@app.get("/can/status")
async def can_status():
    return get_can_status()


@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "aven-data-server",
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "can_router": "included",
    }


@app.post("/ai/embed")
async def embed(req: EmbedRequest):
    embedding = await embed_text(req.text)
    return {"embedding": embedding}


@app.post("/ai/ask")
async def ask(req: AskRequest):
    response = await ask_question(req.prompt)
    return {"response": response}


@app.post("/generate")
async def generate(req: GenerateRequest):
    async with httpx.AsyncClient(timeout=120.0) as client:
        res = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": req.model,
                "prompt": req.prompt,
                "stream": False,
            },
        )

    res.raise_for_status()

    return {
        "response": res.json()["response"],
    }


@app.post("/can/ask")
async def can_ask(req: CANQuestion):
    prompt = f"""
You are a CAN bus reverse engineering assistant.

Context:
{req.context}

Question:
{req.question}

Respond with:
- reasoning
- likely signals
- confidence
- next experiment
"""

    answer = await ask_question(prompt)

    return {
        "answer": answer,
    }

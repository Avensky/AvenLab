from fastapi import FastAPI
from pydantic import BaseModel
import httpx
from services.ollama_client import OLLAMA_URL, embed_text, ask_question
from app.can.status import get_can_status
app = FastAPI(title="Aven Data Server")

class EmbedRequest(BaseModel): text: str
class AskRequest(BaseModel): prompt: str
class AskRequest(BaseModel):
    model: str
    question: str
    context: str
class GenerateRequest(BaseModel):
    prompt: str
    model: str = "qwen2.5:7b"
class CANQuestion(BaseModel):
    context: str
    question: str


@app.get("/can/status")
async def can_status():
    return get_can_status()

@app.get("/health")
async def health():
    return {"ok": True, "service": "aven-data-server"}

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
                "stream": False
            }
        )

    res.raise_for_status()

    return {
        "response": res.json()["response"]
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
        "answer": answer
    }

# To_do: add endpoints for session management and live data handling
# GET  /health
# POST /can/session/start
# POST /can/session/stop
# POST /can/live/on
# POST /can/live/off
# GET  /can/session/{id}/export
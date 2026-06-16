from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import subprocess
import uvicorn
import json

app = FastAPI()

# === Models === #
class EmbedRequest(BaseModel):
    input: str

class QARequest(BaseModel):
    question: str
    context: str

# === Helper === #
def ollama_api_call(payload, model="mistral"):
    result = subprocess.run(
        ["ollama", "run", model],
        input=payload.encode(),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    return result.stdout.decode().strip()

# === Endpoints === #
@app.post("/embed")
async def embed_text(req: EmbedRequest):
    try:
        res = subprocess.run([
            "ollama", "embeddings",
            "--model", "nomic-embed-text",
            "--prompt", req.input
        ], capture_output=True)

        if res.returncode != 0:
            return {"error": res.stderr.decode()}

        parsed = json.loads(res.stdout)
        return {"embedding": parsed.get("embedding")}

    except Exception as e:
        return {"error": str(e)}

@app.post("/qa")
async def answer_question(req: QARequest):
    prompt = f"""
    You are a CAN bus reverse engineering assistant.
    Given the following log/context:

    {req.context}

    Answer the following question:
    {req.question}
    """
    
    output = ollama_api_call(prompt, model="mistral")
    return {"answer": output}

# === Run === #
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=11434)
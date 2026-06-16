import os
import httpx

OLLAMA_URL  = os.getenv("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
CHAT_MODEL  = os.getenv("OLLAMA_CHAT_MODEL", "qwen2.5:7b")

async def embed_text(text: str):
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            f"{OLLAMA_URL}/api/embed",
            json={
                "model": EMBED_MODEL,
                "input": text,
            },
        )

        res.raise_for_status()
        data = res.json()

        # /api/embed returns {"embeddings": [[...]]}
        if "embeddings" in data:
            return data["embeddings"][0]

        # fallback for older /api/embeddings style
        return data.get("embedding")

async def ask_question(prompt: str):
    async with httpx.AsyncClient(timeout=120.0) as client:
        res = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": CHAT_MODEL,
                "prompt": prompt,
                "stream": False,
            },
        )
        res.raise_for_status()
        return res.json()["response"]
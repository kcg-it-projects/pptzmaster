"""
PPTZMaster — Python Backend
FastAPI server for template analysis, AI-powered content planning, and PPTX generation.

Run: cd python && python main.py  (listens on :8000)
"""

import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure python/ is on path for imports
sys.path.insert(0, os.path.dirname(__file__))

from app.routers import analyze, generate

app = FastAPI(
    title="PPTZMaster API",
    description="Template analysis and AI-powered PPTX generation",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(generate.router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "pptzmaster"}

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PYTHON_PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

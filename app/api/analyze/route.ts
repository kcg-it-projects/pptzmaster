// Proxy to Python backend: POST /analyze
import { NextResponse } from "next/server";

const PYTHON_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

export async function POST(req: Request) {
  const formData = await req.formData();
  try {
    const r = await fetch(`${PYTHON_URL}/analyze`, {
      method: "POST",
      body: formData,
    });
    if (!r.ok) {
      const err = await r.text();
      return NextResponse.json({ error: err }, { status: r.status });
    }
    return NextResponse.json(await r.json());
  } catch (e) {
    return NextResponse.json(
      { error: `Python backend not reachable at ${PYTHON_URL}` },
      { status: 502 }
    );
  }
}

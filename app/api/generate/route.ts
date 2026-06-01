// Proxy to Python backend: POST /generate
// Streams log events then returns PPTX binary

const PYTHON_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

export async function POST(req: Request) {
  const formData = await req.formData();
  try {
    const r = await fetch(`${PYTHON_URL}/generate`, {
      method: "POST",
      body: formData,
    });
    if (!r.ok) {
      const err = await r.text();
      return new Response(err, { status: r.status });
    }
    // Pass through the PPTX binary directly
    const blob = await r.blob();
    return new Response(blob, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": 'attachment; filename="generated.pptx"',
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: `Python backend not reachable at ${PYTHON_URL}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}

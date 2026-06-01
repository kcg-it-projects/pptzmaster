# PPTZMaster — Handover for Windsurf Development

> Built by Hermes + User on 2026-06-01.  
> Target: Develop in Windsurf → push → Hermes deploys via `hermes-deploy pptzmaster`.

---

## 1. What PPTZMaster Is

**PPTZMaster generates PowerPoint presentations that look EXACTLY like a given template**, using AI for content planning and generation.

**Problem with the old `ppt-master`:** It does ZIP-level slide surgery — copies slide XML from source into template's package. The result is a hybrid that doesn't truly look like the template because source slides keep their own master references.

**PPTZMaster's approach:** Server-side python-pptx clones template layout slides, then fills them with AI-generated content. The output is native-template-perfect because every slide inherits the template's master, layouts, fonts, colors, and placeholders.

```
User provides: Template.pptx + Topic/Brief
       ↓
Template Analyzer → parses all layouts, placeholders, theme
       ↓
AI Content Planner → plans slide structure, picks layout per slide
       ↓
AI Content Generator → writes text for each placeholder
       ↓
Slide Builder (python-pptx) → clones layouts, fills placeholders
       ↓
Output: perfect PPTX
```

---

## 2. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 16 + Tailwind v4 + TypeScript | CBS standard, ppt-master ancestor |
| Backend API | FastAPI (Python 3.12+) | python-pptx is Python-only |
| Template Engine | python-pptx | The ONLY way to clone layout slides properly |
| AI Planning | Claude Opus 4 (Anthropic) | Structured thinking for slide structure |
| AI Content | Claude Sonnet 4 | Best price/perf for bulk text generation |
| Container | Docker with Node 22 + Python 3.12 | Single container (A), not two services |
| Deploy | hermes-deploy → Caddy → Cloudflare | CBS pattern, see cbs-prototyper skill |

---

## 3. Directory Structure

```
pptzmaster/
├── app/                          # Next.js 16 App Router
│   ├── layout.tsx                 # Root layout, brand CSS
│   ├── page.tsx                   # → Hub component (server, lists masters)
│   ├── globals.css                # Tailwind v4 + CBS brand tokens
│   ├── components/
│   │   └── Hub.tsx                # Main UI: upload, topic input, generate, download
│   └── api/
│       └── generate/
│           └── route.ts           # POST handler → forwards to Python backend
│
├── lib/
│   ├── masters.ts                 # Server-side: lists public/masters/ (copy from ppt-master)
│   └── types.ts                   # Shared types: TemplateManifest, SlidePlan, etc.
│
├── python/                        # FastAPI backend
│   ├── requirements.txt
│   ├── main.py                    # FastAPI app, CORS, startup
│   ├── app/
│   │   ├── __init__.py
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── analyze.py         # POST /analyze — template analysis
│   │   │   └── generate.py        # POST /generate — full pipeline
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── analyzer.py        # TemplateAnalyzer: layout/placeholder/theme extraction
│   │       ├── planner.py         # ContentPlanner: Claude plans slide structure
│   │       ├── generator.py       # ContentGenerator: Claude writes per-slide content
│   │       └── builder.py         # SlideBuilder: python-pptx clones + fills
│   └── tests/
│       └── test_analyzer.py
│
├── public/
│   └── masters/                   # Drop template PPTX files here
│       └── README.md              # "Put your CBS master PPTX files here"
│
├── Dockerfile                     # Multi-stage: Node build + Python runtime
├── .dockerignore
├── next.config.ts
├── package.json
├── tsconfig.json
├── postcss.config.mjs
└── HANDOVER.md                    # ← This file
```

---

## 4. API Contract (Frontend ↔ Python Backend)

Python backend runs on `http://localhost:8000` inside the container.
Next.js API route proxies to it (keeps API keys server-side).

### POST /analyze
Analyze a template PPTX, return its manifest.

```
Request:  multipart/form-data { template: .pptx file }
Response: {
  "layouts": [
    {
      "name": "Title Slide",
      "index": 0,
      "placeholders": [
        { "type": "title", "name": "Title", "x": 914400, "y": 2743200, "cx": 9144000, "cy": 1143000 },
        { "type": "subtitle", "name": "Subtitle", "x": 914400, "y": 4114800, "cx": 9144000, "cy": 685800 }
      ]
    },
    {
      "name": "Content Slide",
      "index": 1,
      "placeholders": [
        { "type": "title", "name": "Title", ... },
        { "type": "body", "name": "Content", ... }
      ]
    }
  ],
  "slide_width": 12192000,     // EMU
  "slide_height": 6858000,
  "theme_colors": { ... },
  "total_layouts": 5
}
```

### POST /generate
Full pipeline: analyze template → plan slides → generate content → build PPTX.

```
Request:  multipart/form-data {
  template: .pptx file,
  topic: "string",             // Was soll die Präsentation behandeln?
  audience: "string",          // optional: Zielgruppe
  slide_count: number,         // optional: Wunschanzahl Folien (default: AI entscheidet)
  language: "de" | "en",       // default: "de"
  tone: "string",              // optional: "formell", "locker", etc.
  additional_instructions: "string"  // optional
}
Response: application/vnd.openxmlformats-officedocument.presentationml.presentation
          (binary .pptx download)
```

### POST /plan (intermediate step — optional)
Like /generate but stops after planning. Returns the slide plan for user approval.

```
Request:  same as /generate (minus template — template was pre-analyzed)
Response: {
  "slides": [
    {
      "layout_index": 0,
      "layout_name": "Title Slide",
      "title": "Projekt Alpha — Status Update",
      "content": { ... }   // placeholder-specific content
    },
    ...
  ]
}
```

---

## 5. Core Algorithms

### 5.1 TemplateAnalyzer (`python/app/services/analyzer.py`)

```python
from pptx import Presentation
from pptx.util import Inches, Emu

class TemplateAnalyzer:
    def __init__(self, pptx_path: str):
        self.prs = Presentation(pptx_path)

    def analyze(self) -> dict:
        """Return complete template manifest."""
        return {
            "slide_width": self.prs.slide_width,
            "slide_height": self.prs.slide_height,
            "layouts": [self._analyze_layout(lo) for lo in self.prs.slide_layouts],
            "theme_colors": self._extract_theme_colors(),
            "total_layouts": len(self.prs.slide_layouts),
        }

    def _analyze_layout(self, layout) -> dict:
        """Extract all placeholders from a slide layout."""
        placeholders = []
        for ph in layout.placeholders:
            placeholders.append({
                "type": str(ph.placeholder_format.type),  # TITLE, BODY, etc.
                "idx": ph.placeholder_format.idx,
                "name": ph.name,
                "x": ph.left, "y": ph.top,
                "cx": ph.width, "cy": ph.height,
            })
        # Also find non-placeholder shapes that matter (logos, backgrounds)
        return {
            "name": layout.name,
            "index": self.prs.slide_layouts.index(layout),
            "placeholders": placeholders,
        }
```

### 5.2 ContentPlanner (`python/app/services/planner.py`)

Uses Claude API to plan slide structure given template manifest + topic.

```python
class ContentPlanner:
    def __init__(self, api_key: str):
        self.client = anthropic.Anthropic(api_key=api_key)

    async def plan(self, manifest: dict, topic: str, options: dict) -> list[dict]:
        """
        Returns list of { layout_index, layout_name, title, content_description }
        """
        prompt = self._build_planning_prompt(manifest, topic, options)
        response = await self.client.messages.create(
            model="claude-opus-4-20250514",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        return self._parse_plan(response.content[0].text)
```

### 5.3 SlideBuilder (`python/app/services/builder.py`)

The critical piece. Clones layout slides and fills placeholders.

```python
from pptx import Presentation
from copy import deepcopy
import lxml.etree as etree

class SlideBuilder:
    def __init__(self, template_path: str):
        self.prs = Presentation(template_path)

    def add_slide_from_layout(self, layout_index: int, content: dict) -> None:
        """Clone the layout slide and fill placeholders with content."""
        layout = self.prs.slide_layouts[layout_index]
        slide = self.prs.slides.add_slide(layout)
        # python-pptx's add_slide() already clones the layout's shapes!
        # Now just fill the placeholders:
        for ph in slide.placeholders:
            key = str(ph.placeholder_format.type).lower()
            if key in content:
                ph.text = content[key]

    def save(self, output_path: str) -> None:
        self.prs.save(output_path)
```

**Key insight:** `prs.slides.add_slide(layout)` is the magic. python-pptx internally clones the layout slide with ALL its shapes, formatting, backgrounds, and master references. The result IS the template — we just fill in text.

### 5.4 Next.js API Route (`app/api/generate/route.ts`)

```typescript
// POST handler: receives FormData, forwards to Python backend
export async function POST(req: Request) {
  const formData = await req.formData();
  // Forward to http://localhost:8000/generate
  const pyResp = await fetch("http://localhost:8000/generate", {
    method: "POST",
    body: formData,  // pass through
  });
  return new Response(pyResp.body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": 'attachment; filename="generated.pptx"',
    },
  });
}
```

---

## 6. Dockerfile (Single Container: Node + Python)

```dockerfile
# Stage 1: Build Next.js
FROM node:22-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Stage 2: Runtime with Python
FROM python:3.12-slim
WORKDIR /app

# Install Node for Next.js standalone
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Python deps
COPY python/requirements.txt /app/python/
RUN pip install --no-cache-dir -r /app/python/requirements.txt

# Next.js standalone output
COPY --from=frontend /app/.next/standalone /app
COPY --from=frontend /app/.next/static /app/.next/static
COPY --from=frontend /app/public /app/public

# Python backend
COPY python/ /app/python/

# Start both services
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 3000 8000
CMD ["/app/start.sh"]
```

`start.sh`:
```bash
#!/bin/bash
cd /app/python && python main.py &
cd /app && node server.js
```

---

## 7. Environment Variables

Create `.env.local` (not committed):

```
ANTHROPIC_API_KEY=sk-ant-...   # From /opt/data/.env on skdev01
PYTHON_BACKEND_URL=http://localhost:8000
```

The Python backend reads from same env:
```python
import os
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
```

---

## 8. Development Flow in Windsurf

1. Clone: `git clone https://github.com/kcg-it-projects/pptzmaster.git`
2. Install frontend: `npm install`
3. Install Python: `cd python && pip install -r requirements.txt`
4. Start Python: `cd python && python main.py` (runs on :8000)
5. Start Next.js: `npm run dev` (runs on :3000)
6. Open http://localhost:3000

**For AI features:** Set `ANTHROPIC_API_KEY` in `.env.local`.

---

## 9. Key Design Decisions (Don't Revisit Without Good Reason)

1. **Single container, not two services.** Simpler deploy, works with `hermes-deploy`.
2. **python-pptx, not ZIP surgery.** The old approach can't clone layouts. This can.
3. **Claude, not GPT.** User's default AI provider. API key is already available.
4. **FastAPI, not Flask.** Better async, better file upload handling, OpenAPI docs auto.
5. **Template manifest as JSON bridge.** Frontend never touches python-pptx — it gets analyzed data and passes it back with content.
6. **Client-side stays simple.** No python-pptx-wasm experiments. Server does the heavy lifting.

---

## 10. Pitfalls / Known Issues

- **python-pptx placeholder types:** `TITLE (1)`, `BODY (2)`, `SUBTITLE (3)`, etc. The integer `ph.placeholder_format.type` is what matters, not `ph.name` (which is user-editable in PowerPoint).
- **Layout cloning preserves ALL shapes:** Background images, logos, decorative elements come through automatically. Don't try to re-add them.
- **Slide size mismatch:** If source content expects different aspect ratio than template, text might overflow. Template wins — AI should adapt content length.
- **Claude API rate limits:** Opus tier has lower RPM. Cache template analysis results.
- **Next.js 16 + Tailwind v4:** No `tailwind.config.ts` — tokens in `globals.css` via `@theme inline`.

---

## 11. Hermes Will Handle

After you push to GitHub:

```bash
hermes-project clone pptzmaster    # or already in workspace
hermes-deploy pptzmaster          # build → container → Caddy → DNS → live
```

URL will be: `https://pptzmaster-dev.cbs.de`

Hermes also handles:
- Adding CBS master PPTX files to `public/masters/`
- Monitoring logs
- Fixing deployment issues
- Visual QA pipeline (Phase 2)

---

## 12. Starter Code to Copy from ppt-master

These files can be copied directly and adapted:

| From ppt-master | To pptzmaster | Changes needed |
|-----------------|---------------|----------------|
| `lib/masters.ts` | `lib/masters.ts` | None — drop-in |
| `app/components/Hub.tsx` | `app/components/Hub.tsx` | Add topic input + AI generate section |
| `app/globals.css` | `app/globals.css` | None — same brand tokens |
| `app/layout.tsx` | `app/layout.tsx` | None — same root layout |
| `postcss.config.mjs` | `postcss.config.mjs` | None |
| `public/masters/README.md` | `public/masters/README.md` | None |
| `Dockerfile` | `Dockerfile` | Major: add Python stage |
| `.dockerignore` | `.dockerignore` | Add `__pycache__`, `*.pyc` |

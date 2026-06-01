"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MasterEntry } from "@/lib/masters";
import type { TemplateManifest, SlidePlan, GenerateOptions } from "@/lib/types";

const STORAGE_KEY = "pptzmaster.options.v1";

type TemplateChoice =
  | { kind: "bundled"; entry: MasterEntry }
  | { kind: "upload"; file: File }
  | { kind: "none" };

type Step = "template" | "topic" | "generating" | "done";

// ─── Main Hub ──────────────────────────────────────────────────────

export default function Hub({ masters }: { masters: MasterEntry[] }) {
  const [step, setStep] = useState<Step>("template");
  const [template, setTemplate] = useState<TemplateChoice>(
    masters.length > 0 ? { kind: "bundled", entry: masters[0] } : { kind: "none" },
  );
  const [manifest, setManifest] = useState<TemplateManifest | null>(null);
  const [options, setOptions] = useState<GenerateOptions>({
    topic: "",
    language: "de",
  });
  const [plan, setPlan] = useState<SlidePlan | null>(null);
  const [logs, setLogs] = useState<string[]>(["Bereit. Wähle ein Template."]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; filename: string } | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Persist options
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setOptions((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(options)); }
    catch { /* ignore */ }
  }, [options]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  function appendLog(msg: string) { setLogs((prev) => [...prev, msg]); }

  // Analyze template
  async function analyzeTemplate() {
    if (template.kind === "none") return;
    setBusy(true);
    setLogs(["Analysiere Template …"]);
    try {
      const buffer = await resolveTemplateBuffer();
      const formData = new FormData();
      formData.append("template", new Blob([buffer]), "template.pptx");
      const r = await fetch("/api/analyze", { method: "POST", body: formData });
      if (!r.ok) throw new Error(await r.text());
      const m: TemplateManifest = await r.json();
      setManifest(m);
      appendLog(`${m.total_layouts} Layouts gefunden.`);
      appendLog(`Folienmaße: ${Math.round(m.slide_width / 12700)}×${Math.round(m.slide_height / 12700)} mm`);
      setStep("topic");
    } catch (e) {
      appendLog("FEHLER: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  // Generate PPTX
  async function generate() {
    if (!options.topic.trim() || template.kind === "none") return;
    setBusy(true);
    setStep("generating");
    setLogs(["Starte KI-Generierung …"]);
    try {
      const buffer = await resolveTemplateBuffer();
      const formData = new FormData();
      formData.append("template", new Blob([buffer]), "template.pptx");
      formData.append("topic", options.topic);
      if (options.audience) formData.append("audience", options.audience);
      if (options.slide_count) formData.append("slide_count", String(options.slide_count));
      formData.append("language", options.language);
      if (options.tone) formData.append("tone", options.tone);
      if (options.additional_instructions) formData.append("additional_instructions", options.additional_instructions);

      const r = await fetch("/api/generate", { method: "POST", body: formData });
      if (!r.ok) { appendLog("FEHLER: " + await r.text()); return; }

      // Stream log events
      const reader = r.body?.getReader();
      const decoder = new TextDecoder();
      let pptxBlob: Blob | null = null;

      // Check content-type: if it's PPTX, it's a direct download; if text/event-stream, it's streaming
      const contentType = r.headers.get("content-type") || "";
      if (contentType.includes("presentationml")) {
        pptxBlob = await r.blob();
      } else if (reader) {
        // Streaming response with log lines
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          // Parse SSE or newline-delimited JSON
          for (const line of text.split("\n")) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line);
              if (evt.log) appendLog(evt.log);
              if (evt.error) appendLog("FEHLER: " + evt.error);
            } catch {
              // Not JSON — might be binary chunk
              chunks.push(new TextEncoder().encode(line));
            }
          }
        }
      }

      if (pptxBlob) {
        const url = URL.createObjectURL(pptxBlob);
        const filename = "generated_" + Date.now() + ".pptx";
        setResult({ url, filename });
        setStep("done");
        appendLog("✅ Präsentation fertig!");
      } else {
        appendLog("⚠️ Kein PPTX-Output erhalten.");
      }
    } catch (e) {
      appendLog("FEHLER: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function resolveTemplateBuffer(): Promise<ArrayBuffer> {
    if (template.kind === "bundled") {
      const r = await fetch(template.entry.url);
      if (!r.ok) throw new Error("Master konnte nicht geladen werden.");
      return await r.arrayBuffer();
    }
    if (template.kind === "upload") return await template.file.arrayBuffer();
    throw new Error("Kein Template gewählt.");
  }

  const canAnalyze = template.kind !== "none" && !busy;
  const canGenerate = options.topic.trim().length > 0 && !busy;

  return (
    <div className="min-h-screen bg-brand-white text-brand-black">
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-10 sm:py-14 space-y-10">
        <Hero />

        {/* Step 1: Template */}
        <Section title="1 · Template wählen & analysieren" active={step === "template"}>
          <TemplatePicker masters={masters} value={template} onChange={setTemplate} />
          <button
            onClick={analyzeTemplate}
            disabled={!canAnalyze}
            className="mt-4 rounded-xl px-5 py-2.5 text-sm font-medium text-brand-white disabled:opacity-40 disabled:cursor-not-allowed transition"
            style={{ background: "var(--brand-black)" }}
          >
            {busy && step === "template" ? "Analysiere …" : "Template analysieren"}
          </button>
          {manifest && (
            <div className="mt-4 p-4 rounded-xl bg-black/3 text-sm space-y-1">
              <div>✓ {manifest.total_layouts} Layouts erkannt</div>
              <div className="text-brand-black/60">
                {manifest.layouts.map((l) => l.name).join(" · ")}
              </div>
            </div>
          )}
        </Section>

        {/* Step 2: Topic & Generate */}
        {(step === "topic" || step === "generating" || step === "done") && (
          <Section title="2 · Thema & KI-Generierung" active={step !== "template"}>
            <div className="space-y-4">
              <Field
                label="Worum soll es gehen?"
                placeholder="z. B. 'Quartalsreport Q2 2026 — Umsatz, Kosten, Forecast' oder 'Einführung in KI für Führungskräfte'"
                value={options.topic}
                onChange={(v) => setOptions((o) => ({ ...o, topic: v }))}
                multiline
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <Field
                  label="Zielgruppe (optional)"
                  placeholder="z. B. Vorstand, Studierende, Kunden"
                  value={options.audience || ""}
                  onChange={(v) => setOptions((o) => ({ ...o, audience: v }))}
                />
                <Field
                  label="Anzahl Folien (optional, leer = KI entscheidet)"
                  placeholder="z. B. 8"
                  value={options.slide_count ? String(options.slide_count) : ""}
                  onChange={(v) => setOptions((o) => ({ ...o, slide_count: v ? parseInt(v) : undefined }))}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-brand-black/60">Sprache</label>
                  <select
                    value={options.language}
                    onChange={(e) => setOptions((o) => ({ ...o, language: e.target.value as "de" | "en" }))}
                    className="w-full rounded-xl border border-black/15 px-3 py-2.5 text-sm bg-white"
                  >
                    <option value="de">Deutsch</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <Field
                  label="Tonalität (optional)"
                  placeholder="z. B. formell, locker, akademisch"
                  value={options.tone || ""}
                  onChange={(v) => setOptions((o) => ({ ...o, tone: v }))}
                />
              </div>
              <Field
                label="Zusätzliche Anweisungen (optional)"
                placeholder="z. B. 'Fokus auf Finanzkennzahlen' oder 'Bitte CBS Brand Voice beachten'"
                value={options.additional_instructions || ""}
                onChange={(v) => setOptions((o) => ({ ...o, additional_instructions: v }))}
              />
              <button
                onClick={generate}
                disabled={!canGenerate}
                className="rounded-xl px-6 py-3 text-base font-medium text-brand-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                style={{ background: "var(--brand-black)" }}
              >
                {busy ? "Generiere …" : "Präsentation generieren"}
              </button>
            </div>
          </Section>
        )}

        {/* Result */}
        {result && (
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <a
              href={result.url}
              download={result.filename}
              className="rounded-xl px-5 py-3 font-medium text-brand-black transition"
              style={{ background: "var(--brand-primary)" }}
            >
              ↓ {result.filename}
            </a>
            <button
              onClick={() => { setStep("topic"); setResult(null); }}
              className="text-sm underline text-brand-black/60 hover:text-brand-black"
            >
              Neue Präsentation generieren
            </button>
          </div>
        )}

        {/* Log */}
        <div
          ref={logRef}
          className="rounded-xl bg-brand-black text-brand-white/90 font-mono text-[12.5px] leading-relaxed p-4 min-h-[180px] max-h-[320px] overflow-auto whitespace-pre-wrap"
        >
          {logs.join("\n")}
        </div>
      </main>
      <Footer />
    </div>
  );
}

/* ───────── Components ───────── */

function Header() {
  return (
    <header className="border-b border-black/10">
      <div className="mx-auto max-w-5xl px-6 py-4 flex items-center gap-3">
        <div aria-hidden className="size-9 rounded-md grid place-items-center" style={{ background: "var(--brand-primary)" }}>
          <span className="font-bold text-brand-black">C</span>
        </div>
        <div className="font-semibold tracking-tight">PPTZMaster</div>
        <div className="ml-auto text-xs text-brand-black/55">AI-gestützte Präsentationen · Template-nativ</div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section>
      <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
        Präsentationen die exakt wie dein{" "}
        <span style={{ color: "var(--brand-primary)" }}>Template</span> aussehen.
      </h1>
      <p className="mt-3 max-w-2xl text-brand-black/70">
        Template wählen, Thema beschreiben — PPTZMaster plant die Folien, generiert den Content
        und baut eine perfekte PPTX mit den echten Layouts deines Templates.
      </p>
    </section>
  );
}

function Section({ title, active, children }: { title: string; active?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={"text-sm font-semibold tracking-wider uppercase mb-3 " + (active ? "text-brand-black" : "text-brand-black/40")}>
        {title}
      </h2>
      <div className="rounded-2xl border border-black/10 bg-brand-white p-5 sm:p-6">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange, placeholder, multiline }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
}) {
  const Comp = multiline ? "textarea" : "input";
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-brand-black/60">{label}</label>
      <Comp
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? 3 : undefined}
        className="w-full rounded-xl border border-black/15 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 ring-[color:var(--brand-primary)]/30 placeholder:text-black/30"
      />
    </div>
  );
}

function TemplatePicker({ masters, value, onChange }: {
  masters: MasterEntry[];
  value: TemplateChoice;
  onChange: (v: TemplateChoice) => void;
}) {
  const [mode, setMode] = useState<"bundled" | "upload">(value.kind === "upload" ? "upload" : "bundled");

  return (
    <div>
      <div className="inline-flex rounded-full border border-black/15 p-1 mb-4">
        <button onClick={() => { setMode("bundled"); onChange(masters.length > 0 ? { kind: "bundled", entry: masters[0] } : { kind: "none" }); }}
          className={"px-4 py-1.5 text-sm rounded-full transition-colors " + (mode === "bundled" ? "bg-brand-black text-brand-white" : "text-brand-black/70 hover:text-brand-black")}>
          Hinterlegte Master
        </button>
        <button onClick={() => { setMode("upload"); }}
          className={"px-4 py-1.5 text-sm rounded-full transition-colors " + (mode === "upload" ? "bg-brand-black text-brand-white" : "text-brand-black/70 hover:text-brand-black")}>
          Eigenes Template
        </button>
      </div>

      {mode === "bundled" ? (
        masters.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/20 p-5 text-sm text-brand-black/65">
            Noch keine Master hinterlegt. Lege die PPTX-Dateien unter <code className="mx-1 px-1.5 py-0.5 rounded bg-black/5 text-[12.5px]">public/masters/</code> ab.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {masters.map((m) => {
              const active = value.kind === "bundled" && value.entry.id === m.id;
              return (
                <button key={m.id} onClick={() => onChange({ kind: "bundled", entry: m })}
                  className={"rounded-xl border px-4 py-3 text-left transition " + (active ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5" : "border-black/10 hover:border-black/25")}>
                  <div className="font-medium text-sm">{m.label}</div>
                  <div className="text-xs text-brand-black/50 mt-1">{m.sizeKb} KB</div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <FileDrop accept=".pptx" file={value.kind === "upload" ? value.file : null}
          onFile={(f) => onChange(f ? { kind: "upload", file: f } : { kind: "none" })}
          placeholder="PPTX-Template hier ablegen oder klicken" />
      )}
    </div>
  );
}

function FileDrop({ accept, file, onFile, placeholder }: {
  accept: string; file: File | null; onFile: (f: File | null) => void; placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  return (
    <label onClick={() => inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      className={"block rounded-xl border border-dashed px-4 py-6 cursor-pointer transition " + (dragOver ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5" : "border-black/20 hover:border-black/40")}>
      {file ? (
        <div className="flex items-center justify-between gap-3">
          <div><div className="font-medium">{file.name}</div><div className="text-xs text-brand-black/55">{(file.size / 1024).toFixed(0)} KB</div></div>
          <button type="button" onClick={(e) => { e.stopPropagation(); onFile(null); }} className="text-xs text-brand-black/60 underline hover:text-brand-black">entfernen</button>
        </div>
      ) : <div className="text-brand-black/60">{placeholder}</div>}
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
    </label>
  );
}

function Footer() {
  return (
    <footer className="border-t border-black/10 mt-16 py-8 text-center text-sm text-brand-black/40">
      <span style={{ color: "var(--brand-primary)" }}>#creatingtomorrow</span>
    </footer>
  );
}

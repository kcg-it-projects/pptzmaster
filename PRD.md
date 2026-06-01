# PPTZMaster — Product Requirements Document

> Version 0.1 | 2026-06-01 | Author: Hermes + User  
> Status: Draft — vor Windsurf-Entwicklung

---

## 1. Produktvision

**PPTZMaster erzeugt PowerPoint-Präsentationen, die exakt wie ein gegebenes Template aussehen — mit KI-generierten Inhalten.**

Das Problem: Bestehende Tools (inklusive des Vorgängers `ppt-master`) machen ZIP-Level Slide-Chirurgie. Sie kopieren Slide-XML aus einer Quell-Präsentation in das Template-Paket. Das Ergebnis ist ein Hybrid — die Slides behalten ihre eigenen Master-Referenzen, das Template ist nur eine lose Hülle. Es sieht nicht wirklich wie das Template aus.

PPTZMaster geht anders vor: Es nutzt python-pptx, um echte Layout-Slides aus dem Template zu **klonen** und dann mit KI-generierten Inhalten zu befüllen. Jeder Slide erbt die Master-Theme, Fonts, Farben, Platzhalter und Hintergründe des Templates. Das Ergebnis ist template-nativ — als hätte ein Mensch die Präsentation in PowerPoint mit dem Template gebaut.

---

## 2. Problemstellung

### 2.1 Aktueller Workflow (ohne PPTZMaster)

1. Template.pptx liegt bereit (z. B. CBS Corporate Master)
2. User schreibt Content in Word/Notizen oder hat eine alte PPTX
3. User öffnet PowerPoint, wählt Template, baut Slide für Slide
4. User kopiert Texte, formatiert, justiert Platzhalter
5. Ergebnis sieht okay aus, aber nie perfekt — Layout-Abweichungen, falsche Schriftgrößen, manuelle Korrekturen

**Zeitaufwand:** 2–8 Stunden für eine 15-Folien-Präsentation.

### 2.2 Vorhandenes Tool `ppt-master`

- Nimmt Quell-PPTX + Template-PPTX
- Kopiert Slide-XML per ZIP-Manipulation
- Footer können angepasst werden
- **Problem:** Slides behalten Master-Referenzen der Quelle, nicht des Templates
- **Problem:** Keine KI — Content muss aus bestehender PPTX kommen
- **Problem:** Layout wird nicht geklont, nur grob referenziert

### 2.3 Was PPTZMaster löst

| Problem | PPTZMaster-Lösung |
|---------|-------------------|
| Slides sehen nicht wie Template aus | python-pptx klont Layout-Slides → echte Template-Treue |
| Content muss manuell erstellt werden | Claude AI plant + generiert Content aus Topic-Beschreibung |
| Layout-Wahl ist trial-and-error | AI analysiert Template-Layouts und wählt das beste pro Slide |
| Manuelle Nacharbeit nötig | Platzhalter werden direkt mit generiertem Text befüllt |
| Kein Template-Verständnis | Template-Analyzer extrahiert alle Layouts, Platzhalter, Theme |

---

## 3. Zielgruppe

- **Primär:** CBS-Mitarbeitende, die regelmäßig Präsentationen im Corporate Design erstellen müssen (Marketing, Sales, Management, Lehre)
- **Sekundär:** Externe Nutzer mit eigenen Templates (Berater, Agenturen, Startups)
- **Nutzungskontext:** Web-App, keine Installation nötig. Template einmal hochladen/hinterlegen, dann beliebig viele Präsentationen generieren.

---

## 4. User Stories

### MVP (Phase 1)

| ID | Story | Prio |
|----|-------|------|
| US1 | Als Nutzer möchte ich ein Template (.pptx) hochladen, damit die Präsentation in meinem Corporate Design erstellt wird | P0 |
| US2 | Als Nutzer möchte ich das Template analysieren lassen, um zu sehen welche Layouts verfügbar sind | P0 |
| US3 | Als Nutzer möchte ich ein Thema/eine grobe Beschreibung eingeben, damit die KI die Folienstruktur plant | P0 |
| US4 | Als Nutzer möchte ich eine .pptx-Datei herunterladen, deren Slides exakt dem Template-Layout entsprechen | P0 |
| US5 | Als Nutzer möchte ich die Sprache (DE/EN) wählen können | P1 |
| US6 | Als Nutzer möchte ich optionale Parameter setzen (Zielgruppe, Tonalität, Anzahl Folien) | P1 |
| US7 | Als Admin möchte ich Master-PPTX-Dateien im Backend hinterlegen können, die alle Nutzer sehen | P1 |

### Phase 2

| ID | Story | Prio |
|----|-------|------|
| US8 | Als Nutzer möchte ich den Slide-Plan vor der Generierung sehen und manuell anpassen können | P2 |
| US9 | Als Nutzer möchte ich eine Vorschau der generierten Slides als Bilder sehen | P2 |
| US10 | Als Nutzer möchte ich einzelne Slides nachträglich editieren können (Text ändern, Layout wechseln) | P2 |
| US11 | Visual QA: Automatischer Render-Vergleich Output vs. Template | P2 |

### Später

| ID | Story |
|----|-------|
| US12 | Bild-Generierung für Slides (AI-Bilder passend zum Content) |
| US13 | Charts & Tabellen aus Daten generieren |
| US14 | Mehrere Templates vergleichen und bestes vorschlagen |
| US15 | Batch-Generierung: Ein Template, viele Topics → viele PPTXs |
| US16 | CBS Brand-Enforcement: Automatisch prüfen ob Content zur Brand Voice passt |

---

## 5. User Flow

```
1. Nutzer öffnet https://pptzmaster-dev.cbs.de
2. Wählt Template (hinterlegt oder Upload)
3. Klickt "Template analysieren" → sieht Layout-Übersicht
4. Gibt Topic ein: "Quartalsreport Q2 2026 — Umsatz, Kosten, Forecast"
5. Optional: Zielgruppe, Anzahl Folien, Tonalität
6. Klickt "Präsentation generieren"
7. Wartet ~30–90 Sekunden (KI plant + generiert + baut)
8. Lädt .pptx herunter
9. Öffnet in PowerPoint — es sieht exakt wie das Template aus
```

---

## 6. Architektur-Entscheidungen

### 6.1 Warum python-pptx?

- python-pptx kann Layout-Slides **klonen**: `prs.slides.add_slide(layout)` 
- Das klont ALLE Shapes, Hintergründe, Formatierungen, Master-Referenzen
- ZIP-Manipulation (Vorgänger-Ansatz) kann das nicht — es kopiert nur XML-Blöcke
- python-pptx ist der De-facto-Standard für PPTX-Erzeugung in Python

### 6.2 Warum Server-seitig (nicht Client)?

- python-pptx läuft nicht im Browser (kein WASM-Port)
- Anthropic API-Key muss serverseitig bleiben
- LibreOffice für QA-Phase braucht Server
- FastAPI ist schlank, async, hat auto-generated OpenAPI-Docs

### 6.3 Warum Claude (nicht GPT)?

- User-Default: Anthropic Claude (API-Key liegt bereit)
- Opus 4 für Planung (strukturiertes Denken über Slide-Strukturen)
- Sonnet 4 für Content-Generierung (günstiger, schneller)
- Ein Anbieter → ein API-Key → weniger Komplexität

### 6.4 Warum Single-Container?

- `hermes-deploy` deployed einen Container straight durch
- Zwei Services (docker-compose) sind komplexer in Wartung + Deployment
- Node (Next.js Standalone) + Python (FastAPI) im selben Image ist pragmatisch
- Port 3000 (Next.js) + Port 8000 (Python intern, nicht exposed)

---

## 7. Technischer Scope

### MVP: Was gebaut wird

| Komponente | Beschreibung |
|------------|-------------|
| **Next.js Frontend** | Upload, Topic-Input, Download. Portiert von ppt-master UI-Patterns |
| **FastAPI Backend** | `/analyze`, `/generate`, `/health` |
| **TemplateAnalyzer** | python-pptx: Layouts, Platzhalter, Theme parsen → JSON-Manifest |
| **ContentPlanner** | Claude Opus: Slide-Struktur planen, Layout pro Slide wählen |
| **ContentGenerator** | Claude Sonnet: Text für jeden Platzhalter schreiben |
| **SlideBuilder** | python-pptx: Layouts klonen, Platzhalter befüllen, .pptx speichern |
| **Dockerfile** | Multi-stage: Node 22 Build + Python 3.12 Runtime |
| **Templates** | `public/masters/` — vorinstallierte CBS-Master |

### Nicht im MVP (Phase 2+)

- Slide-Plan-Vorschau / manuelle Editierung
- Visual QA Pipeline
- Bild-Generierung
- Charts & Tabellen
- Batch-Generierung

---

## 8. API-Design

Siehe `HANDOVER.md` Section 4 für vollständigen API-Contract.

Kurzfassung:

| Endpoint | Input | Output |
|----------|-------|--------|
| `POST /analyze` | Template .pptx | Template-Manifest JSON (Layouts, Platzhalter) |
| `POST /generate` | Template .pptx + Topic + Options | .pptx Binary-Download |
| `GET /health` | — | `{"status": "ok"}` |

---

## 9. Constraints & Risiken

| Constraint | Handling |
|------------|----------|
| Claude API Rate Limits (Opus Tier) | Template-Analyse cachen; nur Planung nutzt Opus |
| python-pptx placeholder types sind ints | Dokumentieren (TITLE=1, BODY=2, SUBTITLE=3, etc.) |
| Slide-Größen-Mismatch Quelle/Template | Template gewinnt; AI muss Content-Länge anpassen |
| Deployment nur über Hermes auf skdev01 | Dockerfile muss standalone Node + Python können |
| Kein `docker compose` im Hermes-Container | Docker run direkt; Container-Name = pptzmaster |

---

## 10. Success Metrics

- **Template-Treue:** Generierte PPTX sieht in PowerPoint identisch zum Template aus (manuelle Sichtprüfung)
- **Content-Qualität:** AI-Content ist fachlich korrekt, kohärent, im richtigen Ton
- **Geschwindigkeit:** < 90 Sekunden für 10-Folien-Präsentation
- **Fehlerrate:** < 5% der Generierungen brauchen manuelle Nacharbeit

---

## 11. Naming & Branding

- **Produktname:** PPTZMaster
- **Tagline:** "Präsentationen die exakt wie dein Template aussehen"
- **URL:** `https://pptzmaster-dev.cbs.de`
- **Brand:** CBS (Türkis #4AC6B4, Schwarz, Weiß)
- **Tone:** Deutsch, Du (internes Tool)

---

## 12. Open Questions

1. **Mehrere Templates gleichzeitig?** → Nein, eins pro Generation. Template-Vergleich kommt später.
2. **User-Auth?** → MVP ohne. Internes Tool auf Dev-Server. Auth kann später kommen.
3. **PPTX-Output validieren?** → Im MVP: User öffnet in PowerPoint und prüft. Phase 2: Automatisierte Visual QA.
4. **Welche Claude-Modelle genau?** → `claude-opus-4-20250514` für Planung, `claude-sonnet-4-20250514` für Content. Kann in `.env` konfiguriert werden.

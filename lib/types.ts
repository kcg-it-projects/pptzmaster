// ─── Template Manifest (from Python /analyze) ───────────────────────

export type PlaceholderInfo = {
  type: string;        // TITLE, BODY, SUBTITLE, etc.
  idx: number;
  name: string;
  x: number;           // EMU
  y: number;
  cx: number;
  cy: number;
};

export type LayoutInfo = {
  name: string;
  index: number;
  placeholders: PlaceholderInfo[];
};

export type TemplateManifest = {
  layouts: LayoutInfo[];
  slide_width: number;
  slide_height: number;
  theme_colors: Record<string, string>;
  total_layouts: number;
};

// ─── Slide Plan (from AI Planner) ──────────────────────────────────

export type SlideContent = Record<string, string>;  // placeholder_idx → text

export type SlidePlanItem = {
  layout_index: number;
  layout_name: string;
  title: string;
  content: SlideContent;
};

export type SlidePlan = {
  slides: SlidePlanItem[];
};

// ─── Generate Options ──────────────────────────────────────────────

export type GenerateOptions = {
  topic: string;
  audience?: string;
  slide_count?: number;
  language: "de" | "en";
  tone?: string;
  additional_instructions?: string;
};

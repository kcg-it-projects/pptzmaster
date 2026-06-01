import { readdir } from "node:fs/promises";
import * as path from "node:path";

export type MasterEntry = {
  id: string;
  label: string;
  url: string;
  sizeKb: number;
};

export async function listMasters(): Promise<MasterEntry[]> {
  const dir = path.join(process.cwd(), "public", "masters");
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const fs = await import("node:fs/promises");
  const out: MasterEntry[] = [];
  for (const name of files.sort()) {
    if (!name.toLowerCase().endsWith(".pptx")) continue;
    const stat = await fs.stat(path.join(dir, name));
    const id = name.replace(/\.pptx$/i, "");
    out.push({
      id,
      label: prettifyName(id),
      url: "/masters/" + encodeURIComponent(name),
      sizeKb: Math.round(stat.size / 1024),
    });
  }
  return out;
}

function prettifyName(slug: string): string {
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

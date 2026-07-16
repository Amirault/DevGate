import fs from "node:fs";
import path from "node:path";

/** Backlog subdirectories that hold spec markdown files, in lifecycle order. */
const BACKLOG_SUBDIRS = ["todo", "in-progress", "done"] as const;

/**
 * List spec slugs found under `<root>/docs/backlog/{todo,in-progress,done}/*.md`.
 *
 * A slug is the markdown filename without its `.md` extension — the same slug
 * emitted as `spec_id=` in the correlation marker. Lets the CLI offer a picker
 * and validate `--spec` without scanning the Warp DB.
 */
export function listSpecSlugs(rootDir: string): string[] {
  const backlogDir = path.join(rootDir, "docs", "backlog");
  const slugs = new Set<string>();
  for (const sub of BACKLOG_SUBDIRS) {
    const dir = path.join(backlogDir, sub);
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (file.endsWith(".md")) slugs.add(file.slice(0, -".md".length));
    }
  }
  return [...slugs].sort();
}

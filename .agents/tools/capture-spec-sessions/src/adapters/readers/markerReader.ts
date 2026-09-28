import { normalizePhase, type Phase, type SeedMatch, type SeedStatus } from "../../domain/models.js";
import type { ReadableDb } from "../../domain/ports.js";

/**
 * Fallback binding strategy for local orchestrated subagents.
 *
 * When a SPEC_MARKER is in `commands` but has no matching `blocks` row (so the
 * standard ai_metadata JOIN produces no conversation_id), query `ai_queries` for
 * the most recent AI exchange that completed at or before the marker's start_ts
 * within a 10-minute look-back window.  The last AI query before the marker is
 * very likely from the subagent that just ran it (it reads the skill, then emits
 * the marker as one of its first commands).
 *
 * Returns the conversation_id string, or null when no qualifying row is found.
 */
function fallbackViaAiQueries(db: ReadableDb, markerTs: string): string | null {
  interface AiQueryRow {
    conversation_id: string;
  }
  try {
    const rows = db.all<AiQueryRow>(
      `SELECT conversation_id
         FROM ai_queries
        WHERE start_ts BETWEEN datetime(?, '-600 seconds') AND ?
        ORDER BY start_ts DESC
        LIMIT 1`,
      markerTs,
      markerTs
    );
    return rows[0]?.conversation_id ?? null;
  } catch {
    // ai_queries absent in older DB snapshots — degrade gracefully.
    return null;
  }
}

/**
 * Marker selection & binding.
 *
 * The correlation marker `: SPEC_MARKER v=1 spec_id=<slug> phase=<phase>` is a
 * shell no-op recorded cleanly in commands.command (greppable), and creates a
 * blocks row at the SAME start_ts carrying ai_metadata.conversation_id. We bind
 * the marker to its conversation by joining on start_ts (verified 1:1).
 *
 * The `: SPEC_MARKER` anchor avoids false positives from any text that merely
 * mentions the marker (e.g. diagnostic scripts). Selection is on commands.command
 * only — NOT on blocks.stylized_command (ANSI-exploded, not greppable).
 */

const VALID_PHASES = new Set<string>([
  "specify",
  "implement",
  "review",
  // Legacy alias: the skill was renamed `implementation-gate` → `review`.
  // Old markers still carry `phase=implementation-gate`; recognized + normalized below.
  "implementation-gate",
]);

/** Parse a marker command into its spec_id + phase, or null if not a valid marker. */
export function parseMarker(
  command: string
): { spec_id: string; phase: Phase } | null {
  // Warp records the marker's `: SPEC_MARKER ...` no-op and the real command that
  // follows it as ONE multi-line commands.command value. Parse only the first
  // line — otherwise the next line's tokens bleed into `phase=...`, and a
  // marker-shaped heredoc/file body line would count as an emission.
  const firstLine = command.split("\n", 1)[0]!;
  // Agents sometimes chain the marker (`cd Pricing; : SPEC_MARKER ...`,
  // `transition-spec.sh ... && : SPEC_MARKER ...`): it still ran, so accept it
  // as any unquoted `;` / `&&` segment of the first line.
  for (const segment of unquotedSegments(firstLine)) {
    const parsed = parseMarkerSegment(segment);
    if (parsed !== null) return parsed;
  }
  return null;
}

function unquotedSegments(line: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (quote !== null) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ";" || (char === "&" && line[i + 1] === "&")) {
      segments.push(current);
      current = "";
      if (char === "&") i++;
      continue;
    }
    current += char;
  }
  segments.push(current);
  return segments;
}

function parseMarkerSegment(
  segment: string
): { spec_id: string; phase: Phase } | null {
  const tokens = segment.trim().split(" ").filter((t) => t.length > 0);
  if (tokens[0] !== ":" || tokens[1] !== "SPEC_MARKER") return null;

  let spec_id: string | null = null;
  let phase: Phase | null = null;
  for (const t of tokens) {
    if (t.startsWith("spec_id=")) {
      spec_id = t.slice("spec_id=".length);
    } else if (t.startsWith("phase=")) {
      const v = t.slice("phase=".length);
      if (VALID_PHASES.has(v)) phase = normalizePhase(v);
    }
  }
  if (spec_id === null || phase === null) return null;
  return { spec_id, phase };
}

interface MarkerJoinRow {
  command: string;
  start_ts: string;
  cid: string | null;
}

/**
 * Find every marker emission for `specId`, bound to a conversation where possible.
 * Returns seeds in start_ts order. Unbindable / collision emissions are included
 * (reported in the run summary) but carry conversation_id = null.
 */
export function findSeeds(db: ReadableDb, specId: string): SeedMatch[] {
  const rows = db.all<MarkerJoinRow>(
    `SELECT c.command, c.start_ts,
            json_extract(b.ai_metadata, '$.conversation_id') AS cid
       FROM commands c
       LEFT JOIN blocks b ON b.start_ts = c.start_ts
      WHERE c.command LIKE ': SPEC_MARKER%'
      ORDER BY c.start_ts`
  );

  // Group rows by marker command (keyed by start_ts = one emission); collect the
  // distinct conversation ids each emission binds to. Rows are already start_ts
  // ordered, so Map insertion order is chronological.
  const byEmission = new Map<
    string,
    { command: string; cids: string[] }
  >();
  for (const r of rows) {
    const entry = byEmission.get(r.start_ts) ?? { command: r.command, cids: [] };
    if (r.cid) entry.cids.push(r.cid);
    byEmission.set(r.start_ts, entry);
  }

  const seeds: SeedMatch[] = [];
  const boundConversations = new Set<string>();

  for (const [start_ts, { command, cids }] of byEmission) {
    const parsed = parseMarker(command);
    if (!parsed || parsed.spec_id !== specId) continue;

    const distinct = [...new Set(cids)];
    let status: SeedStatus;
    let conversation_id: string | null;

    if (distinct.length === 0) {
      const fallbackCid = fallbackViaAiQueries(db, start_ts);
      if (fallbackCid !== null) {
        status = "bound";
        conversation_id = fallbackCid;
      } else {
        status = "unbindable";
        conversation_id = null;
      }
    } else if (distinct.length === 1) {
      status = "bound";
      conversation_id = distinct[0]!;
    } else {
      status = "collision";
      conversation_id = null;
    }

    if (status === "bound") {
      if (boundConversations.has(conversation_id!)) continue; // dedup re-emissions
      boundConversations.add(conversation_id!);
    }

    seeds.push({
      conversation_id,
      phase: parsed.phase,
      marker_command: command,
      start_ts,
      status,
      ...(status === "bound" && distinct.length === 0 ? { confidence: "heuristic" as const } : {}),
    });
  }

  return seeds;
}

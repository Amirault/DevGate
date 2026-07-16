import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WarpSqliteAdapter } from "../adapters/warpSqliteAdapter.js";
import { WarpConversationReader } from "../adapters/warpConversationReader.js";
import { extractSpecBundle } from "../usecases/extractSpecBundle.js";
import { JsonlSink } from "../adapters/jsonlSink.js";
import { parseMarker, findSeeds } from "../adapters/readers/markerReader.js";
import { readQueries } from "../adapters/readers/queryReader.js";
import { readBlocks } from "../adapters/readers/blockReader.js";
import { readTasks } from "../adapters/readers/taskReader.js";
import { PHASES } from "../domain/models.js";

/**
 * Real integration tests against the live Warp SQLite DB on this machine.
 *
 * Unlike the fixture-driven suite, these read real protobuf blobs, real
 * ANSI-exploded blocks and real ai_queries JSON through the actual
 * WarpSqliteAdapter (VACUUM INTO snapshot) + WarpConversationReader pipeline.
 *
 * Marker binding decays: a SPEC_MARKER binds to its conversation only while the
 * blocks row at the same start_ts survives, and Warp evicts those rows. So a
 * bound spec may not exist at run time. The tests handle that honestly:
 *   - §9.14.A runs whenever any marker exists (bound or not) and asserts
 *     use-case coherence invariants that hold under decay.
 *   - §9.14.B runs whenever a live conversation with events exists and proves
 *     the readers retrieve real events independent of marker binding.
 *   - §9.14.C runs only when a bound spec exists (skipped under decay).
 *
 * The whole describe is skipped when the live DB is absent (CI, other machines)
 * so the suite stays green everywhere.
 */

const LIVE_REL =
  "Library/Group Containers/2BBY89MBSN.dev.warp/Library/Application Support/dev.warp.Warp-Stable/warp.sqlite";
const livePath = path.join(os.homedir(), LIVE_REL);
const hasLive = fs.existsSync(livePath);

const PHASE_SET = PHASES as readonly string[];

interface LiveDiscovery {
  /** Any spec id that has at least one marker emission (bound or not). */
  anySpecWithMarker: string | null;
  /** A spec id that currently has at least one bound conversation, or null. */
  boundSpec: string | null;
}

/** One snapshot to discover what the live DB offers (bound + any-marker specs). */
function discover(): LiveDiscovery {
  if (!hasLive) return { anySpecWithMarker: null, boundSpec: null };
  const source = new WarpSqliteAdapter({ liveDbPath: livePath });
  try {
    return source.withSnapshot((db) => {
      const rows = db.all<{ command: string }>(
        `SELECT command FROM commands WHERE command LIKE ': SPEC_MARKER%'`
      );
      const specIds: string[] = [];
      const seen = new Set<string>();
      for (const r of rows) {
        const parsed = parseMarker(r.command);
        if (parsed && !seen.has(parsed.spec_id)) {
          seen.add(parsed.spec_id);
          specIds.push(parsed.spec_id);
        }
      }
      let boundSpec: string | null = null;
      for (const id of specIds) {
        if (findSeeds(db, id).some((s) => s.status === "bound")) {
          boundSpec = id;
          break;
        }
      }
      return {
        anySpecWithMarker: specIds.length > 0 ? specIds[0]! : null,
        boundSpec,
      };
    });
  } catch {
    return { anySpecWithMarker: null, boundSpec: null };
  }
}

const { anySpecWithMarker, boundSpec } = discover();

describe.runIf(hasLive)("§9.14 live Warp DB integration", () => {
  it.runIf(!!anySpecWithMarker)(
    "the real spec workflow runs coherently against the live DB (invariants hold even under marker decay)",
    () => {
      // Given — a spec id that has at least one marker emission in the live DB.
      const specId = anySpecWithMarker!;

      // When — run the real pipeline (snapshot adapter -> reader -> use-case).
      const reader = new WarpConversationReader(
        new WarpSqliteAdapter({ liveDbPath: livePath })
      );
      const { bundle, summary } = extractSpecBundle(reader, specId);

      // Then — the summary is internally coherent on real data, regardless of
      // whether decay left the markers unboundable.
      expect(summary.spec_id).toBe(specId);
      for (const p of summary.phases_present) expect(PHASE_SET.includes(p)).toBe(true);
      for (const p of summary.phases_missing) expect(PHASE_SET.includes(p)).toBe(true);
      expect(summary.complete).toBe(summary.phases_missing.length === 0);

      // completeOnly was not set, so a bundle is always produced.
      expect(bundle).not.toBeNull();
      expect(summary.events).toBe(bundle!.events.length);
      expect(summary.conversations).toBe(bundle!.header.conversation_ids.length);

      // events are time-ordered with a monotonic 1..N sequence.
      const ts = bundle!.events.map((e) => e.ts);
      expect([...ts].sort()).toEqual(ts);
      expect(bundle!.events.map((e) => e.seq)).toEqual(
        bundle!.events.map((_, i) => i + 1)
      );

      // every event's phase is valid and belongs to a header conversation.
      for (const e of bundle!.events) {
        expect(PHASE_SET.includes(e.phase)).toBe(true);
        expect(bundle!.header.conversation_ids).toContain(e.conversation_id);
      }

      // eslint-disable-next-line no-console
      console.log(
        `[§9.14.A] spec "${specId}" -> conversations=${summary.conversations} events=${summary.events} complete=${summary.complete} unbindable=${summary.unbindable.length} collisions=${summary.collisions.length}`
      );
    }
  );

  it(
    "the real readers retrieve real events for a live conversation (independent of marker decay)",
    () => {
      // Given — a real conversation that has both a user prompt and an assistant
      // task (smallest such conversation, to keep the test fast). Falls back to
      // any conversation with a prompt when none has a task.
      const source = new WarpSqliteAdapter({ liveDbPath: livePath });
      const got = source.withSnapshot((db) => {
        const cands = db.all<{ cid: string; qc: number; tc: number }>(
          `SELECT q.conversation_id AS cid,
                  (SELECT count(*) FROM ai_queries x WHERE x.conversation_id = q.conversation_id) AS qc,
                  (SELECT count(*) FROM agent_tasks t WHERE t.conversation_id = q.conversation_id) AS tc
             FROM ai_queries q
            GROUP BY q.conversation_id
            ORDER BY (qc + tc) ASC`
        );
        const pick = cands.find((c) => c.tc >= 1) ?? cands[0] ?? null;
        if (!pick) return null;
        const cid = pick.cid;
        return {
          cid,
          queries: readQueries(db, [cid]),
          blocks: readBlocks(db, [cid]),
          tasks: readTasks(db, [cid]),
        };
      });

      // Then — a real conversation exists and the readers pulled real data.
      expect(got).not.toBeNull();
      expect(got!.queries.drafts.length).toBeGreaterThanOrEqual(1);
      const firstPrompt = got!.queries.drafts[0]!.content;
      expect(firstPrompt.length).toBeGreaterThan(0);

      const total =
        got!.queries.drafts.length +
        got!.blocks.drafts.length +
        got!.tasks.drafts.length;
      expect(total).toBeGreaterThanOrEqual(1);

      // eslint-disable-next-line no-console
      console.log(
        `[§9.14.B] live conversation ${got!.cid} -> queries=${got!.queries.drafts.length} blocks=${got!.blocks.drafts.length} tasks=${got!.tasks.drafts.length} (skipped q/b/t=${got!.queries.skipped.length}/${got!.blocks.skipped.length}/${got!.tasks.skipped.length}); sample prompt="${firstPrompt.slice(0, 80)}"`
      );
    }
  );

  it.runIf(!!boundSpec)(
    "retrieves a full real conversation end-to-end when a bound spec exists (skipped under marker decay)",
    () => {
      // Given — a spec that currently has at least one bound conversation.
      const specId = boundSpec!;
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-914c-"));
      try {
        // When — run the real pipeline and write a JSONL bundle.
        const reader = new WarpConversationReader(
          new WarpSqliteAdapter({ liveDbPath: livePath })
        );
        const { bundle, summary } = extractSpecBundle(reader, specId);
        const outPath = new JsonlSink(tmp).write(bundle!);

        // Then — a real conversation was retrieved and persisted as valid JSONL.
        expect(summary.conversations).toBeGreaterThanOrEqual(1);
        expect(summary.events).toBeGreaterThanOrEqual(1);

        const lines = fs
          .readFileSync(outPath, "utf8")
          .split("\n")
          .filter((l) => l.length > 0);
        for (const l of lines) JSON.parse(l); // every line is valid JSON

        const header = JSON.parse(lines[0]!) as {
          type: string;
          source: string;
          spec_id: string;
        };
        expect(header.type).toBe("bundle_header");
        expect(header.source).toBe("warp");
        expect(header.spec_id).toBe(specId);

        const events = lines.slice(1).map(
          (l) => JSON.parse(l) as { ts: string; phase: string; seq: number }
        );
        const ts = events.map((e) => e.ts);
        expect([...ts].sort()).toEqual(ts); // time-ordered
        expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
        for (const e of events) expect(PHASE_SET.includes(e.phase)).toBe(true);

        // eslint-disable-next-line no-console
        console.log(
          `[§9.14.C] bound spec "${specId}" -> wrote ${outPath} (${events.length} events, ${summary.conversations} conversations, complete=${summary.complete})`
        );
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }
  );
});

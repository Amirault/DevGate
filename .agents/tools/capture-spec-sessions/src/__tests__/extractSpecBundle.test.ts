import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFixture, seedMarker, seedQuery, seedBlock, seedTask } from "./fixtures/fixtureDb.js";
import { fakeSource } from "./fixtures/fakeSource.js";
import { encodeString } from "./fixtures/protobuf.js";
import { extractSpecBundle } from "../usecases/extractSpecBundle.js";
import { WarpConversationReader } from "../adapters/warpConversationReader.js";
import type { ConversationReader, SpecRead } from "../domain/ports.js";
import type { ConversationEvent, EventDraft, Phase, SpecBundle } from "../domain/models.js";
import { computeBundleHeader } from "../domain/bundleHeader.js";

const SPEC = "add-feature-x";

function taskBlob(text: string): Buffer {
  return encodeString(1, text);
}

describe("§9.7 extractSpecBundle completeness", () => {
  let tmp: string;
  let dbPath: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-97-"));
    dbPath = path.join(tmp, "f.db");
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("Given a spec with all three phases, When extracted, Then the bundle is complete with no missing phases", () => {
    // Given — one conversation per phase, each with a marker + a query
    const db = createFixture(dbPath);
    seedMarker(db, { spec_id: SPEC, phase: "specify", conversation_id: "c1", start_ts: "2026-06-30 10:00:00.000000" });
    seedQuery(db, { conversation_id: "c1", start_ts: "2026-06-30 10:05:00.000000", text: "spec it" });
    seedMarker(db, { spec_id: SPEC, phase: "implement", conversation_id: "c2", start_ts: "2026-06-30 11:00:00.000000" });
    seedQuery(db, { conversation_id: "c2", start_ts: "2026-06-30 11:05:00.000000", text: "implement it" });
    seedMarker(db, { spec_id: SPEC, phase: "implementation-gate", conversation_id: "c3", start_ts: "2026-06-30 12:00:00.000000" });
    seedQuery(db, { conversation_id: "c3", start_ts: "2026-06-30 12:05:00.000000", text: "gate it" });

    // When
    const { bundle, summary } = extractSpecBundle(new WarpConversationReader(fakeSource(db)), SPEC);

    // Then
    expect(bundle).not.toBeNull();
    expect(bundle!.header.complete).toBe(true);
    expect(bundle!.header.phases_present).toEqual(["specify", "implement", "implementation-gate"]);
    expect(bundle!.header.phases_missing).toEqual([]);
    expect(bundle!.header.conversations_per_phase).toEqual({
      specify: 1,
      implement: 1,
      "implementation-gate": 1,
    });
    expect(summary.complete).toBe(true);
    db.close();
  });

  it("Given a spec missing a phase plus an unbindable marker, When extracted, Then it is incomplete and the warning is surfaced", () => {
    // Given — specify + implement only, and one unbindable marker (no binding block)
    const db = createFixture(dbPath);
    seedMarker(db, { spec_id: SPEC, phase: "specify", conversation_id: "c1", start_ts: "2026-06-30 10:00:00.000000" });
    seedMarker(db, { spec_id: SPEC, phase: "implement", conversation_id: "c2", start_ts: "2026-06-30 11:00:00.000000" });
    db.prepare(`INSERT INTO commands (command, start_ts, is_agent_executed) VALUES (?, ?, 1)`).run(
      `: SPEC_MARKER v=1 spec_id=${SPEC} phase=implementation-gate`,
      "2026-06-30 12:00:00.000000"
    );

    // When
    const { bundle, summary } = extractSpecBundle(new WarpConversationReader(fakeSource(db)), SPEC);

    // Then — incomplete, missing phase reported, unbindable marker surfaced as a warning
    expect(bundle).not.toBeNull();
    expect(bundle!.header.complete).toBe(false);
    expect(bundle!.header.phases_missing).toEqual(["implementation-gate"]);
    expect(summary.complete).toBe(false);
    expect(summary.phases_missing).toEqual(["implementation-gate"]);
    expect(summary.unbindable).toHaveLength(1);
    expect(summary.unbindable[0]!.phase).toBe("implementation-gate");
    db.close();
  });

  it("Given an incomplete spec and --complete-only, When extracted, Then no bundle is produced", () => {
    // Given — only specify
    const db = createFixture(dbPath);
    seedMarker(db, { spec_id: SPEC, phase: "specify", conversation_id: "c1", start_ts: "2026-06-30 10:00:00.000000" });

    // When
    const { bundle, summary } = extractSpecBundle(new WarpConversationReader(fakeSource(db)), SPEC, { completeOnly: true });

    // Then
    expect(bundle).toBeNull();
    expect(summary.complete).toBe(false);
    db.close();
  });

  it("Given re-runs of a phase (two conversations), When extracted, Then both are kept", () => {
    // Given — two implementation-gate conversations for the same spec
    const db = createFixture(dbPath);
    seedMarker(db, { spec_id: SPEC, phase: "specify", conversation_id: "c1", start_ts: "2026-06-30 10:00:00.000000" });
    seedMarker(db, { spec_id: SPEC, phase: "implement", conversation_id: "c2", start_ts: "2026-06-30 11:00:00.000000" });
    seedMarker(db, { spec_id: SPEC, phase: "implementation-gate", conversation_id: "c3", start_ts: "2026-06-30 12:00:00.000000" });
    seedMarker(db, { spec_id: SPEC, phase: "implementation-gate", conversation_id: "c4", start_ts: "2026-06-30 13:00:00.000000" });

    // When
    const { bundle, summary } = extractSpecBundle(new WarpConversationReader(fakeSource(db)), SPEC);

    // Then — both re-run conversations kept, still complete
    expect(bundle).not.toBeNull();
    expect(bundle!.header.complete).toBe(true);
    expect(bundle!.header.conversations_per_phase["implementation-gate"]).toBe(2);
    expect(bundle!.header.conversation_ids).toEqual(["c1", "c2", "c3", "c4"]);
    expect(summary.conversations).toBe(4);
    db.close();
  });
});

describe("§9.8 extractSpecBundle ordering", () => {
  let tmp: string;
  let dbPath: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-98-"));
    dbPath = path.join(tmp, "f.db");
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("Given events across phases at various timestamps, When extracted, Then they are ordered by start_ts with a monotonic seq and the correct phase per conversation", () => {
    // Given — out-of-insertion-order timestamps across all three phases and all reader kinds
    const db = createFixture(dbPath);
    // specify conversation c1
    seedMarker(db, { spec_id: SPEC, phase: "specify", conversation_id: "c1", start_ts: "2026-06-30 09:00:00.000000" });
    seedTask(db, { conversation_id: "c1", task: taskBlob("spec task"), last_modified_at: "2026-06-30 09:30:00.000000" });
    seedQuery(db, { conversation_id: "c1", start_ts: "2026-06-30 09:10:00.000000", text: "spec query" });
    // implement conversation c2
    seedMarker(db, { spec_id: SPEC, phase: "implement", conversation_id: "c2", start_ts: "2026-06-30 10:00:00.000000" });
    seedBlock(db, { conversation_id: "c2", start_ts: "2026-06-30 10:20:00.000000", command: "npm test" });
    seedQuery(db, { conversation_id: "c2", start_ts: "2026-06-30 10:10:00.000000", text: "impl query" });
    // gate conversation c3
    seedMarker(db, { spec_id: SPEC, phase: "implementation-gate", conversation_id: "c3", start_ts: "2026-06-30 11:00:00.000000" });
    seedQuery(db, { conversation_id: "c3", start_ts: "2026-06-30 11:10:00.000000", text: "gate query" });

    // When
    const { bundle } = extractSpecBundle(new WarpConversationReader(fakeSource(db)), SPEC);

    // Then — non-decreasing timestamps and a 1..N monotonic sequence
    const events = bundle!.events;
    const ts = events.map((e) => e.ts);
    const seq = events.map((e) => e.seq);
    expect([...ts].sort()).toEqual(ts); // sorted ascending
    expect(seq).toEqual(events.map((_, i) => i + 1)); // 1..N
    expect(new Set(seq).size).toBe(seq.length); // unique
    // phase matches the conversation that emitted each event
    const phaseOf = new Map([["c1", "specify"], ["c2", "implement"], ["c3", "implementation-gate"]]);
    for (const e of events) {
      expect(e.phase).toBe(phaseOf.get(e.conversation_id));
    }
    db.close();
  });
});

// --- helpers for merge / fallback tests (no fixture DB needed) ---

function specReadWith(
  phase: Phase,
  conversationId: string,
  prompts: { ts: string; content: string }[]
): SpecRead {
  const phaseByCid = new Map<string, Phase>([[conversationId, phase]]);
  const drafts: EventDraft[] = prompts.map((p) => ({
    conversation_id: conversationId,
    ts: p.ts,
    role: "user",
    kind: "query",
    content: p.content,
    meta: {},
  }));
  return {
    source: "warp",
    phaseByCid,
    drafts,
    skipped: [],
    unbindable: [],
    collisions: [],
  };
}

function fakeReader(read: SpecRead): ConversationReader {
  return { readSpec: () => read };
}

function throwingReader(error: Error): ConversationReader {
  return { readSpec: () => { throw error; } };
}

function storedBundle(
  phase: Phase,
  conversationId: string,
  prompts: { ts: string; content: string }[]
): SpecBundle {
  const phaseByCid = new Map<string, Phase>([[conversationId, phase]]);
  const events: ConversationEvent[] = prompts.map((p, i) => ({
    spec_id: SPEC,
    phase,
    conversation_id: conversationId,
    seq: i + 1,
    ts: p.ts,
    role: "user",
    kind: "query",
    content: p.content,
    meta: {},
  }));
  const headerFields = computeBundleHeader(SPEC, "warp", phaseByCid);
  return {
    header: { type: "bundle_header", ...headerFields, extracted_at: "2026-07-14T00:00:00.000Z" },
    events,
  };
}

describe("§9.17 extractSpecBundle merge + fresh-read-error fallback", () => {
  it("Given a stored specify bundle and a fresh implement read, When extracted with existingBundle, Then the merged result has both phases and no fresh_read_error", () => {
    // Given — specify captured at close (stored); fresh read has implement only
    const existing = storedBundle("specify", "c1", [
      { ts: "2026-07-14 09:00:00.000000", content: "spec it" },
    ]);
    const reader = fakeReader(
      specReadWith("implement", "c2", [{ ts: "2026-07-14 10:00:00.000000", content: "implement it" }])
    );

    // When
    const { bundle, summary } = extractSpecBundle(reader, SPEC, { existingBundle: existing });

    // Then — both phases present (specify from disk, implement from live)
    expect(bundle).not.toBeNull();
    expect(bundle!.header.phases_present).toEqual(["specify", "implement"]);
    expect(summary.fresh_read_error).toBeNull();
    expect(bundle!.events).toHaveLength(2);
  });

  it("Given a reader that throws and a stored bundle, When extracted, Then it degrades to stored-only with a fresh_read_error warning", () => {
    // Given — fresh read fails (DB locked); stored bundle has specify + implement
    const existing = storedBundle("specify", "c1", [
      { ts: "2026-07-14 09:00:00.000000", content: "spec it" },
    ]);
    const reader = throwingReader(new Error("database is locked"));

    // When
    const { bundle, summary } = extractSpecBundle(reader, SPEC, { existingBundle: existing });

    // Then — stored bundle preserved intact, fresh_read_error set
    expect(bundle).not.toBeNull();
    expect(summary.fresh_read_error).toContain("database is locked");
    expect(bundle!.events).toHaveLength(existing.events.length);
    expect(bundle!.header.phases_present).toEqual(existing.header.phases_present);
  });

  it("Given a reader that throws and no stored bundle, When extracted, Then it throws (first capture cannot recover)", () => {
    // Given — fresh read fails, nothing on disk to fall back on
    const reader = throwingReader(new Error("database is locked"));

    // When / Then
    expect(() => extractSpecBundle(reader, SPEC)).toThrow("fresh read failed");
  });

  it("Given an existing bundle and --no-merge, When extracted, Then the result is fresh only (stored phases not recovered)", () => {
    // Given — stored specify; fresh read has implement; --no-merge replaces
    const existing = storedBundle("specify", "c1", [
      { ts: "2026-07-14 09:00:00.000000", content: "spec it" },
    ]);
    const reader = fakeReader(
      specReadWith("implement", "c2", [{ ts: "2026-07-14 10:00:00.000000", content: "implement it" }])
    );

    // When
    const { bundle } = extractSpecBundle(reader, SPEC, {
      existingBundle: existing,
      noMerge: true,
    });

    // Then — fresh only: specify NOT recovered (replaced, not merged)
    expect(bundle).not.toBeNull();
    expect(bundle!.header.phases_present).toEqual(["implement"]);
    expect(bundle!.events).toHaveLength(1);
  });
});

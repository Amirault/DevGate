import { describe, it, expect } from "vitest";
import { mergeBundles } from "../domain/mergeBundle.js";
import { normalizeBundle } from "../domain/bundleHeader.js";
import type {
  BundleSource,
  ConversationEvent,
  Phase,
  SpecBundle,
} from "../domain/models.js";

const SPEC = "2026-07-14-foo";

function event(
  conversationId: string,
  phase: Phase,
  ts: string,
  content: string,
  seq: number
): ConversationEvent {
  return {
    spec_id: SPEC,
    phase,
    conversation_id: conversationId,
    seq,
    ts,
    role: "user",
    kind: "query",
    content,
    meta: {},
  };
}

/** Build a bundle whose header is structurally valid (merge recomputes it). */
function bundle(
  events: ConversationEvent[],
  specId = SPEC,
  source: BundleSource = "warp"
): SpecBundle {
  return {
    header: {
      type: "bundle_header",
      spec_id: specId,
      phases_present: [],
      phases_missing: [],
      conversations_per_phase: { specify: 0, implement: 0, "review": 0 },
      complete: false,
      conversation_ids: [],
      extracted_at: "2026-07-14T00:00:00.000Z",
      source,
    },
    events,
  };
}

describe("§9.16 mergeBundles decay-safe merge", () => {
  it("Given a stored specify bundle and a fresh implement bundle (specify decayed live), When merged, Then both phases are present and specify is not lost", () => {
    // Given — specify captured at close (stored); implement just closed fresh;
    // specify's marker decayed so it is absent from the fresh read.
    const stored = bundle([
      event("c1", "specify", "2026-07-14 09:00:00.000000", "spec it", 1),
    ]);
    const fresh = bundle([
      event("c2", "implement", "2026-07-14 10:00:00.000000", "implement it", 1),
    ]);

    // When
    const merged = mergeBundles(stored, fresh);

    // Then — both phases survive; specify recovered from disk, implement from live
    expect(merged.header.phases_present).toEqual(["specify", "implement"]);
    expect(merged.header.phases_missing).toEqual(["review"]);
    expect(merged.header.complete).toBe(false);
    expect(merged.events).toHaveLength(2);
    expect(merged.events.map((e) => e.phase)).toEqual(["specify", "implement"]);
  });

  it("Given a stored bundle and a fresh re-read of the same conversations, When merged, Then overlapping events dedup by their natural key and no duplicates appear", () => {
    // Given — both bundles carry the same specify + implement events (re-read,
    // not yet decayed). seq differs between the two copies (per-run).
    const specifyEvents = [
      event("c1", "specify", "2026-07-14 09:00:00.000000", "spec it", 1),
      event("c1", "specify", "2026-07-14 09:10:00.000000", "spec more", 2),
    ];
    const implementEvents = [
      event("c2", "implement", "2026-07-14 10:00:00.000000", "implement it", 1),
    ];
    const stored = bundle([...specifyEvents, ...implementEvents]);
    // fresh re-read: same content, different seq assignment
    const fresh = bundle([
      event("c1", "specify", "2026-07-14 09:00:00.000000", "spec it", 1),
      event("c1", "specify", "2026-07-14 09:10:00.000000", "spec more", 2),
      event("c2", "implement", "2026-07-14 10:00:00.000000", "implement it", 3),
    ]);

    // When
    const merged = mergeBundles(stored, fresh);

    // Then — exactly 3 events (no duplicates), header recomputed from merged set
    expect(merged.events).toHaveLength(3);
    const keys = merged.events.map((e) => `${e.conversation_id}:${e.ts}:${e.content}`);
    expect(new Set(keys).size).toBe(3);
    expect(merged.header.phases_present).toEqual(["specify", "implement"]);
    expect(merged.header.conversations_per_phase).toEqual({
      specify: 1,
      implement: 1,
      "review": 0,
    });
  });

  it("Given a phase bindable fresh but some older events evicted from the live ring buffer, When merged, Then the evicted events are recovered from the stored bundle (fresh primary, stored fills gaps)", () => {
    // Given — specify captured at close with 3 prompts; since then 2 were
    // evicted from the live ring buffer, so the fresh read only has 1.
    const stored = bundle([
      event("c1", "specify", "2026-07-14 09:00:00.000000", "prompt one", 1),
      event("c1", "specify", "2026-07-14 09:10:00.000000", "prompt two", 2),
      event("c1", "specify", "2026-07-14 09:20:00.000000", "prompt three", 3),
    ]);
    const fresh = bundle([
      event("c1", "specify", "2026-07-14 09:20:00.000000", "prompt three", 1),
    ]);

    // When
    const merged = mergeBundles(stored, fresh);

    // Then — all 3 prompts present: the fresh one + the 2 evicted recovered
    expect(merged.events).toHaveLength(3);
    expect(merged.events.map((e) => e.content)).toEqual([
      "prompt one",
      "prompt two",
      "prompt three",
    ]);
  });

  it("Given merged events out of insertion order, When merged, Then they are sorted by ts with a monotonic 1..N seq", () => {
    // Given — stored specify (later ts) + fresh implement (earlier ts)
    const stored = bundle([
      event("c1", "specify", "2026-07-14 11:00:00.000000", "late specify", 1),
    ]);
    const fresh = bundle([
      event("c2", "implement", "2026-07-14 10:00:00.000000", "early implement", 1),
    ]);

    // When
    const merged = mergeBundles(stored, fresh);

    // Then — time-ordered, monotonic seq
    const ts = merged.events.map((e) => e.ts);
    expect([...ts].sort()).toEqual(ts);
    expect(merged.events.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("Given a complete spec across all three phases split across stored and fresh, When merged, Then the header reports complete=true", () => {
    // Given — specify + implement stored (captured at close); gate just closed
    // fresh. All three phases now present in the merged set.
    const stored = bundle([
      event("c1", "specify", "2026-07-14 09:00:00.000000", "spec", 1),
      event("c2", "implement", "2026-07-14 10:00:00.000000", "impl", 2),
    ]);
    const fresh = bundle([
      event("c3", "review", "2026-07-14 11:00:00.000000", "gate", 1),
    ]);

    // When
    const merged = mergeBundles(stored, fresh);

    // Then
    expect(merged.header.complete).toBe(true);
    expect(merged.header.phases_present).toEqual([
      "specify",
      "implement",
      "review",
    ]);
    expect(merged.header.phases_missing).toEqual([]);
    expect(merged.header.conversation_ids).toEqual(["c1", "c2", "c3"]);
  });

  it("Given an empty stored bundle and a non-empty fresh bundle, When merged, Then the result equals the fresh events (re-seq'd)", () => {
    // Given
    const stored = bundle([]);
    const fresh = bundle([
      event("c1", "specify", "2026-07-14 09:00:00.000000", "spec", 5),
    ]);

    // When
    const merged = mergeBundles(stored, fresh);

    // Then — fresh events kept, seq reassigned from 1
    expect(merged.events).toHaveLength(1);
    expect(merged.events[0]!.content).toBe("spec");
    expect(merged.events[0]!.seq).toBe(1);
  });

  it("Given a non-empty stored bundle and an empty fresh bundle, When merged, Then the stored events are preserved (re-seq'd)", () => {
    // Given — fresh read bound nothing (e.g. all decayed), stored has the goods
    const stored = bundle([
      event("c1", "specify", "2026-07-14 09:00:00.000000", "spec", 7),
    ]);
    const fresh = bundle([]);

    // When
    const merged = mergeBundles(stored, fresh);

    // Then — stored events survive, seq reassigned from 1
    expect(merged.events).toHaveLength(1);
    expect(merged.events[0]!.content).toBe("spec");
    expect(merged.events[0]!.seq).toBe(1);
  });
});

describe("§9.18 normalizeBundle legacy-phase normalization", () => {
  it("Given a stored bundle whose events carry the legacy `implementation-gate` phase, When normalized, Then events become `review` and the header is recomputed", () => {
    // Given — a bundle captured before the rename: events tagged implementation-gate
    const legacy = bundle([
      event("c1", "implementation-gate" as unknown as Phase, "2026-07-14 11:00:00.000000", "gate it", 1),
    ]);

    // When
    const normalized = normalizeBundle(legacy);

    // Then — legacy phase mapped to review, header recomputed consistently
    expect(normalized.events.map((e) => e.phase)).toEqual(["review"]);
    expect(normalized.header.phases_present).toEqual(["review"]);
    expect(normalized.header.phases_missing).toEqual(["specify", "implement"]);
    expect(normalized.header.conversations_per_phase).toEqual({
      specify: 0,
      implement: 0,
      review: 1,
    });
  });

  it("Given a bundle that already uses only canonical phases, When normalized, Then it is returned unchanged (fast path)", () => {
    // Given — canonical bundle, no legacy labels
    const canonical = bundle([
      event("c1", "specify", "2026-07-14 09:00:00.000000", "spec it", 1),
      event("c2", "review", "2026-07-14 11:00:00.000000", "gate it", 2),
    ]);

    // When
    const normalized = normalizeBundle(canonical);

    // Then — same reference (fast path, no recompute)
    expect(normalized).toBe(canonical);
  });
});

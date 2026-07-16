import type { ConversationEvent, Phase, SpecBundle } from "./models.js";
import { computeBundleHeader } from "./bundleHeader.js";

/**
 * The natural identity of an event: its serialized form without the per-run
 * `seq` (which is reassigned on every merge). Two events with identical content
 * at the same timestamp in the same conversation are the same event.
 */
function eventKey(e: ConversationEvent): string {
  const { seq: _seq, ...rest } = e;
  return JSON.stringify(rest);
}

/**
 * Merge a stored bundle with a fresh one, decay-safe.
 *
 * Fresh events are primary; stored events only fill gaps fresh can no longer bind
 * (full marker decay) or has evicted (partial ring-buffer eviction). Overlapping
 * (re-read) events dedup by their natural key (event sans `seq`), so no
 * duplicates appear — for re-read events the content is identical, so
 * union + dedup is safe and fresh's current data is never overridden.
 *
 * Pure — no I/O. The caller owns reading the stored bundle and writing the
 * merged result. The merged header (phases_present/missing, complete, …) is
 * recomputed from the merged event set.
 */
export function mergeBundles(existing: SpecBundle, fresh: SpecBundle): SpecBundle {
  const specId = fresh.header.spec_id;
  const seen = new Set<string>();
  const unioned: ConversationEvent[] = [];
  // Fresh first: for overlapping events the fresh copy wins (primary); stored
  // only contributes events fresh no longer has (gaps from decay/eviction).
  for (const e of [...fresh.events, ...existing.events]) {
    const key = eventKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    unioned.push(e);
  }

  // Stable sort by ts (equal timestamps keep first-seen order), then reassign a
  // monotonic seq across the whole merged bundle.
  unioned.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const events: ConversationEvent[] = unioned.map((e, i) => ({
    ...e,
    spec_id: specId,
    seq: i + 1,
  }));

  const phaseByCid = new Map<string, Phase>();
  for (const e of events) {
    if (!phaseByCid.has(e.conversation_id)) {
      phaseByCid.set(e.conversation_id, e.phase);
    }
  }

  const header = {
    type: "bundle_header" as const,
    ...computeBundleHeader(specId, fresh.header.source, phaseByCid),
    extracted_at: new Date().toISOString(),
  };

  return { header, events };
}

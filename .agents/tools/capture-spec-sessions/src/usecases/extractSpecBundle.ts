import type {
  ConversationEvent,
  EventDraft,
  RunSummary,
  SpecBundle,
} from "../domain/models.js";
import { computeBundleHeader, normalizeBundle } from "../domain/bundleHeader.js";
import { mergeBundles } from "../domain/mergeBundle.js";
import type { ConversationReader, SpecRead } from "../domain/ports.js";

export interface ExtractOptions {
  /** When true, return no bundle for an incomplete spec (phases missing). */
  completeOnly?: boolean;
  /** When true, replace the existing bundle instead of merging with it. */
  noMerge?: boolean;
  /** A previously-captured bundle to merge with (decay-safe). */
  existingBundle?: SpecBundle | null;
}

export interface ExtractResult {
  /** null when completeOnly is set and the spec is incomplete. */
  bundle: SpecBundle | null;
  summary: RunSummary;
}

function numericMeta(draft: EventDraft, key: string): number | undefined {
  const value = draft.meta[key];
  return typeof value === "number" ? value : undefined;
}

function causalSortTimestamp(
  draft: EventDraft,
  highWaterByConversation: Map<string, string>
): string {
  if (numericMeta(draft, "message_id") === undefined) return draft.ts;

  const previous = highWaterByConversation.get(draft.conversation_id);
  const sortTimestamp = previous !== undefined && previous > draft.ts ? previous : draft.ts;
  highWaterByConversation.set(draft.conversation_id, sortTimestamp);
  return sortTimestamp;
}
/**
 * Orchestrate the full extraction for one spec against a ConversationReader:
 *   reader.readSpec -> bound conversations (phase per conversation) + event drafts
 *   -> classify each event by its conversation's phase
 *   -> causally order the whole bundle and assign a monotonic seq
 *   -> compute the bundle header (completeness across the 3 phases).
 *
 * When an `existingBundle` is supplied (a prior capture on disk) and `noMerge`
 * is false, the fresh bundle is merged with it decay-safe: fresh events are
 * primary, stored events fill gaps left by marker decay or ring-buffer
 * eviction. Completeness is evaluated on the merged set.
 *
 * If the fresh external-source read errors and a stored bundle exists, the
 * result degrades to stored-only (with a `fresh_read_error` warning) instead of
 * aborting — this keeps `learn` a recovery path. With no stored bundle to fall
 * back on (first capture), it throws.
 *
 * The reader owns every source-specific detail (how a spec binds to its
 * conversations, how events are read); this use-case is source-agnostic
 * orchestration. Subagent conversations share the parent conversation_id, so
 * they are pulled in automatically by the reader — no expansion step. Re-runs
 * of a phase are distinct conversations and are all kept (no dedup across phases).
 */
export function extractSpecBundle(
  reader: ConversationReader,
  specId: string,
  options: ExtractOptions = {}
): ExtractResult {
  const {
    existingBundle: rawExistingBundle = null,
    noMerge = false,
    completeOnly = false,
  } = options;
  const existingBundle = rawExistingBundle ? normalizeBundle(rawExistingBundle) : null;

  // Try the fresh read from the external source. If it errors and we have a
  // stored bundle, degrade to stored-only so learn stays a recovery path.
  let specRead: SpecRead | null = null;
  let freshReadError: string | null = null;
  try {
    specRead = reader.readSpec(specId);
  } catch (e) {
    freshReadError = e instanceof Error ? e.message : String(e);
  }

  if (specRead === null) {
    if (existingBundle) {
      return storedOnlyResult(specId, existingBundle, freshReadError!, completeOnly);
    }
    // No stored bundle to fall back on — first capture cannot recover.
    throw new Error(
      `fresh read failed for spec "${specId}" and no stored bundle exists to fall back on: ${freshReadError}`
    );
  }

  const { source, phaseByCid, drafts, skipped, unbindable, collisions } = specRead;

  // Hermes persists true insertion order in message_id because clocks can move
  // backwards. Raise only the internal sort key to the previous timestamp in the
  // same conversation; this preserves causality while keeping the public ts intact.
  const highWaterByConversation = new Map<string, string>();
  const events: ConversationEvent[] = drafts
    .filter((d) => phaseByCid.has(d.conversation_id))
    .map((d, originalIndex) => ({
      draft: d,
      phase: phaseByCid.get(d.conversation_id)!,
      sortTimestamp: causalSortTimestamp(d, highWaterByConversation),
      originalIndex,
    }))
    .sort((a, b) =>
      a.sortTimestamp < b.sortTimestamp
        ? -1
        : a.sortTimestamp > b.sortTimestamp
          ? 1
          : a.originalIndex - b.originalIndex
    )
    .map((c, i) => ({
      spec_id: specId,
      phase: c.phase,
      conversation_id: c.draft.conversation_id,
      seq: i + 1,
      ts: c.draft.ts,
      role: c.draft.role,
      kind: c.draft.kind,
      content: c.draft.content,
      meta: c.draft.meta,
    }));

  const headerFields = computeBundleHeader(specId, source, phaseByCid);
  const freshBundle: SpecBundle = {
    header: {
      type: "bundle_header",
      ...headerFields,
      extracted_at: new Date().toISOString(),
    },
    events,
  };

  // Merge with the stored bundle when one exists and --no-merge is not set.
  const merged =
    existingBundle && !noMerge
      ? mergeBundles(existingBundle, freshBundle)
      : freshBundle;

  const bundle: SpecBundle | null =
    completeOnly && !merged.header.complete ? null : merged;

  const summary: RunSummary = {
    spec_id: specId,
    complete: merged.header.complete,
    conversations: merged.header.conversation_ids.length,
    events: merged.events.length,
    phases_present: merged.header.phases_present,
    phases_missing: merged.header.phases_missing,
    unbindable,
    collisions,
    skipped_rows: skipped,
    fresh_read_error: null,
    output_path: null,
  };

  return { bundle, summary };
}

/**
 * Build a stored-only result when the fresh read failed: re-stamp the stored
 * bundle's `extracted_at` and report its stats. The stored events are preserved
 * intact (no merge, no loss); `fresh_read_error` surfaces the degradation.
 */
function storedOnlyResult(
  specId: string,
  existingBundle: SpecBundle,
  freshReadError: string,
  completeOnly: boolean
): ExtractResult {
  const bundle: SpecBundle = {
    header: { ...existingBundle.header, extracted_at: new Date().toISOString() },
    events: existingBundle.events,
  };
  const withheld = completeOnly && !bundle.header.complete;
  const summary: RunSummary = {
    spec_id: specId,
    complete: bundle.header.complete,
    conversations: bundle.header.conversation_ids.length,
    events: bundle.events.length,
    phases_present: bundle.header.phases_present,
    phases_missing: bundle.header.phases_missing,
    unbindable: [],
    collisions: [],
    skipped_rows: [],
    fresh_read_error: freshReadError,
    output_path: null,
  };
  return { bundle: withheld ? null : bundle, summary };
}

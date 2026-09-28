import type { BundleHeader, BundleSource, Phase, SpecBundle } from "./models.js";
import { PHASES, normalizePhase } from "./models.js";

function emptyPhaseSets(): Record<Phase, Set<string>> {
  return {
    specify: new Set<string>(),
    implement: new Set<string>(),
    review: new Set<string>(),
  };
}

/**
 * Compute the bundle header fields (everything except `type` and `extracted_at`,
 * which the caller stamps) from the conversation→phase binding.
 *
 * Shared by `extractSpecBundle` (live read) and `mergeBundles` (decay-safe merge)
 * so the completeness definition — which phases count, how conversations are
 * tallied — lives in exactly one place. `phaseByCid` preserves insertion order,
 * which becomes the `conversation_ids` order.
 */
export function computeBundleHeader(
  specId: string,
  source: BundleSource,
  phaseByCid: Map<string, Phase>
): Omit<BundleHeader, "type" | "extracted_at"> {
  const cidsByPhase = emptyPhaseSets();
  for (const [cid, phase] of phaseByCid) {
    cidsByPhase[phase].add(cid);
  }
  const phases_present = PHASES.filter((p) => cidsByPhase[p].size > 0);
  const phases_missing = PHASES.filter((p) => cidsByPhase[p].size === 0);
  const conversations_per_phase = Object.fromEntries(
    PHASES.map((p) => [p, cidsByPhase[p].size])
  ) as Record<Phase, number>;
  return {
    spec_id: specId,
    phases_present,
    phases_missing,
    conversations_per_phase,
    complete: phases_missing.length === 0,
    conversation_ids: [...phaseByCid.keys()],
    source,
  };
}

/** Legacy phase value captured before the `implementation-gate` → `review` rename. */
const LEGACY_PHASE = "implementation-gate";

/**
 * Normalize a stored bundle so legacy `implementation-gate` phases become `review`.
 *
 * Bundles captured before the skill rename carry the old phase value in their
 * events and header. This maps every event's phase to its canonical name and
 * recomputes the header from the normalized events (preserving `extracted_at`).
 * A bundle that already uses canonical phases is returned unchanged.
 */
export function normalizeBundle(b: SpecBundle): SpecBundle {
  const needsNormalize =
    b.events.some((e) => (e.phase as string) === LEGACY_PHASE) ||
    (b.header.phases_present as readonly string[]).includes(LEGACY_PHASE) ||
    (b.header.phases_missing as readonly string[]).includes(LEGACY_PHASE);
  if (!needsNormalize) return b;

  const events = b.events.map((e) => ({ ...e, phase: normalizePhase(e.phase) }));
  const phaseByCid = new Map<string, Phase>();
  for (const e of events) {
    if (!phaseByCid.has(e.conversation_id)) phaseByCid.set(e.conversation_id, e.phase);
  }
  const headerFields = computeBundleHeader(b.header.spec_id, b.header.source, phaseByCid);
  return {
    header: { type: "bundle_header", ...headerFields, extracted_at: b.header.extracted_at },
    events,
  };
}

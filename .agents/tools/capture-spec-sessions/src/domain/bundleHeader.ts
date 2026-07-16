import type {
  BundleHeader,
  BundleSource,
  Phase,
  SpecBundle,
} from "./models.js";
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

const LEGACY_PHASE = "implementation-gate";

/**
 * Normalize a bundle whose events may carry the legacy `implementation-gate`
 * phase label (emitted before the phase was renamed to `review`). Events are
 * mapped to the canonical phase and the header is recomputed so the
 * phases_present / phases_missing / conversations_per_phase fields stay
 * consistent. Bundles that already use only canonical phases are returned
 * unchanged (fast path — no recompute).
 */
export function normalizeBundle(bundle: SpecBundle): SpecBundle {
  if (!bundle.events.some((e) => (e.phase as string) === LEGACY_PHASE)) {
    return bundle;
  }
  const events = bundle.events.map((e) => ({
    ...e,
    phase: normalizePhase(e.phase as string),
  }));
  const phaseByCid = new Map<string, Phase>();
  for (const e of events) {
    if (!phaseByCid.has(e.conversation_id)) {
      phaseByCid.set(e.conversation_id, e.phase);
    }
  }
  const headerFields = computeBundleHeader(
    bundle.header.spec_id,
    bundle.header.source,
    phaseByCid
  );
  return {
    header: {
      ...headerFields,
      type: "bundle_header",
      extracted_at: bundle.header.extracted_at,
    },
    events,
  };
}

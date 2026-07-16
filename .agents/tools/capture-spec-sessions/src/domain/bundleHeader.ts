import type { BundleHeader, BundleSource, Phase } from "./models.js";
import { PHASES } from "./models.js";

function emptyPhaseSets(): Record<Phase, Set<string>> {
  return {
    specify: new Set<string>(),
    implement: new Set<string>(),
    "implementation-gate": new Set<string>(),
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

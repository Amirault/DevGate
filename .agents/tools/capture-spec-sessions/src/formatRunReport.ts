import type { RunSummary } from "./domain/models.js";

/** What the CLI should print and exit with for one extraction run. */
export interface RunReport {
  exitCode: number;
  stdout: string[];
  stderr: string[];
}

const LIST_HINT = "run --list to check available specs.";
const BINDING_DECAY_HINT =
  "a marker was found but its binding block is gone — Warp can evict blocks rows over time; extract soon after finishing a spec, before the binding decays.";

/**
 * One line per anomaly (never a bare count): a marker binding failure or a
 * skipped row hides its cause behind a number, which is exactly what made a
 * silent, empty extraction hard to diagnose. Detail is cheap since these rows
 * are rare in practice.
 */
function anomalyLines(summary: RunSummary): string[] {
  const lines: string[] = [];
  if (summary.fresh_read_error) {
    lines.push(
      `fresh read failed: ${summary.fresh_read_error} — using stored bundle`
    );
  }
  for (const s of summary.unbindable) {
    lines.push(`unbindable marker: phase=${s.phase} start_ts=${s.start_ts}`);
  }
  for (const s of summary.collisions) {
    lines.push(
      `collision marker: phase=${s.phase} start_ts=${s.start_ts} (bound to multiple conversations)`
    );
  }
  for (const r of summary.skipped_rows) {
    lines.push(`skipped row: table=${r.table} reason="${r.reason}" (${r.detail})`);
  }
  return lines;
}

/**
 * Format the CLI's report for one extraction run.
 *
 * `outPath` is the file actually written, or null when nothing was written —
 * either because zero conversations bound (regardless of --complete-only) or
 * because --complete-only withheld an incomplete bundle. Distinguishing those
 * two only needs `summary.conversations`, so the caller doesn't pass a reason.
 */
export function formatRunReport(summary: RunSummary, outPath: string | null): RunReport {
  const anomalies = anomalyLines(summary);

  if (outPath !== null) {
    const stdout = [
      `wrote ${outPath} (${summary.events} events, ${summary.conversations} conversations, complete=${summary.complete})`,
    ];
    const stderr = anomalies.length > 0 ? ["warnings:", ...anomalies] : [];
    return { exitCode: 0, stdout, stderr };
  }

  if (summary.conversations === 0) {
    const stderr = [
      `no conversations bound for spec "${summary.spec_id}" — nothing written.`,
      ...anomalies,
    ];
    if (summary.unbindable.length > 0) stderr.push(BINDING_DECAY_HINT);
    stderr.push(LIST_HINT);
    return { exitCode: 1, stdout: [], stderr };
  }

  // Conversations were bound, but --complete-only withheld an incomplete bundle.
  const stderr = [
    `incomplete spec "${summary.spec_id}": missing phases [${summary.phases_missing.join(", ")}]. --complete-only set; nothing written.`,
    ...anomalies,
  ];
  return { exitCode: 1, stdout: [], stderr };
}

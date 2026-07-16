import { describe, it, expect } from "vitest";
import type { RunSummary, SeedMatch, SkippedRow } from "../domain/models.js";
import { formatRunReport } from "../formatRunReport.js";

const SPEC = "add-feature-x";

function baseSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    spec_id: SPEC,
    complete: true,
    conversations: 1,
    events: 3,
    phases_present: ["specify", "implement", "implementation-gate"],
    phases_missing: [],
    unbindable: [],
    collisions: [],
    skipped_rows: [],
    fresh_read_error: null,
    output_path: null,
    ...overrides,
  };
}

function unbindableMarker(phase: SeedMatch["phase"], start_ts: string): SeedMatch {
  return {
    conversation_id: null,
    phase,
    marker_command: `: SPEC_MARKER v=1 spec_id=${SPEC} phase=${phase}`,
    start_ts,
    status: "unbindable",
  };
}

function collisionMarker(phase: SeedMatch["phase"], start_ts: string): SeedMatch {
  return {
    conversation_id: null,
    phase,
    marker_command: `: SPEC_MARKER v=1 spec_id=${SPEC} phase=${phase}`,
    start_ts,
    status: "collision",
  };
}

describe("§9.13 formatRunReport — CLI diagnostics", () => {
  it("Given a fully bound complete spec with a written bundle, When formatted, Then it succeeds with no anomaly lines", () => {
    // Given
    const summary = baseSummary();
    const outPath = "out/add-feature-x.jsonl";

    // When
    const report = formatRunReport(summary, outPath);

    // Then
    expect(report.exitCode).toBe(0);
    expect(report.stdout).toHaveLength(1);
    expect(report.stdout[0]).toContain("wrote");
    expect(report.stdout[0]).toContain(outPath);
    expect(report.stderr).toEqual([]);
  });

  it("Given zero bound conversations with an unbindable marker, When formatted, Then nothing is written, exit is 1, and the binding-decay hint plus per-marker detail are surfaced", () => {
    // Given — the marker was found but its binding block has decayed
    const summary = baseSummary({
      conversations: 0,
      events: 0,
      complete: false,
      phases_present: [],
      phases_missing: ["specify", "implement", "implementation-gate"],
      unbindable: [unbindableMarker("implement", "2026-06-30 11:00:00.000000")],
    });

    // When
    const report = formatRunReport(summary, null);

    // Then
    expect(report.exitCode).toBe(1);
    expect(report.stdout).toEqual([]);
    const joined = report.stderr.join("\n");
    expect(joined).toContain("no conversations bound");
    expect(joined).toContain(SPEC);
    expect(joined).toContain("phase=implement");
    expect(joined).toContain("2026-06-30 11:00:00.000000");
    expect(joined.toLowerCase()).toContain("binding");
    expect(joined).toContain("--list");
  });

  it("Given a bound-but-incomplete spec with --complete-only, When formatted, Then nothing is written, exit is 1, and the missing phases are named without a binding-decay hint", () => {
    // Given — two of three phases bound, no anomalies
    const summary = baseSummary({
      conversations: 2,
      complete: false,
      phases_present: ["specify", "implement"],
      phases_missing: ["implementation-gate"],
    });

    // When
    const report = formatRunReport(summary, null);

    // Then
    expect(report.exitCode).toBe(1);
    const joined = report.stderr.join("\n");
    expect(joined).toContain("incomplete spec");
    expect(joined).toContain("implementation-gate");
    expect(joined.toLowerCase()).not.toContain("binding");
    expect(joined).not.toContain("--list");
  });

  it("Given a written bundle alongside an unbindable marker and a collision, When formatted, Then it still succeeds but every anomaly is detailed instead of a bare count", () => {
    // Given
    const summary = baseSummary({
      unbindable: [unbindableMarker("specify", "2026-06-30 09:00:00.000000")],
      collisions: [collisionMarker("implement", "2026-06-30 10:00:00.000000")],
      skipped_rows: [
        { table: "ai_queries", reason: "input failed schema", detail: "cid=c9 ts=x" } satisfies SkippedRow,
      ],
    });
    const outPath = "out/add-feature-x.jsonl";

    // When
    const report = formatRunReport(summary, outPath);

    // Then
    expect(report.exitCode).toBe(0);
    expect(report.stdout[0]).toContain("wrote");
    const joined = report.stderr.join("\n");
    expect(joined).toContain("phase=specify");
    expect(joined).toContain("2026-06-30 09:00:00.000000");
    expect(joined).toContain("phase=implement");
    expect(joined).toContain("2026-06-30 10:00:00.000000");
    expect(joined).toContain("ai_queries");
    expect(joined).toContain("input failed schema");
    // no bare "N unbindable, N collisions" style summary line
    expect(joined).not.toContain("1 unbindable, 1 collisions");
  });
});

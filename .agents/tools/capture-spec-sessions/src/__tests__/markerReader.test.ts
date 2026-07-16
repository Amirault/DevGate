import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ansiWrap,
  createFixture,
  seedMarker,
  seedUnbindableMarker,
} from "./fixtures/fixtureDb.js";
import { wrapReadableDb } from "../adapters/sqliteReadableDb.js";
import { findSeeds, parseMarker } from "../adapters/readers/markerReader.js";

describe("parseMarker", () => {
  it("parses a well-formed marker for each phase", () => {
    expect(parseMarker(": SPEC_MARKER v=1 spec_id=2026-06-30-x phase=specify")).toEqual({
      spec_id: "2026-06-30-x",
      phase: "specify",
    });
    expect(
      parseMarker(": SPEC_MARKER v=1 spec_id=y phase=implementation-gate")
    ).toEqual({ spec_id: "y", phase: "review" });
  });

  it("rejects non-marker text (diagnostic scripts that merely mention the marker)", () => {
    expect(parseMarker("python3 -c 'print(\"SPEC_MARKER\")'")).toBeNull();
    expect(parseMarker("grep SPEC_MARKER commands")).toBeNull();
  });

  it("rejects an invalid phase", () => {
    expect(parseMarker(": SPEC_MARKER v=1 spec_id=x phase=unknown")).toBeNull();
  });
});

describe("§9.2/§9.3 markerReader — selection & binding", () => {
  let tmp: string;
  let dbPath: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-93-"));
    dbPath = path.join(tmp, "f.db");
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("Given a marker command and a block at the same start_ts with conversation_id C1, When selecting, Then C1 is a bound seed with the marker phase", () => {
    // Given
    const db = createFixture(dbPath);
    seedMarker(db, {
      spec_id: "X",
      phase: "specify",
      conversation_id: "C1",
      start_ts: "2026-06-30 10:00:00.000000",
    });

    // When
    const seeds = findSeeds(wrapReadableDb(db), "X");

    // Then
    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toMatchObject({
      conversation_id: "C1",
      phase: "specify",
      status: "bound",
    });
    db.close();
  });

  it("Given two specs X and Y with distinct markers, When selecting X, Then only X's conversations are returned (no bleed from Y)", () => {
    // Given
    const db = createFixture(dbPath);
    seedMarker(db, {
      spec_id: "X",
      phase: "specify",
      conversation_id: "CX",
      start_ts: "2026-06-30 10:00:00.000000",
    });
    seedMarker(db, {
      spec_id: "Y",
      phase: "implement",
      conversation_id: "CY",
      start_ts: "2026-06-30 11:00:00.000000",
    });

    // When / Then
    expect(findSeeds(wrapReadableDb(db), "X").map((s) => s.conversation_id)).toEqual([
      "CX",
    ]);
    expect(findSeeds(wrapReadableDb(db), "Y").map((s) => s.conversation_id)).toEqual([
      "CY",
    ]);
    db.close();
  });

  it("Given a marker command with no matching block on start_ts, When selecting, Then the conversation is reported as unbindable (not silently dropped)", () => {
    // Given
    const db = createFixture(dbPath);
    seedUnbindableMarker(db, {
      spec_id: "X",
      phase: "specify",
      start_ts: "2026-06-30 10:00:00.000000",
    });

    // When
    const seeds = findSeeds(wrapReadableDb(db), "X");

    // Then
    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toMatchObject({ status: "unbindable", conversation_id: null });
    db.close();
  });

  it("Given the marker text appears only in blocks.stylized_command (ANSI), When selecting, Then it is NOT matched (grep is on commands.command only)", () => {
    // Given — a block whose stylized_command holds the marker text, but no commands row
    const db = createFixture(dbPath);
    db.prepare(
      `INSERT INTO blocks (pane_leaf_uuid, stylized_command, stylized_output, pwd, git_branch, exit_code, did_execute, start_ts, ai_metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      Buffer.from([1]),
      ansiWrap(": SPEC_MARKER v=1 spec_id=X phase=specify"),
      Buffer.from(""),
      "/repo",
      "main",
      0,
      1,
      "2026-06-30 10:00:00.000000",
      JSON.stringify({ conversation_id: "C-ansi" })
    );

    // When / Then
    expect(findSeeds(wrapReadableDb(db), "X")).toEqual([]);
    db.close();
  });

  it("Given a diagnostic command that merely mentions the marker, When selecting, Then it is NOT matched (anchored : SPEC_MARKER only)", () => {
    // Given — an exploration script whose command text contains "SPEC_MARKER"
    const db = createFixture(dbPath);
    db.prepare(
      `INSERT INTO commands (command, start_ts, is_agent_executed) VALUES (?, ?, 1)`
    ).run(
      `python3 -c 'print("SPEC_MARKER v=1 spec_id=X phase=specify")'`,
      "2026-06-30 10:00:00.000000"
    );

    // When / Then
    expect(findSeeds(wrapReadableDb(db), "X")).toEqual([]);
    db.close();
  });

  it("Given no markers for the slug, When selecting, Then no seeds are returned", () => {
    const db = createFixture(dbPath);
    expect(findSeeds(wrapReadableDb(db), "missing")).toEqual([]);
    db.close();
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractSpecBundle } from "../usecases/extractSpecBundle.js";
import { ClaudeCodeTranscriptReader } from "../adapters/claudeCodeTranscriptReader.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, "..", "..");
const TSX = path.join(ROOT, "node_modules", ".bin", "tsx");
const SPEC = "2026-06-30-multiquote-limit-5";

type Json = Record<string, unknown>;

function writeTranscript(root: string, sessionId: string, entries: Json[]): void {
  const projectDir = path.join(root, "-Users-tony-Wakam-Pricing");
  fs.mkdirSync(projectDir, { recursive: true });
  const transcriptPath = path.join(projectDir, `${sessionId}.jsonl`);
  fs.writeFileSync(transcriptPath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
}

function userEntry(sessionId: string, uuid: string, timestamp: string, content: unknown): Json {
  return {
    type: "user",
    uuid,
    parentUuid: null,
    sessionId,
    cwd: "/Users/tony/Wakam/Pricing",
    gitBranch: "main",
    version: "2.1.202",
    message: { role: "user", content },
    timestamp,
  };
}

function assistantEntry(sessionId: string, uuid: string, timestamp: string, content: unknown[]): Json {
  return {
    type: "assistant",
    uuid,
    parentUuid: null,
    sessionId,
    cwd: "/Users/tony/Wakam/Pricing",
    gitBranch: "main",
    version: "2.1.202",
    message: {
      id: `msg_${uuid}`,
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-5-20250929",
      content,
      usage: { input_tokens: 42, output_tokens: 7 },
    },
    timestamp,
  };
}

function toolResultEntry(sessionId: string, uuid: string, timestamp: string, toolUseId: string, content = "done"): Json {
  return userEntry(sessionId, uuid, timestamp, [
    { type: "tool_result", tool_use_id: toolUseId, content },
  ]);
}

function markerCommand(phase: string): string {
  return `: SPEC_MARKER v=1 spec_id=${SPEC} phase=${phase}`;
}

describe("ClaudeCodeTranscriptReader", () => {
  let tmp: string;
  let claudeRoot: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-claude-"));
    claudeRoot = path.join(tmp, ".claude", "projects");
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("Given Claude Code JSONL transcripts with spec markers, When extracted, Then conversations are grouped by phase with Claude events preserved", () => {
    // Given — one Claude Code session per phase, each bound by the existing SPEC_MARKER no-op command.
    writeTranscript(claudeRoot, "session-specify", [
      userEntry("session-specify", "u1", "2026-06-30T09:00:00.000Z", `please specify ${SPEC}`),
      assistantEntry("session-specify", "a1", "2026-06-30T09:00:01.000Z", [
        { type: "text", text: "I will write the spec." },
        { type: "tool_use", id: "toolu_spec", name: "Bash", input: { command: markerCommand("specify") } },
      ]),
      toolResultEntry("session-specify", "r1", "2026-06-30T09:00:02.000Z", "toolu_spec"),
    ]);
    writeTranscript(claudeRoot, "session-implement", [
      userEntry("session-implement", "u2", "2026-06-30T10:00:00.000Z", `implement ${SPEC}`),
      assistantEntry("session-implement", "a2", "2026-06-30T10:00:01.000Z", [
        { type: "tool_use", id: "toolu_impl", name: "Bash", input: { command: markerCommand("implement") } },
        { type: "tool_use", id: "toolu_test", name: "Bash", input: { command: "npm test" } },
      ]),
      toolResultEntry("session-implement", "r2", "2026-06-30T10:00:02.000Z", "toolu_test", "all tests passed"),
    ]);
    writeTranscript(claudeRoot, "session-gate", [
      userEntry("session-gate", "u3", "2026-06-30T11:00:00.000Z", `validate ${SPEC}`),
      assistantEntry("session-gate", "a3", "2026-06-30T11:00:01.000Z", [
        { type: "text", text: "Gate is green." },
        { type: "tool_use", id: "toolu_gate", name: "Bash", input: { command: markerCommand("implementation-gate") } },
      ]),
    ]);

    // When
    const { bundle, summary } = extractSpecBundle(new ClaudeCodeTranscriptReader({ rootDir: claudeRoot }), SPEC);

    // Then
    expect(bundle).not.toBeNull();
    expect(bundle!.header.source).toBe("claude-code");
    expect(bundle!.header.complete).toBe(true);
    expect(bundle!.header.conversation_ids).toEqual(["session-specify", "session-implement", "session-gate"]);
    expect(bundle!.header.conversations_per_phase).toEqual({
      specify: 1,
      implement: 1,
      "implementation-gate": 1,
    });
    expect(summary.skipped_rows).toEqual([]);

    const events = bundle!.events;
    expect(events.map((event) => event.seq)).toEqual(events.map((_, index) => index + 1));
    expect(events.map((event) => event.ts)).toEqual([...events.map((event) => event.ts)].sort());

    expect(events).toContainEqual(expect.objectContaining({
      conversation_id: "session-specify",
      phase: "specify",
      role: "user",
      kind: "query",
      content: `please specify ${SPEC}`,
      meta: expect.objectContaining({ cwd: "/Users/tony/Wakam/Pricing", git_branch: "main" }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      conversation_id: "session-implement",
      phase: "implement",
      role: "assistant",
      kind: "tool_call",
      content: "npm test",
      meta: expect.objectContaining({ tool: "Bash", tool_use_id: "toolu_test" }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      conversation_id: "session-implement",
      phase: "implement",
      role: "tool",
      kind: "tool_result",
      content: "all tests passed",
      meta: expect.objectContaining({ tool_use_id: "toolu_test" }),
    }));
  });

  it("Given the CLI is asked for Claude Code source, When it runs, Then it writes the same JSONL bundle format with source claude-code", () => {
    // Given
    const outDir = path.join(tmp, "out");
    writeTranscript(claudeRoot, "session-specify", [
      userEntry("session-specify", "u1", "2026-06-30T09:00:00.000Z", `specify ${SPEC}`),
      assistantEntry("session-specify", "a1", "2026-06-30T09:00:01.000Z", [
        { type: "tool_use", id: "toolu_spec", name: "Bash", input: { command: markerCommand("specify") } },
      ]),
    ]);

    // When
    const stdout = execFileSync(TSX, [
      "src/cli.ts",
      "--source",
      "claude-code",
      "--claude-root",
      claudeRoot,
      "--spec",
      SPEC,
      "--out",
      outDir,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 30000,
    });

    // Then
    const raw = fs.readFileSync(path.join(outDir, `${SPEC}.jsonl`), "utf8");
    const [headerLine, ...eventLines] = raw.trimEnd().split("\n");
    const header = JSON.parse(headerLine!);
    expect(stdout).toContain("wrote");
    expect(header).toEqual(expect.objectContaining({
      type: "bundle_header",
      spec_id: SPEC,
      source: "claude-code",
      complete: false,
      phases_present: ["specify"],
      phases_missing: ["implement", "implementation-gate"],
    }));
    expect(eventLines.map((line) => JSON.parse(line)).some((event) => event.kind === "tool_call")).toBe(true);
  });

  it("Given a Claude Code transcript only mentions the marker in a prompt, When extracted, Then it is not bound as a captured phase", () => {
    // Given — Claude Code records failed unauthenticated prompts too; a text mention
    // must not count as the phase marker unless Claude actually emitted the Bash tool_use.
    writeTranscript(claudeRoot, "session-mention-only", [
      userEntry("session-mention-only", "u1", "2026-06-30T09:00:00.000Z", markerCommand("specify")),
      assistantEntry("session-mention-only", "a1", "2026-06-30T09:00:01.000Z", [
        { type: "text", text: "Not logged in · Please run /login" },
      ]),
    ]);

    // When
    const { bundle, summary } = extractSpecBundle(new ClaudeCodeTranscriptReader({ rootDir: claudeRoot }), SPEC);

    // Then
    expect(bundle).not.toBeNull();
    expect(bundle!.header.source).toBe("claude-code");
    expect(bundle!.header.conversation_ids).toEqual([]);
    expect(summary.conversations).toBe(0);
    expect(summary.events).toBe(0);
  });

  it("Given a marker-shaped command field on a non-Bash tool_use, When extracted, Then it is not bound", () => {
    // Given — SPEC_MARKER is a shell no-op; only Bash tool_use blocks prove it was emitted.
    writeTranscript(claudeRoot, "session-non-bash", [
      assistantEntry("session-non-bash", "a1", "2026-06-30T09:00:00.000Z", [
        { type: "tool_use", id: "toolu_write", name: "Write", input: { command: markerCommand("specify"), file_path: "notes.md" } },
      ]),
    ]);

    // When
    const { summary } = extractSpecBundle(new ClaudeCodeTranscriptReader({ rootDir: claudeRoot }), SPEC);

    // Then
    expect(summary.conversations).toBe(0);
    expect(summary.events).toBe(0);
  });

  it("Given a marker-shaped Bash tool_use outside an assistant turn, When extracted, Then it is not bound", () => {
    // Given — Claude emits tool_use blocks from assistant turns; user/tool-result turns must not seed phases.
    writeTranscript(claudeRoot, "session-user-tool-use", [
      userEntry("session-user-tool-use", "u1", "2026-06-30T09:00:00.000Z", [
        { type: "tool_use", id: "toolu_user", name: "Bash", input: { command: markerCommand("specify") } },
      ]),
    ]);

    // When
    const { summary } = extractSpecBundle(new ClaudeCodeTranscriptReader({ rootDir: claudeRoot }), SPEC);

    // Then
    expect(summary.conversations).toBe(0);
    expect(summary.events).toBe(0);
  });
});

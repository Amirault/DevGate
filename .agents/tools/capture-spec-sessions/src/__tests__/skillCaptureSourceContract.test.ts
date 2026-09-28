import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.resolve(TEST_DIR, "..", "..", "..", "..", "skills");
const CLI = ".agents/tools/capture-spec-sessions/capture.sh";
const RAW_CLI = "src/cli.ts";
const EXTRACTION_COMMAND = `${CLI} --spec <slug> --source <session_source>`;
const SOURCE_MAPPING = "Warp → `warp`, Claude Code → `claude-code`, Hermes → `hermes`";
const MARKER_TOOL_MAPPING =
  "Warp → `run_shell_command`, Claude Code → `Bash`, Hermes → `terminal` or `run_shell_command`";
const MARKER_STANDALONE = "the whole command is the marker line alone";
const MARKER_REFERENCE = ".agents/skills/specify/references/spec-marker.md";

const SKILL_PATHS = [
  "specify/SKILL.md",
  "implement/SKILL.md",
  "review/SKILL.md",
  "learn/SKILL.md",
];
const MARKER_SKILL_PATHS = ["specify/SKILL.md", "implement/SKILL.md", "review/SKILL.md"];

function readNormalized(relativePath: string): string {
  return fs
    .readFileSync(path.join(AGENTS_DIR, relativePath), "utf8")
    .replace(/\s+/g, " ");
}

function occurrenceCount(content: string, token: string): number {
  return content.split(token).length - 1;
}

describe("skill capture source contract", () => {
  it.each(SKILL_PATHS)(
    "Given %s contains capture commands, When the contract is inspected, Then every extraction command selects the active runtime source explicitly",
    (relativePath) => {
      // Given
      const content = readNormalized(relativePath);
      const extractionCount = occurrenceCount(content, `${CLI} --spec <slug>`);

      // When / Then
      expect(extractionCount, `${relativePath} must contain a capture command`).toBeGreaterThan(0);
      expect(occurrenceCount(content, EXTRACTION_COMMAND)).toBe(extractionCount);
      expect(content).toContain(SOURCE_MAPPING);
      expect(content).not.toContain("local Warp DB");
      expect(content, `${relativePath} must go through the capture.sh wrapper`).not.toContain(RAW_CLI);
    }
  );

  it.each(MARKER_SKILL_PATHS)(
    "Given %s emits a correlation marker, When the marker instructions are inspected, Then they select the shell tool for every supported runtime",
    (relativePath) => {
      expect(readNormalized(relativePath)).toContain(MARKER_TOOL_MAPPING);
    }
  );

  it.each(MARKER_SKILL_PATHS)(
    "Given %s emits a correlation marker, When the marker instructions are inspected, Then they require a standalone call and point at the marker reference by its repo path",
    (relativePath) => {
      // Given
      const content = readNormalized(relativePath);

      // When / Then
      expect(content).toContain(MARKER_STANDALONE);
      expect(content).toContain(MARKER_REFERENCE);
    }
  );
});

describe("learn skill structure", () => {
  it("Given learn/SKILL.md, When its raw content is inspected, Then the pipeline sits in a fenced yaml block with its nesting intact", () => {
    // Given — Prettier flattens unfenced pseudo-YAML in Markdown (it happened in #3029);
    // readNormalized collapses whitespace, so nesting is checked on the raw file.
    const raw = fs.readFileSync(path.join(AGENTS_DIR, "learn/SKILL.md"), "utf8");

    // When
    const fencedBlock = raw.split("```yaml\n")[1]?.split("\n```")[0] ?? "";

    // Then
    expect(fencedBlock).toContain("\nscope:\n  in_scope:\n    - ");
    expect(fencedBlock).toContain("\npipeline:\n");
  });
});

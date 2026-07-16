import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listSpecSlugs } from "../backlogLister.js";

describe("backlogLister", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-bl-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("Given docs/backlog with spec files across subdirs, When listed, Then slugs are sorted, unique, and non-md files are ignored", () => {
    // Given
    fs.mkdirSync(path.join(tmp, "docs/backlog/todo"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "docs/backlog/in-progress"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "docs/backlog/done"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "docs/backlog/todo/zeta.md"), "");
    fs.writeFileSync(path.join(tmp, "docs/backlog/todo/alpha.md"), "");
    fs.writeFileSync(path.join(tmp, "docs/backlog/in-progress/alpha.md"), ""); // dup across dirs
    fs.writeFileSync(path.join(tmp, "docs/backlog/done/mid.md"), "");
    fs.writeFileSync(path.join(tmp, "docs/backlog/done/notes.txt"), ""); // non-md, ignored

    // When
    const slugs = listSpecSlugs(tmp);

    // Then
    expect(slugs).toEqual(["alpha", "mid", "zeta"]);
  });

  it("Given no docs/backlog dir, When listed, Then an empty array is returned (no throw)", () => {
    expect(listSpecSlugs(tmp)).toEqual([]);
  });
});

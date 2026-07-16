import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFixture, seedTask } from "./fixtures/fixtureDb.js";
import { wrapReadableDb } from "../adapters/sqliteReadableDb.js";
import { readTasks } from "../adapters/readers/taskReader.js";
import { encodeString, encodeMessage, encodeVarint, encodeTag } from "./fixtures/protobuf.js";

const CID = "c-1";

describe("§9.6 taskReader", () => {
  let tmp: string;
  let dbPath: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-96-"));
    dbPath = path.join(tmp, "f.db");
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("Given a Task BLOB with description, dependencies, and summary, When read, Then agent_message events carry semantic field_paths", () => {
    // Given — Task: description(1), dependencies.parent_task_id(3.1), summary(6)
    const db = createFixture(dbPath);
    const blob = Buffer.concat([
      encodeString(1, "Task title"),
      encodeMessage(3, encodeString(1, "parent-task-id")),
      encodeString(6, "command output"),
    ]);
    seedTask(db, {
      conversation_id: CID,
      task: blob,
      last_modified_at: "2026-06-30 12:00:00.000000",
    });

    // When
    const { drafts, skipped } = readTasks(wrapReadableDb(db), [CID]);

    // Then
    expect(skipped).toEqual([]);
    expect(drafts.map((d) => d.content)).toEqual([
      "Task title",
      "parent-task-id",
      "command output",
    ]);
    expect(drafts[0]).toMatchObject({
      conversation_id: CID,
      role: "assistant",
      kind: "agent_message",
      ts: "2026-06-30 12:00:00.000000",
    });
    // field 1 = Task.id, field 3 = Task.dependencies, field 6 = Task.summary
    expect(drafts[0]!.meta.field_path).toBe("id");
    expect(drafts[1]!.meta.field_path).toBe("dependencies.parent_task_id");
    expect(drafts[0]!.meta).not.toHaveProperty("confidence");
    db.close();
  });

  it("Given a malformed task BLOB, When read, Then partial results are returned marked confidence:heuristic without throwing", () => {
    // Given — a recoverable string then a truncated length-delimited field
    const db = createFixture(dbPath);
    const blob = Buffer.concat([
      encodeString(1, "recovered text"),
      Buffer.concat([encodeTag(2, 2), encodeVarint(100), Buffer.from("abc")]),
    ]);
    seedTask(db, { conversation_id: CID, task: blob });

    // When
    const { drafts } = readTasks(wrapReadableDb(db), [CID]);

    // Then
    const ev = drafts.find((d) => d.content === "recovered text");
    expect(ev).toBeDefined();
    expect(ev!.meta.field_path).toBe("id");
    expect(ev!.meta.confidence).toBe("heuristic");
    db.close();
  });

  it("Given an empty task BLOB, When read, Then the row is skipped and the run continues", () => {
    // Given
    const db = createFixture(dbPath);
    seedTask(db, { conversation_id: CID, task: Buffer.alloc(0) });

    // When
    const { drafts, skipped } = readTasks(wrapReadableDb(db), [CID]);

    // Then
    expect(drafts).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.table).toBe("agent_tasks");
    expect(skipped[0]!.reason).toBe("empty task");
    db.close();
  });

  it("Given no conversation ids, When reading, Then empty results (no empty IN clause)", () => {
    const db = createFixture(dbPath);
    expect(readTasks(wrapReadableDb(db), [])).toEqual({ drafts: [], skipped: [] });
    db.close();
  });
});

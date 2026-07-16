# Spec-Bundle Conversation Adapter

Reads local agent session stores and exports **one spec's full conversation
history** — across the three spec-driven phases (`specify`, `implement`,
`review`) — as raw JSONL, ordered chronologically while preserving
each conversation's original message order, ready for a later learning phase
(evaluating prompt quality, agent decisions, execution time, …).

Supported sources:

- `warp` (default): Warp's local SQLite database.
- `claude-code`: Claude Code JSONL transcripts under `~/.claude/projects`.
- `hermes`: Hermes' canonical `<HERMES_HOME>/state.db` SQLite store.

It is schema-less where a source schema is opaque (notably Warp's protobuf
`agent_tasks.task` blob) and read-only against the live stores.

---

## What it does

Given a spec slug (the markdown filename under `docs/backlog/`, e.g.
`2026-06-03-add-smoke-test-multi-quote-akur8`), the adapter:

1. **Finds correlation markers** — `: SPEC_MARKER v=1 spec_id=<slug> phase=<phase>`
   shell no-ops emitted by phase skills — and binds each to a conversation:
   - Warp: marker command in `commands.command`, conversation id via the matching
     `blocks.start_ts` row.
   - Claude Code: marker command in a `Bash` `tool_use` block inside the session
     JSONL transcript.
   - Hermes: an exact marker line in an assistant `terminal` or
     `run_shell_command` tool call stored in `messages.tool_calls`.

   > **Phase rename (backward-compatible).** The third phase was renamed from
   > `implementation-gate` to `review`. Markers carrying the legacy
   > `phase=implementation-gate` label still parse (normalized to `review`),
   > and previously-captured bundles with the old label are normalized on merge
   > — historical sessions need no manual migration.
2. **Reads every event** for those conversations from the selected source:
   - Claude Code `type: "user"` entries → prompts and tool results
     (`kind: "query"` / `kind: "tool_result"`)
   - Claude Code `type: "assistant"` content blocks → assistant text and tool
     calls (`kind: "agent_message"` / `kind: "tool_call"`)
   - Hermes `user`, `assistant`, and `tool` messages → prompts, assistant text,
     tool calls, and tool results. Inactive compacted rows are retained with
     `active` / `compacted` metadata so the original learning history is not lost.
   - Warp reads three tables:
     - `ai_queries` → user prompts (`kind: "query"`)
     - `blocks` → shell command executions (`kind: "command"`), incl. subagent blocks
     - `agent_tasks` → assistant text recovered by walking the protobuf `task` blob
       (`kind: "agent_message"`)
3. **Classifies** each event by its conversation's phase, orders the whole bundle
   chronologically while preserving each conversation's original message order,
   and assigns a monotonic `seq`.
4. **Compacts** the walked protobuf nodes (drop base64 residue + UUIDs, dedupe
   repeats, truncate long values) to keep behavior signal and cut line count.
5. **Writes** `out/<spec>.jsonl` (header line + one event per line).

Warp subagent tasks/blocks share the parent `conversation_id`, so they are pulled
in automatically. Hermes compression continuations and delegate subagents are
expanded through `parent_session_id`; explicit `/branch`, generic, and tool child
sessions are excluded unless they contain their own marker. Re-runs of a phase
are distinct conversations and are all kept.

### Safety

The live Warp DB is opened **read-only** and never written. All work runs against a
`VACUUM INTO` snapshot (committed WAL pages included) that is itself opened
read-only and deleted when the run finishes.

The Hermes DB is opened directly with SQLite `readonly` + `fileMustExist` inside
one deferred read transaction. This gives marker discovery, lineage resolution,
and message reads one consistent snapshot including committed WAL frames. Do not
make a plain filesystem copy of a live WAL database for `--hermes-db-path`; use a
SQLite backup or `VACUUM INTO` when a copied fixture is required.

---

## Prerequisites

- macOS for Warp's default DB path (Claude Code and Hermes extraction work on any
  platform with a readable source store)
- Node.js >= 22
- Warp terminal installed and used (for `--source warp`)
- Claude Code installed and used (for `--source claude-code`)
- Hermes installed and used (for `--source hermes`)

The DB is expected at:

```
~/Library/Group Containers/2BBY89MBSN.dev.warp/Library/Application Support/dev.warp.Warp-Stable/warp.sqlite
```

## Install

```bash
cd .agents/tools/capture-spec-sessions
npm install
```

## Usage

Run from the directory that contains `docs/backlog/` (e.g. the `Pricing/` root),
so `--list` and the default backlog root resolve correctly.

### List available spec slugs

Scans `<cwd>/docs/backlog/{todo,in-progress,done}/*.md`:

```bash
npx tsx .agents/tools/capture-spec-sessions/src/cli.ts --list
```

### Extract one spec from Warp (default)

```bash
npx tsx .agents/tools/capture-spec-sessions/src/cli.ts --spec <slug>
# custom output directory
npx tsx .agents/tools/capture-spec-sessions/src/cli.ts --spec <slug> --out /tmp/bundles
# only emit complete bundles (all 3 phases present)
npx tsx .agents/tools/capture-spec-sessions/src/cli.ts --spec <slug> --complete-only
# point at a specific DB (debugging)
npx tsx .agents/tools/capture-spec-sessions/src/cli.ts --spec <slug> --db-path /path/to/warp.sqlite
```

### Extract one spec from Claude Code

Claude Code stores transcripts as JSONL files under
`~/.claude/projects/<encoded-project-path>/<session-id>.jsonl`. The same
`SPEC_MARKER` no-op command must have been emitted in each phase session.

```bash
npx tsx .agents/tools/capture-spec-sessions/src/cli.ts \
  --source claude-code \
  --spec <slug>

# custom transcript root (debugging / fixture / copied Claude home)
npx tsx .agents/tools/capture-spec-sessions/src/cli.ts \
  --source claude-code \
  --claude-root /path/to/.claude/projects \
  --spec <slug>
```

### Extract one spec from Hermes

Hermes stores every profile's sessions in `<HERMES_HOME>/state.db`. A shell tool
inherits the current profile's `HERMES_HOME`, so this works directly from Hermes:

```bash
npx tsx .agents/tools/capture-spec-sessions/src/cli.ts \
  --source hermes \
  --spec <slug>

# explicit SQLite-consistent backup / fixture
npx tsx .agents/tools/capture-spec-sessions/src/cli.ts \
  --source hermes \
  --hermes-db-path /path/to/state.db \
  --spec <slug>
```

Without `HERMES_HOME`, the fallback matches Hermes itself: `~/.hermes/state.db`
on POSIX and `%LOCALAPPDATA%\hermes\state.db` on Windows. Other profiles are not
scanned automatically.

Output is written to `out/<spec>.jsonl` (relative to cwd), with a one-line summary:

```
wrote out/2026-06-03-add-smoke-test-multi-quote-akur8.jsonl (199 events, 1 conversations, complete=false)
```

If a marker can't bind to a conversation (see **Marker binding decays** below) or
binds to more than one, the run still succeeds but each anomaly is reported on
its own line (never as a bare count):

```
warnings:
unbindable marker: phase=implement start_ts=2026-06-30 11:00:00.000000
```

If **zero** conversations bind for the spec, nothing is written (no
header-only file) and the run exits non-zero:

```
no conversations bound for spec "<slug>" — nothing written.
unbindable marker: phase=implement start_ts=2026-06-30 11:00:00.000000
a marker was found but its binding block is gone — Warp can evict blocks rows over time; extract soon after finishing a spec, before the binding decays.
run --list to check available specs.
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Bundle written. |
| `1` | Nothing written — zero conversations bound, or `--complete-only` withheld an incomplete bundle. |
| `2` | Usage error (bad/missing flag). |

### CLI flags

| Flag | Description |
|------|-------------|
| `--spec <slug>` | Spec to extract (required unless `--list`). |
| `--list` | Print available spec slugs and exit. |
| `--complete-only` | Write nothing if the spec is missing any phase. |
| `--no-merge` | Replace the existing bundle instead of merging (default: merge decay-safe). |
| `--out <dir>` | Output directory (default `out`). |
| `--source <source>` | Conversation source: `warp` (default), `claude-code`, or `hermes`. |
| `--db-path <path>` | Override the live Warp DB path (`--source warp`). |
| `--claude-root <dir>` | Override Claude Code transcript root (`--source claude-code`, default `~/.claude/projects`). |
| `--hermes-db-path <path>` | Override Hermes `state.db` (`--source hermes`, default `$HERMES_HOME/state.db`). |
| `--backlog-root <dir>` | Root containing `docs/backlog/` (default cwd). |
| `-h, --help` | Print usage. |

---

## Output format

Strict NDJSON: one JSON object per physical line (newlines inside values are
escaped by `JSON.stringify`, so no value spans multiple lines). The file ends with
a trailing newline.

**Line 1 — bundle header:**

```json
{"type":"bundle_header","spec_id":"...","phases_present":["specify","implement"],"phases_missing":["review"],"conversations_per_phase":{"specify":1,"implement":1,"review":0},"complete":false,"conversation_ids":["..."],"extracted_at":"...","source":"warp"}
```

**Every subsequent line — one event:**

```json
{"spec_id":"...","phase":"implement","conversation_id":"...","seq":1,"ts":"2026-06-30 10:10:00.000000","role":"user","kind":"query","content":"implement it","meta":{"cwd":"/...","model":"...","git_branch":"main"}}
```

Fields:

- `seq` — monotonic across the bundle; events are chronological while each
  conversation keeps its original message order.
- `role` — `user` | `assistant` | `tool`.
- `kind` — `query` | `agent_message` | `command` | `tool_call` | `tool_result`.
- `meta` — kind-specific: `field_path`, `exit_code`, `git_branch`, `cwd`, `model`,
  `subagent_task_id`, `repeat`, `truncated`, `original_len`, `confidence`,
  `message_kind`, `tool`, `tool_call_id`, `fields`, `skills`, `merged_count`,
  `message_id`, `message_event_index`, `active`, `compacted`, `session_source`
  (see Schema-aware field paths below).

### Compaction (`agent_message` events)

Walked protobuf nodes are compacted to reduce noise without losing signal:

- **Drop** base64-looking residue (>= 16 chars the walker could not unfold) and
  pure UUIDs.
- **Dedupe** identical `(field_path, value)` pairs onto one survivor with a
  `repeat` count (only present when > 1).
- **Truncate** values > 2000 chars to `head(1000) + …[truncated len=N]… + tail(500)`
  with `truncated: true` and `original_len`.
- **Collapse streaming deltas** (`collapseDeltas.ts`, after the schema overlay):
  Warp streams a `tool_call`/`tool_call_result` incrementally as many separate
  `Message` occurrences that each set one leaf field. These are grouped by
  shared `tool_call_id` into one event carrying a `fields` map (relative
  field path -> value) plus `meta.tool_call_id`. When the same relative path
  recurs with a *different* value — e.g. `diffs.file_path` for each file in a
  multi-file `apply_file_diffs` call — the value becomes an array instead of
  being overwritten, so sibling repeated-field items are never silently
  dropped. `updated_skills_context` fan-out (one leaf per skill field) is
  reconstructed into a `meta.skills` summary list (`{path, name}` per skill)
  instead of one event per field. Any other consecutive same-`message_kind`
  deltas of one entity (e.g. a streamed `agent_output.text` growing chunk by
  chunk) are merged onto their final value with `meta.merged_count`.
  `agent_reasoning`, `user_query`, `update_todos`, and
  `messages_received_from_agents` are never grouped or merged away.

If a task blob's walk hit malformed bytes, its events carry
`meta.confidence: "heuristic"`.

### Schema-aware field paths (`agent_message` events)

The walker is schema-less (it never assumes a schema, so it never silently
lies), but recovered field paths are then **renamed** against a checked-in copy
of Warp's protobuf schema (`warp.multi_agent.v1.Task` and friends, sourced from
`warpdotdev/warp-proto-apis`). The schema is reflected at dev time into
`src/adapters/protoSchema.ts` (no protobuf dependency at runtime). For each
walked node the overlay:

- rewrites the numbered path to a semantic one, e.g. `5.4.2.1` →
  `messages.tool_call.run_shell_command.command`;
- extracts two oneof variants that drive decision tracing, emitted in `meta`:
  - `message_kind` — the `Message` oneof variant (`user_query`, `tool_call`,
    `tool_call_result`, `agent_output`, `agent_reasoning`, …);
  - `tool` — the `ToolCall` oneof variant (`run_shell_command`, `grep`,
    `apply_file_diffs`, `subagent`, `read_files`, …).
- validates every path segment against the schema and, on any disagreement
  (an absent field number, a leaf the walker recursed past, or a message field
  emitted as a string), keeps the original numbered path and sets
  `meta.confidence: "schema-mismatch"`. It never silently relabels.

The pinned schema rev is recorded in `src/adapters/protoSchema.ts`
(`SCHEMA_REV`). If your installed Warp predates that rev, a larger share of
paths fall back to numbered form with `schema-mismatch` (still correct, just
less readable) — bump the rev and regenerate. A live-DB spot check (200 task
rows, ~20.9k nodes) named ~83% of nodes at the pinned rev.

---

## Project layout

Ports & adapters (clean architecture):

```
src/
  cli.ts                          — entry point, arg parsing (node:util parseArgs)
  formatRunReport.ts              — pure CLI diagnostics: success/anomaly lines, exit code
  backlogLister.ts                — scans docs/backlog for spec slugs
  domain/
    models.ts                     — pure domain types
    ports.ts                      — ConversationReader/SpecRead (use-case port), ReadableDb,
                                     ConversationSource, ConversationSink (Warp SQL internals)
    schemas.ts                    — zod schemas for ai_queries.input / blocks.ai_metadata
  usecases/
    extractSpecBundle.ts          — orchestration: reader.readSpec → classify → order → header
  adapters/
    claudeCodeTranscriptReader.ts — Claude Code JSONL transcript reader
    hermesConversationReader.ts   — Hermes state.db reader + marker/lineage binding
    warpConversationReader.ts     — ConversationReader impl: binds markers + gathers events
    warpSqliteAdapter.ts          — live DB discovery + VACUUM INTO snapshot
    sqliteReadableDb.ts           — better-sqlite3 → ReadableDb port
    jsonlSink.ts                  — SpecBundle → strict JSONL file
    protobufWalk.ts                — schema-less protobuf wire walker
    compact.ts                     — noise-reduction pass over walked nodes
    schemaOverlay.ts               — schema-aware name overlay (message_kind/tool)
    collapseDeltas.ts              — collapses streaming tool_call/tool_call_result field-deltas
    protoSchema.ts                 — @generated field-number → name lookup (no runtime proto dep)
    ansi.ts                        — ANSI escape stripping
    readers/
      markerReader.ts              — find + bind SPEC_MARKER emissions
      queryReader.ts               — ai_queries → query events
      blockReader.ts               — blocks → command events
      taskReader.ts                — agent_tasks → agent_message events
  __tests__/                       — vitest, Given/When/Then, §9.1–§9.15
```

The use-case depends only on `ConversationReader`; Warp, Claude Code, and Hermes
are sibling adapters implementing the same port.

## Develop

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run test:watch
npm run gen:schema  # regenerate src/adapters/protoSchema.ts from schemas/multi_agent/v1
```

The checked-in protos live in `schemas/multi_agent/v1/` (pinned to
`warp-proto-apis` rev `ac1af73…`). To bump the rev, replace those protos and
re-run `npm run gen:schema`; the generator needs only `protobufjs` (already a
devDependency) — no `protoc` install. Tests use an in-process file-backed fixture
DB (no real Warp DB needed) and follow Given/When/Then. Run the adapter against
your live DB to validate end-to-end.

## Limitations

- **Marker binding decays.** A `SPEC_MARKER` binds to a conversation via a
  `blocks` row at the same `start_ts`; that row can disappear from Warp's DB
  before the marker command does (verified: a spec that bound 199 events one
  morning was fully unbindable the same night). Extract soon after finishing a
  spec — don't rely on being able to extract it days later.
  **Mitigation (capture-at-close + decay-safe merge):** the phase skills
  (`specify`, `implement`, `review`) now capture at close into
  `spec-sessions/<slug>.jsonl` (this folder, gitignored). A later capture merges
  fresh + stored decay-safe — fresh events are primary, stored events fill gaps
  left by marker decay or ring-buffer eviction — so a phase captured at close is
  recoverable even after its live binding is gone. `learn` always runs the tool
  (never reads the stored bundle directly). Use `--no-merge` to replace an
  existing bundle instead of merging (e.g. after a corrupt file is removed).
- **`ai_queries` is capped at ~10,000 rows** (a ring buffer) — old prompts are
  evicted, compounding the binding-decay risk above for older specs. The
  capture-at-close merge recovers evicted prompts from the stored bundle.
- **`complete`** is true only when all three phases have at least one bound
  conversation. A spec still in progress is exported with `complete: false`.
- **`did_execute`** (blocks) is read but not currently emitted in event `meta`.
- Protobuf field paths are **schema-aware**: walked paths are renamed against a
  pinned copy of `warp-proto-apis` (see Schema-aware field paths above). Paths
  that do not align with the schema rev keep their numbered form and carry
  `meta.confidence: "schema-mismatch"` (never silently relabelled). The pinned
  rev can drift from an installed Warp build — regenerate the lookup when you
  bump Warp.
- Warp default DB discovery is macOS-specific.
- Claude Code extraction depends on the same `SPEC_MARKER` command being present
  in the transcript. A session that only mentions the spec slug but never ran the
  marker is not bound, by design, to avoid heuristic grouping.
- Hermes binds only exact canonical marker lines executed by an assistant shell
  tool. It intentionally ignores prose, tool results, `echo` commands, and
  reordered or extended marker-shaped lines. A conflicting multi-phase marker
  session is excluded and blocks inherited lineage until a later explicit marker.

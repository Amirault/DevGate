# Spec Correlation Marker

A stable, greppable token emitted automatically by each spec-phase skill so the workflow adapter can group Warp sessions by spec and order them by phase — deterministically, without heuristics.

## Format

```
: SPEC_MARKER v=1 spec_id=<spec_id> phase=<phase>
```

- `v=1` — format version, so the adapter can evolve without breaking old data.
- `spec_id` — the spec filename without `.md` (e.g. `2026-06-30-multiquote-limit-5`). This is the same id the `trace-capture` skill uses as its topic-id (the spec filename slug), reused verbatim — no hash, no new convention. It is stable across `todo → in-progress → done` moves because the transition scripts preserve the filename.
- `phase` — `specify | implement | implementation-gate`.

## Emission (automatic — the human types nothing)

Each skill, once it has resolved the spec file, runs the marker as a **literal no-op shell command** via `run_shell_command`:

```
: SPEC_MARKER v=1 spec_id=2026-06-30-multiquote-limit-5 phase=implement
```

Rules:
- **Run it; do not just print it.** The leading `:` is a shell no-op (exit 0, no repo effect).
- **`spec_id` must be the resolved literal** (e.g. `2026-06-30-multiquote-limit-5`), never a `$(...)` substitution or shell variable. Warp logs the command text as submitted, so substitution would store an unexpanded placeholder and break the adapter's grep.
- **Emit once per session**, as early as possible after the spec file is known.
- Re-runs (a second implement sitting, a re-gate) emit the same `spec_id` again from a new conversation. The adapter collects them all and orders by `start_ts` — no dedup, no state.

## Where it lands (verified)

The agent-executed no-op command is recorded in two tables, joined by an exact `start_ts`:

- `commands.command` — the **clean** marker text (greppable via `LIKE`), with `is_agent_executed = 1` and `start_ts`. The `commands` table has **no** `conversation_id` column.
- `blocks` — a row whose `ai_metadata.conversation_id` is this session's conversation id. `blocks.stylized_command` holds the marker text **with per-character ANSI bold escapes** (`\x1b[1mW\x1b[0m...`), so it is **not** directly `LIKE`-greppable — grep `commands.command` instead.

So one emission yields **marker text (clean, in `commands`) + conversation binding (in `blocks`)**, joined on `start_ts` (verified 1:1).

## Binding + acceptance queries

Substitute the real `spec_id`. The `: SPEC_MARKER` anchor avoids false positives from any text that merely mentions the marker (e.g. diagnostic scripts):

1. Distinct conversations per spec (≥3 once all three phases have run):
```sql
SELECT DISTINCT json_extract(b.ai_metadata, '$.conversation_id') AS conversation_id
FROM commands c
JOIN blocks b ON b.start_ts = c.start_ts
WHERE c.command LIKE ': SPEC_MARKER%spec_id=2026-06-30-multiquote-limit-5%';
```

2. Ordered marker emissions for a spec (phase timeline):
```sql
SELECT json_extract(b.ai_metadata, '$.conversation_id') AS conversation_id,
       c.start_ts, c.command
FROM commands c
JOIN blocks b ON b.start_ts = c.start_ts
WHERE c.command LIKE ': SPEC_MARKER%multiquote-limit-5%'
ORDER BY c.start_ts;
```

3. All three phase values appear:
```sql
SELECT DISTINCT CASE
  WHEN c.command LIKE '%phase=specify%' THEN 'specify'
  WHEN c.command LIKE '%phase=implement%' THEN 'implement'
  WHEN c.command LIKE '%phase=implementation-gate%' THEN 'implementation-gate'
END AS phase
FROM commands c
WHERE c.command LIKE ': SPEC_MARKER%multiquote-limit-5%';
```

If queries 1–3 pass for one spec, the adapter can build a complete, correctly ordered bundle for any spec by `spec_id` alone.

## Subagent coverage (known gap)

`parent_conversation_id` does **not** exist in the Warp schema. `agent_conversations.conversation_data` carries only `server_conversation_token`, `conversation_usage_metadata`, `run_id`, `autoexecute_override` — no parent reference. So the adapter cannot expand a seed conversation to its subagents via a parent link.

The marker captures the three top-level phase conversations. Subagent conversations (spawned programmatically, which do not run the skill) must be pulled in by a separate, fallback-based expansion step. Available linkages:
- `terminal_panes.conversation_ids` (JSON list) and `terminal_panes.active_conversation_id` — group sessions sharing a terminal pane.
- `pane_nodes.parent_pane_node_id` — pane-tree ancestry (a subagent pane may be a child of the orchestrator's pane).
- `blocks.ai_metadata.subagent_task_id` — tags blocks produced under a subagent task within a parent conversation.

Expansion strategy: grep the marker for seed `conversation_id`s per spec → expand transitively via the pane tree / `terminal_panes` / `subagent_task_id`. This needs no marker in the subagent.

## Smoke-test confirmation (single session)

Emitted `: SPEC_MARKER v=1 spec_id=smoke-test-spec phase=specify` via `run_shell_command`. Verified:
- `commands.command` captured the clean marker text (`is_agent_executed = 1`, real-time).
- A `blocks` row was created with `ai_metadata.conversation_id` = the emitting session's conversation id, sharing the command's `start_ts` exactly (1:1).
- Acceptance query 1 returned that conversation id.

Full 3-conversation confirmation (one `spec_id` across specify → implement → implementation-gate) requires three real sessions; the mechanism is confirmed for one.

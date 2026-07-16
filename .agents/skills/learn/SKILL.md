---
name: learn
description: "Learning pass on a spec: extract its conversation bundle, read the sessions + Implementation Log, report evidence-based improvements to the spec-driven skills. Triggers on learn/retro."
effort: medium
---

# Learn

Run an evidence-based learning pass on a spec that has run through the spec-driven pipeline
(`specify → implement → review`). Extract what actually happened across its
sessions, and report concrete improvement suggestions for the skills/tooling. Read-only — it
does not edit other skills.

## Process

1. **Locate the spec** (user names it, or run `npx tsx .agents/tools/capture-spec-sessions/src/cli.ts --list`). Record `spec_id` + status.

2. **Extract** the bundle — ALWAYS run the tool (it reads fresh from the external source, then fills gaps from the stored bundle via decay-safe merge), then read the result. Never read the stored bundle directly. From the dir containing `docs/backlog/`:
   ```bash
   npx tsx .agents/tools/capture-spec-sessions/src/cli.ts --spec <slug> --out .agents/tools/capture-spec-sessions/spec-sessions
   ```
   Read the result + warnings. The tool merges fresh + persisted, so a phase captured at close but since decayed live is recovered from the persisted bundle. An `unbindable marker` warning means that phase's live binding is gone — if the phase is present in the bundle (recovered from disk), report it as recovered; if it's missing from both persisted and live, report it as a finding (the session is lost — fall back to the spec's `## Implementation Log` and say so explicitly). A `fresh read failed` warning means the tool degraded to the stored bundle — the captured phases are still recovered.

3. **Read the evidence** — read the bundle JSONL with `read_files` (lossless; if it reports
   truncation, read the rest in ranges) AND the spec's `## Implementation Log`. Do not pipe the
   bundle through commands that summarize or truncate — that drops evidence.

4. **Report** findings + suggested improvements. Every finding MUST cite its evidence: a
   session timestamp, a quoted line, a command + exit code, or a log entry. No evidence → drop
   the finding. Map each suggestion to a specific skill file + section, never generic advice.

## Guard rails

- **Manual trigger only** — `learn` / `retro` / `post-mortem`.
- **Read-only** — never edit other skills or the spec; suggestions only, unless the user
  explicitly approves a fix.
- **Evidence-first** — cite or drop. Findings are about process/tooling, never the person.
- **Never commit** — produces a report; committing is a separate, explicitly-approved step.

## Limitations

- `capture-spec-sessions` binds phases via `blocks` rows Warp evicts over time. The phase skills
  now capture at close (into `.agents/tools/capture-spec-sessions/spec-sessions/<slug>.jsonl`),
  so `learn` recovers decayed phases from the persisted bundle via decay-safe merge — see the
  tool's README "Limitations" for details. A phase missing from both persisted and live is a finding.
- `capture-spec-sessions` compacts `agent_message` values > 2000 chars (head+tail); the bundle
  is otherwise lossless — flag any finding whose evidence was truncated upstream.

---
name: implement
description: "Manual skill - implement a spec. Pass a spec name to resolve it directly and skip selection/confirmation. Locates ready-to-implement or implementation-in-progress specs; trusts the specify validation stamp."
effort: medium
---

# Implementation Executor

Execute implementation based on an approved specification. The spec must have status `ready-to-implement` (in `docs/backlog/todo/`) or `implementation-in-progress` (in `docs/backlog/in-progress/`). The spec is the single source of truth — if it's not in the spec, it's not implemented.

```
specify → implement (you are here) → review → commit
```

## Core Principles

1. **Spec is law** — follow it strictly, no scope expansion
2. **Trust the gate** — `ready-to-implement` means specify already validated the spec (structure, examples, implementation plan). Do NOT re-validate or re-audit the spec content
3. **Stop on gaps** — never invent behavior, never choose between options
4. **Incremental** — build and test after each Implementation Plan increment, check it off in the spec file

## Process

### Phase 1 — LOCATE SPEC

```bash
.agents/skills/implement/scripts/list-implementable-specs.sh
```

- Exit 1 → no specs ready; inform user and stop.

**Resolving the spec:**
- **User named a spec** (e.g. `/implement <spec-name>`, or named it in their message): match it against the JSON above by filename (without `.md`) or title, case-insensitive. Do NOT present the list and do NOT ask which to implement. Exactly one match → use it (this is the user's explicit selection). Zero → report nothing matched and stop. Multiple → list the candidates and ask which; never guess.
- **No spec named**: present the JSON list to the user and ask which spec to implement. Wait for explicit user selection before proceeding.

**If the selected spec has `status: ready-to-implement`** (in `docs/backlog/todo/`), transition it before Phase 2:
```bash
.agents/skills/specify/scripts/transition-spec.sh <spec-path> implementation-in-progress
```
The script updates the status AND moves the file to `docs/backlog/in-progress/` — use the new location from here on.

The status is the validation stamp: specify refuses the `ready-to-implement` transition unless the spec passes full validation. There is nothing left to check — go implement.

### Phase 2 — SETUP

**Emit the spec correlation marker (phase=implement).** Run this literal no-op shell command via `run_shell_command` (run it, do not just print it), with `spec_id` = the located spec filename without `.md` (resolved literal — no `$(...)` substitution, since Warp logs command text as submitted):

```bash
: SPEC_MARKER v=1 spec_id=2026-06-30-multiquote-limit-5 phase=implement
```

The leading `:` is a no-op (exit 0). It lands in `commands.command` and creates a `blocks` row with `ai_metadata.conversation_id`, binding this session to the spec for the workflow adapter. Emit once, now (session start). See `specify/references/spec-marker.md`.

1. Read the spec completely
2. Extract: acceptance criteria, examples, Implementation Plan increments, technical notes, "What NOT"
3. Read the project's `AGENTS.md` for build/test commands
4. Read the `test-implementation` skill for testing guidance
5. Create a TODO list from the spec's `## Implementation Plan` increments (legacy specs may have a `## Breakdown` section instead — use its checkboxes)
6. State the plan for visibility — "Ready to implement [title] (size: [X], project: [Y]). Increments: [increment titles]" — then proceed to Phase 3. Do NOT ask a "Proceed?" confirmation: naming the spec in Phase 1, or selecting it from the list, is the intent to implement.

### Phase 3 — IMPLEMENT (per increment)

For each Implementation Plan increment:

**1. Code** — Follow the increment's **What**/**How**, the acceptance criteria, and the examples. Reference "Technical Notes" for affected files. Check "What NOT" to avoid scope creep.

**2. Test** — For each `[TEST]` criterion covered by this increment, write an automated test following `test-implementation` skill patterns. `[MANUAL]` criteria do NOT get automated tests.

**3. Build & test** — Run the increment's **Validation** command (or the build command from `AGENTS.md`, then `make test-filter filter="RelevantTestClass"` for fast feedback). On failure: fix immediately, do not continue.

**4. Check off the increment** — Mark it `[x]` in the spec file. Progress lives in the spec, not in the session — a fresh session can resume exactly where this one stopped.

**5. Spec gap check** — After completing the increment, evaluate:
- Did I encounter ambiguity not covered by acceptance criteria?
- Did I make a decision the spec doesn't specify?
- Did I discover missing requirements or unspecified behavior?

**If YES → STOP.** Report to user:
> "⚠️ Spec gap discovered:
> [Describe what's unclear or missing]
>
> I need guidance before continuing:
> - Refine the spec to cover this case
> - Clarify the expected behavior
> - Adjust scope"

Do NOT guess or assume. Wait for clarification, then **write the resolution back into the spec** (criteria, examples, or plan) before continuing — the spec must keep matching reality.

**If NO → continue to the next increment.**

### Phase 4 — HANDOFF

After all increments are checked off:

1. Run full build and tests (commands from `AGENTS.md`)
2. Report completion:
   > "✅ Implementation complete for [title].
   > [X] files modified, [Y] tests added.
   >
   > Run `review` to validate before review."
3. **Capture session at close** (non-blocking): run `npx tsx .agents/tools/capture-spec-sessions/src/cli.ts --spec <slug> --out .agents/tools/capture-spec-sessions/spec-sessions` from the dir containing `docs/backlog/`. Report the one-line `wrote …` summary and any `unbindable marker` warning (a decay signal). If the capture fails, log a warning and continue — the handoff is not blocked. Local-only: the `SPEC_MARKER` must be in the local Warp DB; remote (Oz cloud) sessions are not captured.

Do NOT duplicate the review's validation — that's its job.

## Spec Gap Handling — When to STOP

- Acceptance criteria don't cover the current case
- Multiple valid approaches exist and spec doesn't specify which
- Business rule is ambiguous or contradictory
- Error handling behavior is unspecified
- Edge case not illustrated by any example

**Never**: guess, add "useful" features, choose between approaches, expand scope.

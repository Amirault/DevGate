---
name: implement
description: "Manual skill - implement a spec. Pass a spec name to resolve it directly and skip selection/confirmation. Locates ready-to-implement or implementation-in-progress specs; trusts the specify validation stamp. Every increment ends with a mandatory subagent refactoring pass (Fowler / Uncle Bob) whose checkbox in the spec is checked before the increment is checked off."
effort: medium
---

# Implementation Executor

Execute implementation based on an approved specification. The spec must have status `ready-to-implement` (in `docs/backlog/todo/`) or `implementation-in-progress` (in `docs/backlog/in-progress/`). The spec is the single source of truth — if it's not in the spec, it's not implemented.

```text
specify → implement (you are here) → review → commit
```

## Core Principles

1. **Spec is law** — follow it strictly, no scope expansion
2. **Trust the gate** — `ready-to-implement` means specify already validated the spec (structure, examples, implementation plan). Do NOT re-validate or re-audit the spec content
3. **Stop on gaps** — never invent behavior, never choose between options
4. **Incremental** — build and test after each Implementation Plan increment, check it off in the spec file
5. **Refactor every increment** — red-green-refactor: each increment ends with a refactoring pass, always delegated to a subagent applying `.agents/skills/refactoring/SKILL.md` (Fowler's catalog, SOLID, Uncle Bob). The increment's `**Refactoring**` checkbox is checked only after that pass — never check off an increment whose Refactoring checkbox is unchecked

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

**Emit the spec correlation marker (phase=implement).** Run this literal no-op shell command with the active runtime's shell tool (Warp → `run_shell_command`, Claude Code → `Bash`, Hermes → `terminal` or `run_shell_command`). Run it; do not just print it. Run it as its own shell call — the whole command is the marker line alone: no `cd` prefix, no `;`/`&&` chaining, nothing after it (the `:` no-op needs no working directory). Use `spec_id` = the located spec filename without `.md` (resolved literal — no `$(...)` substitution because adapters match the submitted command text):

```bash
: SPEC_MARKER v=1 spec_id=2026-06-30-multiquote-limit-5 phase=implement
```

The leading `:` is a no-op (exit 0). The selected adapter binds it through that runtime's native session store. Emit once, now (session start). See `.agents/skills/specify/references/spec-marker.md`.

1. Read the spec completely
2. Extract: acceptance criteria, examples, Implementation Plan increments, technical notes, "What NOT"
3. Read the project's `AGENTS.md` for build/test commands
4. **Pre-flight — verify green build**: run the project's build command from `AGENTS.md`. If it fails, diagnose and fix the pre-existing issue before writing any code — never start implementation on a broken baseline. Once green, proceed.
5. Read the `test-implementation` skill for testing guidance
6. Create a TODO list from the spec's `## Implementation Plan` increments (legacy specs may have a `## Breakdown` section instead — use its checkboxes). Include each increment's **Refactoring** pass as its own TODO item — it is part of the increment, not optional
7. State the plan for visibility — "Ready to implement [title] (size: [X], project: [Y]). Increments: [increment titles]" — then proceed to Phase 3. Do NOT ask a "Proceed?" confirmation: naming the spec in Phase 1, or selecting it from the list, is the intent to implement.

### Phase 3 — IMPLEMENT (per increment)

For each Implementation Plan increment:

**1. Code** — Follow the increment's **What**/**How**, the acceptance criteria, and the examples. Reference "Technical Notes" for affected files. Check "What NOT" to avoid scope creep.

**2. Test and prove acceptance** — For each `[TEST]` criterion covered by this increment, write an automated test following `test-implementation` skill patterns. `[MANUAL]` criteria do NOT get automated tests.

Before checking off the increment, split each `[TEST]` criterion into its independently observable clauses and persist this proof matrix in the spec's `## Implementation Log`, identified by increment and criterion so a fresh session can resume it:

| Criterion clause | Test | Observable assertion | RED or false-positive proof |
| ---------------- | ---- | -------------------- | --------------------------- |

Every clause MUST name the exact test and assertion that proves it. A narrative statement, a green suite alone, or an assertion covering only part of the criterion is not evidence.

When a clause claims parity across files — "mirrors clone X", "same as CreateQuote", "exists in file Y" — grep the exact test name in the exact named file and paste the match (or its absence) into the matrix row before accepting the clause as proven. A narrative parity claim alone is not evidence, even when the local suite is green: parity bugs live in the _other_ file, which the local run never touches.

When a criterion names an observable write contract — such as a key, value, TTL, tags, headers, or options — the fake/spy MUST expose every named element and the test MUST assert each one explicitly.

For behavior declared unchanged where the focused test is already green, perform a temporary false-positive probe or equivalent proof. Before the probe, snapshot the exact tracked state of only the affected files. Make that contract drift, confirm the mapped test fails for the expected reason, restore only the temporary mutation, then verify those files match their pre-probe snapshot exactly. Never use a broad reset, restore, or clean that could discard implementation work.

**3. Build & test** — Run the increment's **Validation** command (or the build command from `AGENTS.md`, then `dotnet test --filter "FullyQualifiedName~RelevantTestClass"` for fast feedback). On failure: fix immediately, do not continue.

**4. Refactor — subagent pass (mandatory)** — Every increment ends with a refactoring pass, always delegated to a subagent. You may refactor earlier while green (red-green-refactor allows refactoring before/while coding), but an increment is NOT done until this pass has run — whatever implementation code the increment changed must finish refactored.

- **Dispatch a subagent** (Warp → `run_agents`, Claude Code → `Agent`) — fresh eyes on the code just written, no attachment to it. Never refactor inline. Prompt template:
  > Read `.agents/skills/refactoring/SKILL.md` and apply it to the files changed by increment "[increment title]" of spec "[spec path]": [changed file list].
  > Targets: [from the increment's **Refactoring** bullet — smells to watch for, planned extractions; "none anticipated" is a valid answer; omit the line for a legacy increment without the bullet].
  > Follow its refactoring loop (green tests → one smell → one refactoring → re-test) and Fowler / Uncle Bob principles only: structure changes, zero behavior change, no new tests, no scope beyond the listed files, nothing that contradicts the spec's Acceptance Criteria or "What NOT".
  > Build/test command: [from AGENTS.md].
  > Report: each refactoring applied (smell → refactoring → file), or "none needed" with the reason, and the final test result.
- **Scope**: the files this increment created/modified (plus their immediate consumers when a rename moved a symbol). The refactoring relates to the spec — never beyond the increment's footprint.
- **No regression proof**: when the subagent reports, re-run the increment's **Validation** command yourself. Green → the pass landed clean. Red → regression: STOP, fix, re-run (refactoring never changes behavior).
- An increment that changed no production code still runs the pass; the subagent reports "none needed" with the reason.

**5. Check off the Refactoring checkbox, then the increment** — Once the pass is done and the post-refactoring validation is green:

1. Check the increment's `- [ ] **Refactoring**` sub-checkbox `[x]` in the spec file. Legacy increment without one: add `- [x] **Refactoring**: subagent pass — <outcome>` under it first — progress must live in the spec, not in the session.
2. Append one line to `## Implementation Log`: `<timestamp> — Increment N refactoring pass: <refactorings applied | none needed> — subagent per .agents/skills/refactoring/SKILL.md`.
3. Only then mark the increment `[x]` — every matrix row has executable evidence, the increment validation is green, AND the Refactoring checkbox is checked. A fresh session can resume exactly where this one stopped.

**6. Spec gap check** — After completing the increment, evaluate:

- Did I encounter ambiguity not covered by acceptance criteria?
- Did I make a decision the spec doesn't specify?
- Did I discover missing requirements or unspecified behavior?
- **Did the user direct a scope reduction** (removing a criterion, feature, or example)?

**On scope reduction → IMMEDIATELY before any further code** (do not defer to review):

1. Apply `~~strikethrough~~` to every affected criterion in `## Acceptance Criteria`, appending `→ see Implementation Log <timestamp>`.
2. Append an entry to `## Implementation Log`: `<timestamp> — <what was removed>, why, who approved.`

Only then continue implementing the reduced scope.

**If other gap → STOP.** Report to user:

> "⚠️ Spec gap discovered:
> [Describe what's unclear or missing]
>
> I need guidance before continuing:
>
> - Refine the spec to cover this case
> - Clarify the expected behavior
> - Adjust scope"

Do NOT guess or assume. Wait for clarification, then **write the resolution back into the spec** (criteria, examples, or plan) before continuing — the spec must keep matching reality.

**If NO → continue to the next increment.**

### Phase 4 — HANDOFF

After all increments are checked off:

1. **Acceptance proof gate** — Re-read every `[TEST]` criterion and its persisted proof matrix from the spec's `## Implementation Log`. Block the handoff when any clause lacks an exact test, observable assertion, and RED/false-positive proof, when any probed file does not match its recorded pre-probe snapshot, or when any increment's `**Refactoring**` checkbox is still unchecked (an increment is not finished until its refactoring pass is done). `[MANUAL]` criteria remain explicitly identified for post-implementation validation.
2. Run full build and tests (commands from `AGENTS.md`)
3. Report completion, including the clause-level proof matrix and the per-increment refactoring outcomes:
   > "✅ Implementation complete for [title].
   > [X] files modified, [Y] tests added.
   >
   > Run `review` to validate before review."
4. **Capture session at close** (non-blocking): resolve `<session_source>` from the active runtime (Warp → `warp`, Claude Code → `claude-code`, Hermes → `hermes`), then run `.agents/tools/capture-spec-sessions/capture.sh --spec <slug> --source <session_source>` (path relative to the project root; the wrapper works from any cwd, installs the tool's deps on first use, and stores the bundle in the main checkout so a capture made in a worktree survives its removal). Never omit `--source` or infer it from an existing bundle. Report the one-line `wrote …` summary and any `unbindable marker` warning (a decay signal). If the capture fails, log a warning and continue — the handoff is not blocked. Local-only: the `SPEC_MARKER` must be in the selected adapter's local session store; remote sessions are not captured unless that adapter explicitly supports them.

Do NOT duplicate the review's validation — that's its job.

## Spec Gap Handling — When to STOP

- Acceptance criteria don't cover the current case
- Multiple valid approaches exist and spec doesn't specify which
- Business rule is ambiguous or contradictory
- Error handling behavior is unspecified
- Edge case not illustrated by any example

**Never**: guess, add "useful" features, choose between approaches, expand scope.

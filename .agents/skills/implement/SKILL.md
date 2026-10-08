---
name: implement
description: "Manual skill - implement ONE increment of an approved spec, as the implement(N) subagent of deliver-increment. Needs a spec and an increment (/implement <spec> increment N); without an increment it redirects to /deliver-increment. Trusts the specify validation stamp, stops on spec gaps, never commits, ends only when the full harness is green, and reports a STATUS line."
effort: medium
disable-model-invocation: true
---

# Implementation Executor

Implement one increment of an approved specification. The spec is the single source of truth — if it's not in the spec, it's not implemented.

```text
specify → deliver-increment: implement(N) (you are here) → refactor(N) → review(N) → commit → PR
```

## Core Principles

1. **Spec is law** — follow it strictly, no scope expansion
2. **Trust the gate** — `ready-to-implement` means specify already validated the spec (structure, examples, implementation plan). Do NOT re-validate or re-audit the spec content
3. **One increment** — only increment N: its **Goal**, its **What**/**How**, the criteria it covers. Never start the next one
4. **Stop on gaps** — never invent behavior, never choose between options: return `STATUS: GAP` before writing the ambiguous part
5. **Full harness before DONE** — `STATUS: DONE` only when the full harness is green (`.agents/skills/specify/references/harness.md`)
6. **Never commit, never refactor-dispatch** — the caller runs the refactoring subagent, the review, the commit and the PR. Never launch a subagent, never check the increment or its `**Refactoring**` box

## Status line

The report ends with exactly one status line, nothing after it:

```text
STATUS: DONE
STATUS: GAP <question>
STATUS: BLOCKED <reason>
```

## Process

### Phase 1 — LOCATE SPEC AND INCREMENT

**No increment scope** (e.g. `/implement <spec>` or `/implement`): do not implement. Reply "implement delivers one increment for `deliver-increment` — run `/deliver-increment <spec>`: it implements, refactors, reviews and commits the next increment, then opens its pull request." and stop. A caller (subagent dispatch) gets `STATUS: BLOCKED increment scope required — use deliver-increment`.

**Increment scope given** (`<spec> increment N`, by a human or by `deliver-increment`):

- **A path** → use it.
- **A name** → match it against `.agents/skills/implement/scripts/list-implementable-specs.sh` by filename (without `.md`) or title, case-insensitive. Do NOT present the list and do NOT ask which to implement. Exactly one match → use it. Zero → `STATUS: BLOCKED no spec matches <name>`. Multiple → list the candidates and ask which (a caller gets `STATUS: BLOCKED ambiguous spec: <candidates>`); never guess.

Status routing:

- `implementation-in-progress` → proceed.
- `ready-to-implement` → not started yet: `STATUS: BLOCKED spec not started — run /deliver-increment <spec>` (it creates `workflow/<spec-slug>-1` and transitions the spec).
- Anything else → `STATUS: BLOCKED spec status <status>`.
- Increment N missing, or already checked `[x]` → `STATUS: BLOCKED increment N <not in the plan | already delivered>`.

Do NOT ask a "Proceed?" confirmation: naming the spec and the increment is the intent to implement.

### Phase 2 — SETUP

**Emit the spec correlation marker (phase=implement).** Run this literal no-op shell command with the active runtime's shell tool (Warp → `run_shell_command`, Claude Code → `Bash`, Hermes → `terminal` or `run_shell_command`). Run it; do not just print it. Run it as its own shell call — the whole command is the marker line alone: no `cd` prefix, no `;`/`&&` chaining, nothing after it (the `:` no-op needs no working directory). Use `spec_id` = the located spec filename without `.md` (resolved literal — no `$(...)` substitution because adapters match the submitted command text):

```bash
: SPEC_MARKER v=1 spec_id=2026-06-30-add-search-endpoint-2 phase=implement
```

The leading `:` is a no-op (exit 0). The selected adapter binds it through that runtime's native session store. Emit once, now (session start) — a subagent emits its own. See `.agents/skills/specify/references/spec-marker.md`.

1. Read the spec completely, `## Implementation Log` included: the answers to earlier GAPs and review FAILs are decisions you apply
2. Extract: increment N (**Goal**, **What**/**How**/**Validation**), the acceptance criteria and examples it covers, technical notes, "What NOT"
3. Read the project's `AGENTS.md` and the `test-implementation` skill
4. **Pre-flight — verify green build**: run the project's build command from `AGENTS.md`. Red → `STATUS: BLOCKED baseline red: <failing output>` — never start on a broken baseline, and never fix an unrelated failure inside this increment

### Phase 3 — IMPLEMENT INCREMENT N

**1. Gap check first** — before writing each part, ask:

- Do the acceptance criteria cover this case?
- Do several valid approaches exist and the spec picks none?
- Is a business rule ambiguous or contradictory, or error handling unspecified?
- Is an edge case illustrated by no example?

Yes → stop before writing the ambiguous part and end with `STATUS: GAP <the question, with the options you see>`. Do NOT guess or assume. Parts already written stay in the working tree; the caller logs the answer and launches a fresh implement(N) that resumes from there.

**2. Code** — Follow increment N's **What**/**How**, the acceptance criteria, and the examples. Reference "Technical Notes" for affected files. Check "What NOT" to avoid scope creep. Everything you add serves increment N's **Goal** and is used once increment N is done: the increment ships alone, as its own pull request, so it leaves no code that nothing calls. A preparatory refactoring increment changes no behavior: no changed assertions, no new public behavior.

**3. Test and prove acceptance** — For each `[TEST]` criterion covered by this increment, write an automated test following `test-implementation` skill patterns. `[MANUAL]` criteria do NOT get automated tests.

Split each `[TEST]` criterion into its independently observable clauses and persist this proof matrix in the spec's `## Implementation Log`, identified by increment and criterion so a fresh session can resume it:

| Criterion clause | Test | Observable assertion | RED or false-positive proof |
| ---------------- | ---- | -------------------- | --------------------------- |

Every clause MUST name the exact test and assertion that proves it. A narrative statement, a green suite alone, or an assertion covering only part of the criterion is not evidence.

When a clause claims parity across files — "mirrors clone X", "same as CreateQuote", "exists in file Y" — grep the exact test name in the exact named file and paste the match (or its absence) into the matrix row before accepting the clause as proven. A narrative parity claim alone is not evidence, even when the local suite is green: parity bugs live in the _other_ file, which the local run never touches.

When a criterion names an observable write contract — such as a key, value, TTL, tags, headers, or options — the fake/spy MUST expose every named element and the test MUST assert each one explicitly.

For behavior declared unchanged where the focused test is already green, perform a temporary false-positive probe or equivalent proof. Before the probe, snapshot the exact tracked state of only the affected files. Make that contract drift, confirm the mapped test fails for the expected reason, restore only the temporary mutation, then verify those files match their pre-probe snapshot exactly. Never use a broad reset, restore, or clean that could discard implementation work.

**4. Validate — full harness** — While coding, a filtered run (your test runner's filter (e.g. `dotnet test --filter …`, `vitest -t …`, `pytest -k …`)) gives fast feedback. It never validates the increment: run the full harness (`.agents/skills/specify/references/harness.md`) — stage, then `mise exec -- lefthook run pre-commit --no-tty` from the project directory. Red → fix and rerun. A red you cannot fix inside increment N's footprint → `STATUS: BLOCKED harness red: <failing command and output>`.

### Phase 4 — REPORT

Only once every `[TEST]` clause of increment N has executable evidence in the proof matrix, every probed file matches its pre-probe snapshot, and the full harness is green:

> "✅ Increment N of [title] implemented.
> [X] files changed, [Y] tests added. Full harness: green.
> Proof matrix: [rows for increment N]. `[MANUAL]` criteria left for post-implementation validation: [list | none]."
>
> `STATUS: DONE`

Leave the increment and its `**Refactoring**` box unchecked, and the changes uncommitted — the caller checks them after the refactoring pass and the review.

## Spec Gap Handling — When to STOP

- Acceptance criteria don't cover the current case
- Multiple valid approaches exist and spec doesn't specify which
- Business rule is ambiguous or contradictory
- Error handling behavior is unspecified
- Edge case not illustrated by any example

**Never**: guess, add "useful" features, choose between approaches, expand scope.

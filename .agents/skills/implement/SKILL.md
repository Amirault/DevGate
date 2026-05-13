---
name: implement
description: "Manual skill - invoke explicitly to implement a spec. Locates specs with status 'ready-to-implement' (in todo/) or 'implementation-in-progress' (in in-progress/), asks user to select one, auto-transitions ready-to-implement specs before starting. Stops and reports if spec gaps are discovered. Never invents behavior."
---

# Implementation Executor

Execute implementation based on an approved specification. The spec must have status `ready-to-implement` (in `docs/backlog/todo/`) or `implementation-in-progress` (in `docs/backlog/in-progress/`). The spec is the single source of truth — if it's not in the spec, it's not implemented.

```
spec-gate → implement (you are here) → implementation-gate → commit
```

## Core Principles

1. **Spec is law** — follow it strictly, no scope expansion
2. **Stop on gaps** — never invent behavior, never choose between options
3. **Incremental** — build and test after each breakdown item

## Process

### Phase 1 — LOCATE SPEC

```bash
.agents/skills/implement/scripts/list-implementable-specs.sh
```

- Exit 0 → present the JSON list to user, ask which spec to implement
- Exit 1 → no specs ready; inform user and stop

Wait for explicit user selection before proceeding.

**If the selected spec has `status: ready-to-implement`** (in `docs/backlog/todo/`), auto-transition it before Phase 2:
```bash
.agents/skills/spec-gate/scripts/transition-spec.sh <spec-path> implementation-in-progress
mv docs/backlog/todo/<filename> docs/backlog/in-progress/
```
Update `<spec-path>` to the new `in-progress/` location before continuing.

### Phase 2 — VALIDATE READINESS

```bash
.agents/skills/implement/scripts/validate-before-implementation.sh <spec-path>
```

- Exit 0 → proceed to Phase 3
- Exit 1 → report blockers to user and stop

**If blockers found**, first triage each blocker:

**Formatting/tooling issue** (wrong markdown, missing `- [ ]` checkboxes on breakdown items, unfilled `{{ }}` placeholders):
→ Fix in place, re-run the validator, continue. Do NOT ask the user.

**Real spec gap** (ambiguous requirement, unresolved business rule, unspecified behavior, missing edge case):
→ Report to user and ask:
> "⚠️ Spec not ready for implementation:
> [List blockers from script output]
>
> Should I transition it back to `specifying` for refinement?"

If yes:
```bash
.agents/skills/spec-gate/scripts/transition-spec.sh <spec-path> specifying
mv docs/backlog/in-progress/<filename> docs/backlog/todo/
```

### Phase 3 — SETUP

1. Read the spec completely
2. Extract: acceptance criteria, examples, breakdown, technical notes, "What NOT"
3. Read the project's `AGENTS.md` for build/test commands
4. Read the `test-implementation` skill for testing guidance
5. Create TODO list from the spec's "Breakdown" section
6. Confirm with user:
   > "Ready to implement [title] (size: [X], project: [Y]).
   > Steps: [breakdown items]
   > Proceed?"

### Phase 4 — IMPLEMENT (per breakdown item)

For each TODO:

**1. Code** — Follow acceptance criteria and examples. Reference "Technical Notes" for affected files. Check "What NOT" to avoid scope creep.

**2. Test** — For each `[TEST]` criterion covered by this TODO, write an automated test following `test-implementation` skill patterns. `[MANUAL]` criteria do NOT get automated tests.

**3. Build & test** — Run the build command from `AGENTS.md`, then `make test-filter filter="RelevantTestClass"` for fast feedback. On failure: fix immediately, do not continue.

**4. Spec gap check** — After completing the TODO, evaluate:
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

Do NOT guess or assume. Wait for clarification.

**If NO → mark TODO done, continue to next item.**

### Phase 5 — HANDOFF

After all TODOs complete:

1. Run full build and tests (commands from `AGENTS.md`)
2. Report completion:
   > "✅ Implementation complete for [title].
   > [X] files modified, [Y] tests added.
   >
   > Run `implementation-gate` to validate before review."

Do NOT duplicate the implementation-gate's validation — that's its job.

## Spec Gap Handling — When to STOP

- Acceptance criteria don't cover the current case
- Multiple valid approaches exist and spec doesn't specify which
- Business rule is ambiguous or contradictory
- Error handling behavior is unspecified
- Edge case not illustrated by any example

**Never**: guess, add "useful" features, choose between approaches, expand scope.

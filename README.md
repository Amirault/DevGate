# DevGate
DevGate is a spec-driven delivery workflow for agent-assisted development.

It coordinates four phases, each backed by a skill:

- **specify** — define and approve the change before implementation (includes a mandatory `grilling` stress-test pass and a mandatory per-section human review)
- **implement** — execute only approved specs, increment by increment, tests first, every increment ending with a mandatory subagent refactoring pass
- **review** — validate quality, test coverage, refactoring, blast radius, architecture, and readiness before human sign-off
- **learn** — evidence-based retrospective on a completed spec, using captured session data

```
specify → implement → review → (human DONE) → learn
```

## What this repository contains
Workflow assets under `.agents/`:

- `skills/specify/` — create/refine specs in `docs/backlog/`, human-review each section, get explicit approval (`ready-to-implement`)
- `skills/grilling/` — relentless interview to stress-test a plan before specifying (mandatory in `specify` Phase 3.5)
- `skills/human-review-spec/` — per-section spec review with the human (mandatory in `specify` Phase 4.5)
- `skills/implement/` — execute an approved spec increment by increment
- `skills/refactoring/` — active refactoring guide (Fowler's smell catalog, SOLID, Uncle Bob); applied by a subagent pass after every increment
- `skills/review/` — validate readiness for human review
- `skills/test-implementation/` — test patterns and quality standards (FIRST, Given/When/Then, exclusion testing)
- `skills/learn/` — retrospective on a completed spec from captured sessions
- `tools/capture-spec-sessions/` — Node.js tool that exports a spec's full conversation history (Warp, Claude Code, or Hermes) as JSONL for the `learn` phase

Each skill folder includes `SKILL.md` (behavior and rules) plus helper scripts, references, and templates where applicable.

## End-to-end workflow

1. **specify**
   - discover context, clarify scope and risks
   - **grill** the plan (mandatory, Phase 3.5)
   - create/refine spec in `docs/backlog/todo/`
   - **human-review every section** (mandatory, Phase 4.5 — `## Why`, `## What`, `## What NOT`, `## Acceptance Criteria`, `## Examples`, `## Technical Notes`, one explicit ✅ each)
   - derive the `## Implementation Plan`: ordered increments with What/How/Validation/Commit and an unchecked `**Refactoring**` sub-checkbox per increment
   - get explicit approval (`ready-to-implement`)
   - capture the session at close (non-blocking)

2. **implement**
   - select an approved spec, transition to `implementation-in-progress`
   - implement per the spec's Implementation Plan, increment by increment
   - add automated tests for `[TEST]` criteria (see `test-implementation`) and persist a clause-level proof matrix in `## Implementation Log`
   - **refactor every increment** (mandatory): a subagent pass applying the `refactoring` skill to the files that increment changed, after its code is green — the increment's `**Refactoring**` checkbox is checked only after the pass
   - capture the session at close (non-blocking)

3. **review**
   - validate implementation against the spec (impact-aware git-changes review: the diff plus its blast radius)
   - verify `[TEST]` criteria coverage, code quality, refactoring outcomes, blast radius, architecture, build/tests
   - list **post-merge increments** (all-`[MANUAL]` increments that can only run after deploy) — they never block PASS, but block DONE
   - transition to `implemented` when the gate passes
   - close to `done` only after human `DONE` sign-off (and after post-merge increments are executed and checked off)
   - capture the session at close (non-blocking)

4. **learn**
   - extract the spec's conversation bundle via `capture-spec-sessions`
   - classify breakdown points (asset interpretation gaps, bad expectations, time cost, side improvements), score them, prioritize down to at most one cross-spec harness improvement with evidence
   - read-only: suggests the fix, never applies it

### Session capture & traceability
Each phase emits a `SPEC_MARKER` (`: SPEC_MARKER v=1 spec_id=<slug> phase=<phase>`) that binds its conversation to the spec. At each phase close, the `capture-spec-sessions` wrapper writes a decay-safe merged bundle:

```bash
.agents/tools/capture-spec-sessions/capture.sh --spec <slug> --source <warp|claude-code|hermes>
```

The wrapper works from any cwd (repo root, any subdirectory, a git worktree), installs the tool's npm dependencies on first use, resolves node through `mise` when available, and stores bundles in the **main checkout's** `spec-sessions/` store (gitignored), so a capture made in a disposable worktree survives the worktree's removal. Always pass `--source` explicitly. This keeps phases recoverable even after a runtime's marker-binding decay, so `learn` can reconstruct what happened long after the fact.

## Prerequisites
- Unix-like environment (shell scripts)
- **Node.js ≥ 22** for `capture-spec-sessions` — `capture.sh` installs its dependencies on first use; for direct CLI use, `cd .agents/tools/capture-spec-sessions && npm install`
- **Warp**, **Claude Code**, or **Hermes** as the session source — the `SPEC_MARKER` must be in that runtime's local session store; remote (cloud) sessions are not captured (documented gap)

## Backlog layout expected by the skills
- `docs/backlog/todo/`
- `docs/backlog/in-progress/`
- `docs/backlog/done/`
- `docs/backlog/rejected/`

## Core principles
- **No implementation before spec approval**
- **Spec is the source of truth**
- **Stop on ambiguity (do not invent behavior)**
- **Test what is marked as `[TEST]`**
- **Refactor every increment — an increment is not done until its refactoring pass has run**
- **Reject scope creep using the spec's "What NOT" section**

## Adoption notes
- The `project` field in templates uses generic placeholders and can be adapted to your project names.
- Scripts are shell-based and designed for Unix-like environments.
- Some skills retain references to their origin project (Wakam Pricing) in examples; adapt them to your context.

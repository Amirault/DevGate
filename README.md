# DevGate
DevGate is a spec-driven delivery workflow for agent-assisted development.

It coordinates four phases, each backed by a skill:

- **specify** — define and approve the change before implementation (includes a mandatory `grilling` stress-test pass)
- **implement** — execute only approved specs, incrementally and with tests
- **review** — validate quality, test coverage, architecture, and readiness before human sign-off
- **learn** — evidence-based retrospective on a completed spec, using captured session data

```
specify → implement → review → (human DONE) → learn
```

## What this repository contains
Workflow assets under `.agents/`:

- `skills/specify/` — create/refine specs in `docs/backlog/`, get explicit approval (`ready-to-implement`)
- `skills/implement/` — execute an approved spec increment by increment
- `skills/review/` — validate readiness for human review
- `skills/learn/` — retrospective on a completed spec from captured sessions
- `skills/grilling/` — relentless interview to stress-test a plan before specifying (mandatory in `specify` Phase 3.5)
- `skills/test-implementation/` — test patterns and quality standards (FIRST, Given/When/Then, exclusion testing)
- `tools/capture-spec-sessions/` — Node.js tool that exports a spec's full conversation history (Warp or Claude Code) as JSONL for the `learn` phase

Each skill folder includes `SKILL.md` (behavior and rules) plus helper scripts, references, and templates where applicable.

## End-to-end workflow

1. **specify**
   - discover context, clarify scope and risks
   - **grill** the plan (mandatory)
   - create/refine spec in `docs/backlog/todo/`
   - get explicit approval (`ready-to-implement`)
   - capture the session at close (non-blocking)

2. **implement**
   - select an approved spec, transition to `implementation-in-progress`
   - implement per the spec's Implementation Plan, increment by increment
   - add automated tests for `[TEST]` criteria (see `test-implementation`)
   - capture the session at close (non-blocking)

3. **review**
   - validate implementation against the spec (impact-aware git-changes review)
   - verify `[TEST]` criteria coverage, code quality, blast radius, architecture, build/tests
   - transition to `implemented` when the gate passes
   - close to `done` only after human `DONE` sign-off
   - capture the session at close (non-blocking)

4. **learn**
   - extract the spec's conversation bundle via `capture-spec-sessions`
   - report evidence-based improvements to the skills/tooling (read-only)

### Session capture & traceability
Each phase emits a `SPEC_MARKER` (`: SPEC_MARKER v=1 spec_id=<slug> phase=<phase>`) that binds its conversation to the spec. At each phase close, `capture-spec-sessions` writes a decay-safe merged bundle under `.agents/tools/capture-spec-sessions/spec-sessions/<slug>.jsonl` (gitignored). This keeps phases recoverable even after Warp's marker-binding decay, so `learn` can reconstruct what happened long after the fact.

## Prerequisites
- Unix-like environment (shell scripts)
- **Node.js ≥ 22** for `capture-spec-sessions` — install deps with `cd .agents/tools/capture-spec-sessions && npm install`
- **Warp** (default source) or **Claude Code** for session capture — the `SPEC_MARKER` must be in the local session store; remote (cloud) sessions are not captured (documented gap)

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
- **Reject scope creep using the spec's "What NOT" section**

## Adoption notes
- The `project` field in templates uses generic placeholders and can be adapted to your project names.
- Scripts are shell-based and designed for Unix-like environments.
- Some skills retain references to their origin project (Wakam Pricing) in examples; adapt them to your context.

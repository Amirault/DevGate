# DevGate
DevGate is a lightweight, spec-driven delivery workflow for agent-assisted development.

It provides three coordinated skills:
- **spec-gate** — define and approve the change before implementation
- **implement** — execute only approved specs, incrementally and with tests
- **implementation-gate** — validate quality, test coverage, architecture, and readiness before human sign-off

The goal is simple: make implementation predictable, reviewable, and safe.

## What this repository contains
This repository intentionally contains only workflow assets:

- `.agents/skills/spec-gate/`
- `.agents/skills/implement/`
- `.agents/skills/implementation-gate/`

Each folder includes:
- `SKILL.md` (behavior and rules for the skill)
- helper scripts used by the skill
- references/templates where applicable

## End-to-end workflow
The expected lifecycle is:

1. **spec-gate**
   - discover context
   - clarify scope and risks
   - create/refine spec in `docs/backlog/todo/`
   - get explicit approval (`ready-to-implement`)

2. **implement**
   - select an approved spec
   - transition to `implementation-in-progress`
   - implement per breakdown
   - add automated tests for `[TEST]` criteria

3. **implementation-gate**
   - validate implementation against the spec
   - verify `[TEST]` criteria coverage
   - run build/tests and quality checks
   - transition to `implemented` when gate passes
   - close to `done` only after human `DONE` sign-off

## Backlog layout expected by the skills
These skills expect the following structure in your project:

- `docs/backlog/todo/`
- `docs/backlog/in-progress/`
- `docs/backlog/done/`
- `docs/backlog/rejected/`

## Core principles
- **No implementation before spec approval**
- **Spec is the source of truth**
- **Stop on ambiguity (do not invent behavior)**
- **Test what is marked as `[TEST]`**
- **Reject scope creep using the spec’s “What NOT” section**

## Adoption notes
- The `project` field in templates uses generic placeholders (`ProjectA`, `ProjectB`) and can be adapted to your own project names.
- Scripts are shell-based and designed for Unix-like environments.
- You can use this workflow as-is or tailor criteria/checklists to your team standards.


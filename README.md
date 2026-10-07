<div align="center">

# 🚦 DevGate

### Spec first. Gates in between. Evidence at the end.

A spec-driven delivery workflow for agent-assisted development — specify, implement, review, learn —
built from plain `SKILL.md` files you can drop into Claude Code, Warp or Hermes.

![Skills](https://img.shields.io/badge/skills-9-8a2be2)
![Phases](https://img.shields.io/badge/phases-4-blue)
![Runtimes](https://img.shields.io/badge/runtimes-Claude%20Code%20%C2%B7%20Warp%20%C2%B7%20Hermes-success)
![Node](https://img.shields.io/badge/node-%E2%89%A5%2022-3c873a)

</div>

```text
specify ──▶ deliver-increment(1) ──▶ PR 1 ──▶ merge ──▶ deliver-increment(2) ──▶ PR 2 ──▶ … ──▶ DONE ──▶ learn
  ▲ grill     implement ▸ refactor ▸ review ▸ commit        one increment = one goal = one pull request
  ▲ human OK  (three fresh subagents, auto-fix until PASS)  green against the full harness before it ships
```

---

## ✨ Why DevGate

Agents are fast. Without guard rails they are also fast at building the **wrong thing**, skipping
tests, and quietly widening scope. DevGate puts a gate between every step, and keeps the evidence
so the workflow itself gets better with every spec.

| Gate | What it enforces |
| --- | --- |
| 🛑 **No code before approval** | Nothing is implemented until the spec is explicitly `ready-to-implement`. |
| 🔥 **Grilled plans** | A relentless interview stress-tests the plan before it becomes a spec. |
| 👀 **Human reviews every section** | `Why`, `What`, `What NOT`, `Acceptance Criteria`, `Examples`, `Technical Notes` — one explicit ✅ each. |
| 🧪 **Tests first** | Every `[TEST]` criterion gets an automated test and a clause-level proof matrix. |
| 📦 **One increment = one PR** | Each increment has one goal, ships alone, is reviewed before it is committed and is green on the full harness. |
| 🧹 **Refactor every increment** | An increment isn't done until a subagent refactoring pass has run. |
| 🔎 **Impact-aware review** | The diff *and* its blast radius are validated before human sign-off. |
| 📈 **Learn from the sessions** | A retrospective on real conversations suggests at most one evidenced harness improvement. |

## 🔄 The four phases

```mermaid
flowchart LR
    S["📝 specify<br/>grill · human review · approve"] --> I["🔨 deliver-increment<br/>implement ▸ refactor ▸ review ▸ commit ▸ draft PR"]
    I -- "human merges, next increment" --> I
    I --> D{{"✅ human DONE"}}
    D --> L["📈 learn<br/>retro from captured sessions"]
    L -. "one evidenced improvement" .-> S
```

### 1 · specify
- discover context, clarify scope and risks
- **grill** the plan *(mandatory, Phase 3.5)*
- create/refine the spec in `docs/backlog/todo/`
- **human-review every section** *(mandatory, Phase 4.5)*
- derive the `## Implementation Plan`: ordered increments with What / How / Validation / Commit and an unchecked `**Refactoring**` sub-checkbox each
- get explicit approval (`ready-to-implement`)

### 2 · implement — via `deliver-increment`
Run `/deliver-increment <spec>`: it delivers **one increment as one pull request**, then stops and asks before the next one.
- three **fresh subagents** per increment: `implement(N)` → `refactor(N)` → `review(N)`; the reviewer auto-fixes until a clean **PASS** (cap: 5 iterations)
- `implement(N)` follows the plan test-first, adds automated tests for `[TEST]` criteria and persists a clause-level proof matrix in `## Implementation Log`; it stops on spec gaps instead of inventing behaviour
- **refactor every increment** *(mandatory)* — the checkbox is ticked only after the pass
- every increment is green against the **full harness** (`.agents/skills/specify/references/harness.md`) before it is committed
- then one commit on `workflow/<spec-slug>-<N>` and an **Ask** draft PR; increment N+1 starts only once PR N is merged

### 3 · review
- scopes: git changes, **one increment** (plus a whole-spec completeness check on the last one), or the whole branch; optional auto-fix of blockers
- impact-aware review (the diff plus its blast radius), `[TEST]` coverage, quality, refactoring outcomes, architecture, full harness rerun
- move to `implemented` when the last increment passes; close to `done` only after human `DONE`
- a spec with a `## Rollout observation` section also checks that its report was written after deploy

### 4 · learn
- extract the spec's conversation bundle through `capture-spec-sessions`
- classify breakdown points (asset interpretation gaps, bad expectations, time cost, side improvements), score and prioritise
- record every finding in the **learning history** (`docs/learnings/`, written only through `.agents/scripts/learnings.py`; see its [schema](docs/learnings/SCHEMA.md))
- suggests at most one evidenced cross-spec improvement, never applies it

## 🧰 What's inside

Everything lives under [`.agents/`](.agents):

| Skill | Role |
| --- | --- |
| [`specify`](.agents/skills/specify) | Create/refine specs in `docs/backlog/`, human-review each section, get approval |
| [`grilling`](.agents/skills/grilling) | Relentless interview that stress-tests a plan *(mandatory in specify Phase 3.5)* |
| [`human-review-spec`](.agents/skills/human-review-spec) | Per-section spec review with the human *(mandatory in Phase 4.5)* |
| [`deliver-increment`](.agents/skills/deliver-increment) | Deliver one increment as one PR: implement ▸ refactor ▸ review ▸ commit, in fresh subagents |
| [`implement`](.agents/skills/implement) | Implement ONE increment of an approved spec *(the `implement(N)` subagent of `deliver-increment`)* |
| [`refactoring`](.agents/skills/refactoring) | Fowler's smell catalog, SOLID, Uncle Bob — run by a subagent after every increment |
| [`test-implementation`](.agents/skills/test-implementation) | FIRST, Given/When/Then, exclusion testing |
| [`review`](.agents/skills/review) | Validate readiness before human sign-off |
| [`learn`](.agents/skills/learn) | Retrospective on a completed spec from captured sessions, recorded in the learning history |
| [`.agents/scripts/learnings.py`](.agents/scripts) | Stdlib-only writer and checker of `docs/learnings/` |
| [`tools/capture-spec-sessions`](.agents/tools/capture-spec-sessions) | Node tool that exports a spec's full conversation history (Warp, Claude Code or Hermes) as JSONL |

Each skill folder has a `SKILL.md` (behaviour and rules) plus helper scripts, references and
templates where useful.

## 📼 Session capture & traceability

Each phase emits a marker — a shell no-op — that binds its conversation to the spec:

```text
: SPEC_MARKER v=1 spec_id=<slug> phase=<specify|implement|review>
```

At each phase close, the wrapper writes a **decay-safe merged bundle**:

```bash
.agents/tools/capture-spec-sessions/capture.sh --spec <slug> --source <warp|claude-code|hermes>
```

- works from any cwd — repo root, a subdirectory, a git worktree
- installs its npm dependencies on first use, resolves node through `mise` when available
- stores bundles in the **main checkout's** `spec-sessions/` (gitignored), so a capture made in a
  disposable worktree outlives it
- always pass `--source` explicitly

That keeps every phase recoverable even after a runtime evicts its own history, so `learn` can
reconstruct what happened long after the fact.

> Want just the capture part, without the workflow? See
> [**agent-session-capture**](https://github.com/Amirault/agent-session-capture) — a generic
> marker + adapters, no specs or phases.

## 🚀 Getting started

**Prerequisites**
- Unix-like environment (the scripts are shell)
- **Node.js ≥ 22** for `capture-spec-sessions` — `capture.sh` installs dependencies on first use; for direct CLI use: `cd .agents/tools/capture-spec-sessions && npm install`
- **Warp**, **Claude Code** or **Hermes** as the session source — the marker must be in that runtime's local session store; remote (cloud) sessions are not captured *(documented gap)*

**Backlog layout the skills expect**

```text
docs/backlog/
├── todo/
├── in-progress/
├── done/
└── rejected/

docs/learnings/        # written by the learn skill, via learnings.py
```

## 🧭 Core principles

1. **No implementation before spec approval**
2. **The spec is the source of truth**
3. **Stop on ambiguity** — never invent behaviour
4. **Test what is marked `[TEST]`**
5. **Refactor every increment** — it isn't done until its refactoring pass has run
6. **Reject scope creep** using the spec's *What NOT* section

## 🔧 Adoption notes

- The `project` field in templates uses generic placeholders — adapt it to your project names.
- Scripts are shell-based, designed for Unix-like environments.
- Some skills keep references to their origin project (Wakam Pricing) in examples; adapt them to your context.

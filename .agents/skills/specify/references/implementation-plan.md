# Implementation Plan

Read during specify Phase 5, before writing any increment of the `## Implementation Plan`. These are the planning rules and the content every increment must carry; persisting, self-reviewing and presenting the plan stay in `SKILL.md` (Phase 5).

1. **Derive the plan from the spec** — discrete, ordered increments, dependency order respected. **Planning rules** (an increment is a slice of the need with one clear goal, delivered as its own pull request: implemented, refactored, reviewed, committed and opened on its own, then merged before the next one starts):
   - **One clear goal**: each increment states a **Goal** a reviewer understands without reading code (what changes, for whom, once its pull request is merged), and **What**/**How** precise enough for an agent to implement and review it without guessing. A goal that needs several unrelated changes is two increments.
   - **Shippable alone**: once its pull request is merged, each increment passes the full harness (`.agents/skills/specify/references/harness.md`) and never needs a later increment to compile or pass tests.
   - **Contract changes carry their consumers**: an increment that changes a public contract (API, DTO, port, event, persisted shape) updates every consumer in the same increment.
   - **No dead code**: everything an increment adds is used once its pull request is merged; nothing waits for a later increment to be called.
   - **Feature flag** when RISK is 🟡/🔴 or existing consumers would see a behavior change: the increment that changes behavior puts it behind a flag.
   - **Preparatory refactoring** — a structural change that makes the next increment easy — is its own increment, placed before the increment that needs it and **described** (title `Preparatory refactoring: …`, commit type `refactor`). It changes no behavior: no changed test assertions, no new public behavior.
   - **Post-increment refactoring is requested, never described**: every increment carries the bare line `- [ ] **Refactoring**: subagent pass`. The subagent applies `.agents/skills/refactoring/SKILL.md` to the code that actually exists; the plan never lists targets, smells or extractions for it (the code does not exist yet).
   - **Post-merge work is never an increment**: checks that can only run after merge and deploy go to `## Rollout observation`.
2. **For each increment, specify**:
   - **Goal**: what changes once its pull request is merged, in one or two sentences a reviewer understands without the code.
   - **What**: exact files to create/modify/delete.
   - **How**: key design decisions, naming conventions, namespace/layout rules — no ambiguity left for the implementing agent.
   - **Validation**: the full harness → green (`full harness (.agents/skills/specify/references/harness.md) → green`), optionally followed by increment-specific checks — never a filtered test run.
   - **Commit**: a draft conventional commit message (scope + type), also the title of the increment's pull request.
   - **Refactoring**: the bare `- [ ] **Refactoring**: subagent pass` sub-checkbox, left unchecked — it is checked only after the increment's subagent refactoring pass.
3. **Flag risks and guardrails**:
   - DI ordering constraints, shared singletons that must not be duplicated.
   - Boundary conversions (e.g. enum bridging between cloned and original types).
   - Files that look similar but must NOT be confused (file name ≠ type name).
4. **Reference existing patterns**:
   - Cite analogous code in the codebase the implementer should mirror.
   - Link to relevant ADRs, domain docs, or prior specs.

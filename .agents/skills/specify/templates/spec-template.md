---
# status: specifying | ready-to-implement | on-hold | implementation-in-progress | implemented | done | rejected
status: specifying
project: { { target project(s) } }
created_at: { { YYYY-MM-DDTHH:MM:SSZ } }
approved_at:
started_at:
implemented_at:
done_at:
rejected_at:
origin_spec:
---

<!-- IMPORTANT: ALL content in this spec MUST be written in English -->

# Spec: {{ Title }}

## Why

{{ Problem statement — 2-3 sentences. What's the real problem and who is affected? }}

## What

{{ Description of the change. What exactly are we doing? }}

## Acceptance Criteria

<!-- Mark each criterion with [TEST] or [MANUAL]:
     [TEST]   = MUST be implemented as an automated test (business logic, data transformations, API behavior, domain rules)
     [MANUAL] = Manual validation only, no automated test expected (file moves, infra verification, UI checks, deployment state)
     The review will verify every [TEST] criterion has a corresponding test. Missing = blocker. -->

- [TEST] Given {{ context }}, When {{ action }}, Then {{ expected result }}
- [TEST] Given {{ context }}, When {{ action }}, Then {{ expected result }}
- [MANUAL] {{ criterion that requires manual validation }}

## Examples

<!-- Example Mapping style: behavioral scenarios (Given/When/Then context), not code examples. -->
<!-- Concrete examples that illustrate each acceptance criterion and edge case. -->
<!-- The agent must spot areas where examples are needed and propose them. -->

### Example 1: {{ descriptive name }}

- **Context**: {{ initial state / setup with real-looking data }}
- **Action**: {{ what happens }}
- **Result**: {{ expected outcome }}

### Example 2: {{ descriptive name }}

- **Context**: {{ initial state / setup with real-looking data }}
- **Action**: {{ what happens }}
- **Result**: {{ expected outcome }}

### Example 3 (edge case): {{ descriptive name }}

- **Context**: {{ edge case setup with real-looking data }}
- **Action**: {{ what happens }}
- **Result**: {{ expected outcome }}

## What NOT (explicit exclusions)

- We are NOT doing {{ X }}
- We are NOT changing {{ Y }}

## Implementation Plan

<!-- Written by specify Phase 5 BEFORE approval. This is the handoff artifact: the increments
     are delivered in order, ONE PULL REQUEST PER INCREMENT — each one implemented, refactored,
     reviewed, committed and opened as a PR on its own, then merged before the next one starts.
     Planning rules (specify Phase 5):
     - Each increment has one clear **Goal**: what changes once its PR is merged, readable by a
       reviewer without the code. **What**/**How** are precise enough for an agent to implement
       and review it without guessing.
     - Each increment is shippable alone and passes the full harness alone: it never needs a
       later increment to compile or pass tests.
     - An increment that changes a public contract updates its consumers in the same increment.
     - No dead code: everything an increment adds is used once its PR is merged.
     - Preparatory refactoring (structure only, no behavior change) is its own increment, placed
       before the increment that needs it and DESCRIBED: title "Preparatory refactoring: …",
       commit type `refactor`.
     - Post-increment refactoring is REQUESTED, never described: keep the Refactoring line bare
       (`- [ ] **Refactoring**: subagent pass`). The subagent finds the smells in the code that
       actually exists. Left unchecked; checked after the pass.
     - **Validation** names the full harness (`.agents/skills/specify/references/harness.md`),
       never a filtered test run (`--filter`). Increment-specific checks may follow it.
     - **Commit** is also the title of the increment's PR.
     - Checks that can only run after merge and deploy go to `## Rollout observation`, never here.
     Approval (transition to ready-to-implement) is blocked until this section is filled and
     `validate-spec.sh --require-plan` passes. -->

- [ ] Increment 1: {{ short title }}
  - **Goal**: {{ what changes once this PR is merged, for whom — one or two sentences, no code }}
  - **What**: {{ files to create/modify/delete }}
  - **How**: {{ key design decisions, naming, layout }}
  - **Validation**: full harness (`.agents/skills/specify/references/harness.md`) → green
  - **Commit**: {{ type(scope): message }}
  - [ ] **Refactoring**: subagent pass
- [ ] Increment 2: {{ short title }}
  - **Goal**: {{ what changes once this PR is merged, for whom — one or two sentences, no code }}
  - **What**: {{ files to create/modify/delete }}
  - **How**: {{ key design decisions, naming, layout }}
  - **Validation**: full harness (`.agents/skills/specify/references/harness.md`) → green
  - **Commit**: {{ type(scope): message }}
  - [ ] **Refactoring**: subagent pass

## Rollout observation

<!-- Optional — delete this section when nothing changes in production.
     What can only be checked after merge and deploy: it is never an increment. The report of
     this observation is recorded in `## Implementation Log` before the human says DONE. -->

- **What changes in production**: {{ behavior, traffic, data or cost that changes once deployed }}
- **Success signals (candidates)**: {{ metric / log / trace that shows it works }}
- **Failure signals (candidates)**: {{ metric / log / trace that shows it breaks }}
- **Observation window**: {{ how long to watch after deploy, e.g. 24h or 1 week of partner traffic }}

## Follow-up

<!-- Optional — ideas left out of this spec, for possible future specs. Delete when empty. -->

- [ ] {{ idea left for later }}

## Technical Notes

- Files likely affected: {{ list }}
- Dependencies: {{ list }}
- Risks: {{ list }}

## Implementation Log

<!-- Append-only. Record decisions and scope changes discovered DURING implementation here
     (date, what changed, why, who approved) — use this INSTEAD of silently editing Acceptance
     Criteria or Examples. The timestamp is the output of `date -u +%Y-%m-%dT%H:%M:%SZ`, run right
     before writing the entry: never type, round or estimate a time, so entries stay in order. Acceptance Criteria/Examples are immutable once ready-to-implement:
     supersede the old text with ~~strikethrough~~ + a pointer to the relevant entry below. -->

- {{ YYYY-MM-DDTHH:MM:SSZ }} — {{ what changed (e.g. "removed vuln-scan gate from AC #3") }} — {{ why }} — approved by {{ who }}

## Open Questions

- [ ] {{ question 1 }}
- [ ] {{ question 2 }}

## Spec Quality Checklist

<!-- Author self-review. specify verifies each item against the actual spec content — the
     spec items during Phase 4.5, the plan items (increments, flag, refactoring, rollout)
     during Phase 5 — and checks it off ONLY when true — fix the spec first otherwise.
     Approval (transition to ready-to-implement) is blocked while any box is unchecked. -->

- [ ] Problem statement is clear and tied to a real user or system need
- [ ] Scope boundaries are explicit (what is in, what is out)
- [ ] Acceptance criteria cover happy path, edge cases, and failure modes
- [ ] Examples use realistic data and are mapped to criteria
- [ ] Every external reference (cloud IDs, linked docs, origin_spec) is verified against its live source, not assumed
- [ ] Cross-section consistency: `## What NOT` items do not appear in `## Technical Notes`, `## Implementation Plan`, or `## Health Check`
- [ ] Health Check has no 🔴 scores
- [ ] Every increment has one clear Goal a reviewer understands without the code, and What/How precise enough for an agent to implement and review it without guessing
- [ ] Every increment is shippable alone as its own pull request and passes the full harness alone; one that changes a public contract updates its consumers
- [ ] No dead code: everything an increment adds is used once its pull request is merged
- [ ] Behind a feature flag when RISK is 🟡/🔴 or existing consumers would see a behavior change
- [ ] Preparatory refactoring planned as its own described increment; post-increment refactoring only requested (bare Refactoring line)
- [ ] Post-deploy checks sit in `## Rollout observation`, none in the Implementation Plan

## Implementation Rules

- Follow this spec strictly — it is the single source of truth for this task
- If you discover something not covered by this spec, STOP and ask the user; write the resolution back into this spec before continuing
- Do NOT expand scope beyond what this spec says
- Refer to "What NOT" section to avoid scope creep
- Acceptance Criteria and Examples are immutable once a spec is `ready-to-implement`. If an approved criterion or example must change during implementation, do NOT rewrite or delete it — mark the superseded text with `~~strikethrough~~` and a pointer to the new `## Implementation Log` entry that explains the change and who approved it.
- When the human starts implementation (`/deliver-increment`), the first increment transitions this spec to `implementation-in-progress` and moves it to `docs/backlog/in-progress/`
- `deliver-increment` delivers ONE increment per run, as ONE pull request: fresh subagents implement → refactor → review (auto-fix until PASS), then one commit on `workflow/<spec-slug>-<N>` and an Ask draft PR. Each increment passes the full harness alone (`.agents/skills/specify/references/harness.md`); its **Refactoring** checkbox is checked after its subagent refactoring pass (`.agents/skills/refactoring/SKILL.md` — Fowler, Uncle Bob), the increment itself after a clean PASS
- After each increment PR, the workflow stops and asks whether to continue; the next increment starts from `main` only once that PR is merged
- The review of the last increment also checks the whole spec; on PASS, `deliver-increment` transitions this spec to `implemented` (stays in `in-progress/`) before the last commit
- When the human says DONE (every increment PR merged), the review transitions this spec to `done` and moves it to `docs/backlog/done/`

## Health Check

| Dimension | Score        | Notes       |
| --------- | ------------ | ----------- |
| WHY       | {{ 🟢🟡🔴 }} | {{ notes }} |
| WHAT      | {{ 🟢🟡🔴 }} | {{ notes }} |
| RISK      | {{ 🟢🟡🔴 }} | {{ notes }} |
| GAPS      | {{ 🟢🟡🔴 }} | {{ notes }} |

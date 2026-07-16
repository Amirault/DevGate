---
# status: specifying | ready-to-implement | on-hold | implementation-in-progress | implemented | done | rejected
status: specifying
project: {{ target project(s) }}
created_at: {{ YYYY-MM-DD HH:MM }}
approved_at:
started_at:
implemented_at:
done_at:
rejected_at:
size: {{ XS(<15min) | S(<30min) | M(<1h) | L(>1h) }}
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
     The implementation-gate will verify every [TEST] criterion has a corresponding test. Missing = blocker. -->
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
<!-- Written by specify Phase 5 BEFORE approval. This is the handoff artifact: the implement
     skill executes these increments in order and checks each one off after build + tests pass.
     Each increment: What (files), How (decisions), Validation (build/test), Commit scope.
     Approval (transition to ready-to-implement) is blocked until this section is filled. -->
- [ ] Increment 1: {{ short title }}
  - **What**: {{ files to create/modify/delete }}
  - **How**: {{ key design decisions, naming, layout }}
  - **Validation**: {{ build/test command }} → {{ expected outcome }}
  - **Commit**: {{ type(scope): message }}
- [ ] Increment 2: {{ short title }}
  - **What**: {{ files to create/modify/delete }}
  - **How**: {{ key design decisions, naming, layout }}
  - **Validation**: {{ build/test command }} → {{ expected outcome }}
  - **Commit**: {{ type(scope): message }}

## Follow-up
<!-- If this task is part of a larger split, list the sequence here -->
- [ ] Task 1: [title](./YYYY-MM-DD-slug.md) — do first
- [ ] Task 2: [title](./YYYY-MM-DD-slug.md) — depends on Task 1
- [ ] Task 3: [title](./YYYY-MM-DD-slug.md) — depends on Task 1, 2

## Technical Notes
- Files likely affected: {{ list }}
- Dependencies: {{ list }}
- Risks: {{ list }}

## Implementation Log
<!-- Append-only. Record decisions and scope changes discovered DURING implementation here
     (date, what changed, why, who approved) — use this INSTEAD of silently editing Acceptance
     Criteria or Examples. Acceptance Criteria/Examples are immutable once ready-to-implement:
     supersede the old text with ~~strikethrough~~ + a pointer to the relevant entry below. -->
- {{ YYYY-MM-DD }} — {{ what changed (e.g. "removed vuln-scan gate from AC #3") }} — {{ why }} — approved by {{ who }}

## Open Questions
- [ ] {{ question 1 }}
- [ ] {{ question 2 }}

## Spec Quality Checklist
<!-- Author self-review. specify verifies each item against the actual spec content during
     Phase 4 and checks it off ONLY when true — fix the spec first otherwise.
     Approval (transition to ready-to-implement) is blocked while any box is unchecked. -->
- [ ] Problem statement is clear and tied to a real user or system need
- [ ] Scope boundaries are explicit (what is in, what is out)
- [ ] Acceptance criteria cover happy path, edge cases, and failure modes
- [ ] Examples use realistic data and are mapped to criteria
- [ ] Every external reference (cloud IDs, linked docs, origin_spec) is verified against its live source, not assumed
- [ ] Health Check has no 🔴 scores

## Implementation Rules
- Follow this spec strictly — it is the single source of truth for this task
- If you discover something not covered by this spec, STOP and ask the user; write the resolution back into this spec before continuing
- Do NOT expand scope beyond what this spec says
- Refer to "What NOT" section to avoid scope creep
- Acceptance Criteria and Examples are immutable once a spec is `ready-to-implement`. If an approved criterion or example must change during implementation, do NOT rewrite or delete it — mark the superseded text with `~~strikethrough~~` and a pointer to the new `## Implementation Log` entry that explains the change and who approved it.
- When the human starts implementation, the implement skill transitions this spec to `implementation-in-progress` and moves it to `docs/backlog/in-progress/`
- The implement skill checks off each Implementation Plan increment after its build + tests pass
- When implementation-gate passes, it transitions this spec to `implemented` (stays in `in-progress/`)
- When the human says DONE, the implementation-gate transitions this spec to `done` and moves it to `docs/backlog/done/`

## Health Check
| Dimension | Score | Notes |
|-----------|-------|-------|
| WHY       | {{ 🟢🟡🔴 }} | {{ notes }} |
| WHAT      | {{ 🟢🟡🔴 }} | {{ notes }} |
| SIZE      | {{ 🟢🟡🔴 }} | {{ notes }} |
| RISK      | {{ 🟢🟡🔴 }} | {{ notes }} |
| GAPS      | {{ 🟢🟡🔴 }} | {{ notes }} |

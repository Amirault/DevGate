---
# status: specifying | ready-to-implement | on-hold | implementation-in-progress | implemented | done
status: specifying
project: {{ ProjectA | ProjectB }}
created_at: {{ YYYY-MM-DD HH:MM }}
approved_at:
started_at:
implemented_at:
done_at:
size: {{ XS(<5min) | S(<15min) | M(<30min) | L(>1h) }}
merge_on_completion: false
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

## Breakdown
- [ ] Sub-task 1
- [ ] Sub-task 2
- [ ] Sub-task 3

## Follow-up
<!-- If this task is part of a larger split, list the sequence here -->
- [ ] Task 1: [title](./YYYY-MM-DD-slug.md) — do first
- [ ] Task 2: [title](./YYYY-MM-DD-slug.md) — depends on Task 1
- [ ] Task 3: [title](./YYYY-MM-DD-slug.md) — depends on Task 1, 2

## Technical Notes
- Files likely affected: {{ list }}
- Dependencies: {{ list }}
- Risks: {{ list }}

## Open Questions
- [ ] {{ question 1 }}
- [ ] {{ question 2 }}

## Implementation Rules
- Follow this spec strictly — it is the single source of truth for this task
- If you discover something not covered by this spec, STOP and ask the user
- Do NOT expand scope beyond what this spec says
- Refer to "What NOT" section to avoid scope creep
- When the human starts the implementation phase via spec-gate, it transitions this spec to `implementation-in-progress` and moves it to `docs/backlog/in-progress/`
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

---
name: human-review-spec
description: "Walk the human through each spec section one at a time and collect an explicit per-section approval before the spec is validated. Invoked by specify Phase 4.5 (mandatory); use directly when the user asks to human-review, chunk-review, or review spec sections/chunks during specify. Not for implementation or code review — that is the review skill."
effort: medium
---

# Human Review Spec

Per-section human sign-off during specify. A single bulk approval lets one misunderstood section slip through; reviewing each section on its own surfaces misunderstandings where they are cheapest to fix — before the spec is validated and before the Implementation Plan is derived from the sections.

## Sections (review order)

1. `## Why` — is this the real problem, with real impact?
2. `## What` — is the described change what should actually be built?
3. `## What NOT` — are the exclusions intentional and complete?
4. `## Acceptance Criteria` — every criterion testable and correctly marked `[TEST]`/`[MANUAL]`? Any scope creep?
5. `## Examples` — realistic data? Edge case covered? Ask explicitly for missing scenarios.
6. `## Technical Notes` — files, dependencies, risks accurate against the codebase?

Sections produced or validated elsewhere (`## Implementation Plan`, `## Health Check`, `## Spec Quality Checklist`, ...) are out of scope.

## Process

For each section, one at a time, in order:

1. **Present** the section — quote it from the spec verbatim; never paraphrase away detail.
2. **Ask** for an explicit verdict: ✅ Approve / 🔧 Revise (say what) / ❌ Reject (the direction is wrong).
3. **On 🔧** — apply the change to the spec file, re-present the same section, repeat until ✅.
4. **On ❌** — stop the loop; the direction is wrong. Return to specify Phase 1 (Understand) with the feedback, per specify guard rail 4 (re-evaluate on new info).
5. **Advance** to the next section only after an explicit ✅.

One section per message. Never batch sections into a single approval; silence is not approval.

Use the exact per-section and completion formats defined in `.agents/skills/specify/references/output-formats.md` (Phase 4.5).

## Completion

All sections ✅ → emit the completion summary, then hand back to specify for validation (`validate-spec.sh`) and the `## Spec Quality Checklist` self-review. If any section changed during review, re-check cross-section consistency before validation.

## Rules

- Explicit ✅ per section — no approval by silence, no batch approvals.
- Revisions loop on the same section; do not advance until approved.
- If new information contradicts an already-approved section, flag it, re-review that section, and loop back to the earliest affected specify phase (guard rail 4).
- Do not validate the spec or write the Implementation Plan from inside this skill — that is specify's job (Phase 4.5 tail and Phase 5).

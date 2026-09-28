# Phase Output Formats

Each phase produces a structured, scannable response. Use these formats exactly so the user knows where they are in the process and what is expected of them.

---

## Phase 1 — Understand

```markdown
## Phase 1: Understand

**Restatement**
Problem: [1-2 sentences]
Expected change: [1-2 sentences]
Out of scope: [bullet list]

**Doubts / Ambiguities**
- [specific doubt or contradiction]
- [another if any]

**Did I get it right?**
Confirm, correct, or clarify before we proceed.
```

Rules:

- Do NOT proceed to Phase 2 until the user explicitly confirms with a yes/confirm/correct.
- If corrected, restate and ask again.

---

## Phase 2 — Discover

```markdown
## Phase 2: Discover

**Explored**
- [file or doc path] — [what it revealed, 1 sentence]
- [file or doc path] — [what it revealed, 1 sentence]

**Current behavior**
[2-3 sentences on how things work now]

**Touched areas**
- [area / project / namespace]
- [area / project / namespace]

**Likely impact**
[1-2 sentences on what could break or need changing]

**Overlapping specs**
- [spec filename] — [overlap description, or "None found"]

**Impacted behaviors/tests**
- [behavior doc path] — [how it's affected, or "None found"]
```

Rules:

- Keep exploration bounded. See Phase 2 heuristics in SKILL.md for depth limits.
- If nothing relevant is found, say so explicitly — don't fabricate.

---

## Phase 3 — Probe & Assess

```markdown
## Phase 3: Probe & Assess

**Questions** (no cap — continue until ambiguity is resolved and the user confirms understanding; see SKILL.md Phase 3)
1. [Question about why/what/size/risk/gaps]
2. [Question...]
... (add as many as needed — one per open ambiguity; do not truncate at 3)

**Health Assessment**
| Dimension | Score | Notes |
|-----------|-------|-------|
| WHY       | 🟢🟡🔴 | [notes] |
| WHAT      | 🟢🟡🔴 | [notes] |
| SIZE      | 🟢🟡🔴 | [notes] |
| RISK      | 🟢🟡🔴 | [notes] |
| GAPS      | 🟢🟡🔴 | [notes] |

**Blocking**
- [Any 🔴 → list what must close before Phase 4]
- [L-sized → list proposed split]
```

Rules:

- Any 🔴 blocks Phase 4. State the blocker explicitly.
- L-sized work must be split into ≥2 independent specs before any single spec advances.

---

## Phase 3.5 — Grill (mandatory)

```markdown
## Phase 3.5: Grill

**Decision tree branches**
1. [Branch: e.g., "Single file vs. multiple files"]
   - [Question with recommended answer]
2. [Branch]
   - [Question]

**New constraints or decisions**
- [anything that changes the health assessment]

**Updated Health Assessment**
[same table as Phase 3, updated if needed]
```

Rules:

- Always run — mandatory, never optional (per SKILL.md Phase 3.5). Invoke `/grill-me` directly; do not ask permission.
- Use Phase 2 findings to make questions sharp and specific.
- For each question, provide your recommended answer.
- If a question can be answered by exploring the codebase, explore instead of asking.

---

## Phase 4 — Specify

```markdown
## Phase 4: Specify

**Spec file**: `docs/backlog/todo/YYYY-MM-DD-<slug>.md`

**Drafted sections**
- `## Why` — [1-line summary]
- `## What` — [1-line summary]
- [each content section drafted]

Next: Phase 4.5 — Human Review, one section at a time.
```

Rules:

- Draft every content section before review — the `## Implementation Plan` is written later, by Phase 5.
- Cross-section consistency is enforced while authoring (SKILL.md Phase 4 step 3) and re-checked after any Phase 4.5 revision.
- Present the full spec file content or a link to it.

---

## Phase 4.5 — Human Review (mandatory)

Per-section prompt — one section per message, repeated until ✅:

```markdown
## Phase 4.5: Human Review — section [N/6]: `## <Section Name>`

**Progress**: ✅ <approved sections> · ▶ <current section> · ○ <pending sections>

---

> [section content — quoted verbatim from the spec, every line prefixed `>`]

---

**Verdict?**

- ✅ **Approve** — section is correct
- 🔧 **Revise** — tell me what to change
- ❌ **Reject** — the direction is wrong
```

Completion — after the last section is approved:

```markdown
## Phase 4.5: Human Review — complete

All six sections approved ✅

| Section | Verdict |
|---------|---------|
| `## Why` | ✅ |
| `## What` | ✅ |
| `## What NOT` | ✅ |
| `## Acceptance Criteria` | ✅ |
| `## Examples` | ✅ |
| `## Technical Notes` | ✅ |

---

**Validation**
✅ PASSED / ❌ FAILED ([N] issues)

**Quality checklist**
[N]/7 checked — [unchecked item + what's missing in the spec]

---

**Next**: Phase 5 — Implementation Plan, derived from the approved sections.
```

Rules:

- Always run — mandatory, never optional (per SKILL.md Phase 4.5). Invoke `/human-review-spec` directly; do not ask permission.
- One section per message — no batch approvals; silence is not approval.
- Readability: blank line between every block; `---` delimiters around the quoted content so spec text is visually separate from the reviewer's text; progress line in every prompt — ✅ approved · ▶ current · ○ pending (e.g. at section 2: `✅ Why · ▶ What · ○ What NOT · ○ Acceptance Criteria · ○ Examples · ○ Technical Notes`).
- On 🔧 revise: apply the change, re-present the SAME section, loop until ✅.
- On ❌ reject: stop the loop and return to Phase 1 with the feedback (guard rail 4).
- Run `validate-spec.sh` and the Spec Quality Checklist self-review AFTER all sections are approved — that validation is what this phase gates.
- The `## Examples` review absorbs the old examples-confirmation step: ask explicitly for missing scenarios.

---

## Phase 5 — Implementation Plan

```markdown
## Phase 5: Implementation Plan

**Plan summary**
[N] increments, estimated total: [size]
**Spec file updated**: `## Implementation Plan` section written ([N] increments)

**Increments**

### 1. [Title]
- **What**: [files to create/modify/delete]
- **How**: [key design decisions, naming, layout]
- **Validation**: `[command]` → expected: [outcome]
- **Commit**: `[type](scope): ...`
- **Refactoring**: `- [ ]` subagent pass — [targets: smells to watch for / planned extractions]

### 2. [Title]
...

**Risks & guardrails**
- [DI ordering, shared singletons, boundary conversions, similar filenames]

**Reference patterns**
- [analogous code path to mirror]
- [relevant ADR / domain doc / prior spec]
```

Rules:

- Write the increments into the spec's `## Implementation Plan` section BEFORE presenting — the spec file is the handoff artifact, the chat output is only a mirror.
- Each increment must be buildable + testable + committable in one cycle.
- Every increment carries an unchecked `- [ ] **Refactoring**` sub-checkbox (subagent pass, Fowler / Uncle Bob) — implement checks it after the pass; specify never pre-checks it. `validate-spec.sh --require-plan` rejects a plan missing it.
- Respect dependency order (domain before API, adapter before endpoint).
- One line per file/action where possible — keep it scannable.

---

## Phase 6 — Confirm

```markdown
## Phase 6: Confirm

**Spec**: [filename]
**Status**: [current status]

**Decision required**
- ✅ **Go** — approve as written
- 🔄 **Iterate** — refine and re-present
- 🛑 **On-hold** — defer
- 🗑️ **Reject** — won't do

**What happens next**
- Go → transition validates the spec (plan included) and status becomes `ready-to-implement`, then STOP
- Iterate → back to relevant phase
- On-hold → status becomes `on-hold`
- Reject → status becomes `rejected`, spec moves to `rejected/`
```

Rules:

- Present both the spec and the implementation plan together.
- If the Go transition fails validation, fix the issues and re-run — do not bypass it.
- Do NOT implement after approval. Stop.

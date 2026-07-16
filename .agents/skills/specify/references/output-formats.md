# Phase Output Formats

Each phase produces a structured, scannable response. Use these formats exactly so the user knows where they are in the process and what is expected of them.

---

## Phase 1 — Understand

```
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

```
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

```
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

```
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

```
## Phase 4: Specify

**Spec file**: `docs/backlog/todo/YYYY-MM-DD-<slug>.md`

**Validation result**
✅ PASSED / ❌ FAILED ([N] issues)
- [issue list if failed]

**Quality checklist**
[N]/5 checked — [list any unchecked item with what's missing in the spec]

**Examples confirmation**
Please review the examples below and tell me if any scenario is missing:
- [Example 1 name]
- [Example 2 name]
- [Edge case name]
```

Rules:
- Run `validate-spec.sh` before presenting.
- Fix all validation issues before asking for example confirmation.
- Check a quality checklist item ONLY after verifying it against the spec content — never to silence the validator.
- Present the full spec file content or a link to it.

---

## Phase 5 — Implementation Plan

```
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
- Respect dependency order (domain before API, adapter before endpoint).
- One line per file/action where possible — keep it scannable.

---

## Phase 6 — Confirm

```
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

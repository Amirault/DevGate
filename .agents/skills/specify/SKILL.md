---
name: specify
description: "Manual-only skill. Use only when the user explicitly asks to run specify. Guides structured creation and refinement of implementation specs — validates understanding, explores codebase context, probes gaps, produces acceptance criteria with behavioral examples, human-reviews each spec section before validation, and requires explicit approval before implementation can begin."
effort: high
disable-model-invocation: true
---

# Specify

## OUTPUT FORMAT

Read `.agents/skills/specify/references/output-formats.md` before producing any phase output. Use the exact response formats defined there to keep the process predictable.

## GUARD RAILS

1. **Manual trigger only** — never auto-trigger from implementation keywords (build/fix/refactor/implement). This skill MUST only activate when the user explicitly types `/specify` or "run specify".
2. **No implementation** — no production code, tests, or migrations. Only spec files in `docs/backlog/`.
3. **No spec bypass** — if a spec exists in `status: specifying`, continue its refinement flow.
4. **Re-evaluate on new info** — after every user response, check whether new information contradicts earlier conclusions. If it does, loop back to the earliest affected phase, tell the user which phase and why, and redo from there.
5. **Approved criteria are immutable** — once a spec reaches `ready-to-implement`, its Acceptance Criteria and Examples must not be rewritten or deleted in place. If an approved criterion or example must change during implementation, supersede the old text with `~~strikethrough~~` and a pointer to an `## Implementation Log` entry that explains the change and who approved it.
6. **Per-section human approval before validation** — every content section must be explicitly approved by the human (Phase 4.5) before the spec is validated or the Implementation Plan is derived from it.

## TRIGGER ENFORCEMENT

The `description` frontmatter of this skill MUST NOT contain implementation keywords (build, fix, refactor, implement, create, add). If the agent system matches on description alone, the description is the enforcement mechanism.

If the agent framework supports trigger rules, this skill should be configured with:

- `trigger: manual_only`
- `keywords: ["/specify", "run specify"]`

When in doubt, prefer NOT triggering. If the user wants `specify`, they will ask for it by name.

## PROCESS

### Spec Correlation Marker (phase=specify)

Once the spec file is resolved (existing spec: at Pre-check below; new spec: right after `create-spec.sh` in Phase 4), emit the spec correlation marker so the workflow adapter can bind this session to the spec.

Run this **literal no-op shell command** with the active runtime's shell tool (Warp → `run_shell_command`, Claude Code → `Bash`, Hermes → `terminal` or `run_shell_command`). Run it; do not just print it. Run it as its own shell call — the whole command is the marker line alone: no `cd` prefix, no `;`/`&&` chaining, nothing after it (the `:` no-op needs no working directory). Substitute the real `spec_id` = the spec filename without `.md`:

```bash
: SPEC_MARKER v=1 spec_id=2026-06-30-multiquote-limit-5 phase=specify
```

- `spec_id` must be the **resolved literal** (e.g. `2026-06-30-multiquote-limit-5`), never a `$(...)` substitution or variable — each adapter matches the submitted command text, so a placeholder breaks correlation.
- The leading `:` is a shell no-op (exit 0, no repo effect). The selected adapter binds it through that runtime's native session store.
- Emit once per session, as early as possible after the spec file is known.

Format, binding queries, and the subagent-coverage gap are documented in `.agents/skills/specify/references/spec-marker.md`.

### Pre-check — Existing Spec

Avoids duplicate work and respects decisions made on earlier drafts.

**Matching criteria** — a spec "matches" if ANY of these are true:

- Same `project` value AND the problem statement describes the same behavior
- Same files listed in `Technical Notes` AND the change direction is the same (fix vs. feature vs. refactor)
- Same title slug (ignoring date prefix)

If multiple specs match, list them all and ask the user which to continue.

#### Steps

1. Search `docs/backlog/` for matching specs using the criteria above.
2. Identify the target project(s) — ask if ambiguous. Record in `project` frontmatter (comma-separated if multiple).
3. Route by frontmatter status:
   - `specifying` → continue refinement from the relevant phase.
   - `ready-to-implement` → ask whether to reopen or keep as approved.
   - `on-hold` → ask whether to resume.
   - `rejected` → surface the existing spec and its rejection context, ask whether to resurrect (`transition-spec.sh <file> specifying`).
   - No match → Phase 1.

### Phase 1 — Understand

Misunderstood requests produce wrong specs. Align before exploring.

1. Restate what you think the problem is, the expected change, and what's out of scope.
2. Surface doubts, ambiguities, contradictions.
3. Ask: **"Did I get it right?"**
4. If corrected, restate incorporating the correction. Repeat until the user explicitly confirms.
5. Do NOT proceed until confirmed.

### Phase 2 — Discover

Gathering context before asking questions prevents asking things the codebase already answers.

**Relevance heuristics** — use these to bound exploration and avoid getting lost:

- **Entry point**: start from the file/class/method most directly related to the change.
- **Call depth limit**: follow call chains up to 3 levels deep (caller → callee → callee's dependency).
- **Test proximity**: if a behavior is tested, the test file is often the best map of the code.
- **Doc priority**: read `AGENTS.md` first, then domain docs (`docs/domain/`; when the project keeps a machine-checked domain ontology, start there), then ADRs.
- **Stop signals**: stop exploring when you hit infrastructure boilerplate (DI wiring, middleware, base classes) unless the change directly touches it.

#### Steps

1. Explore related code paths (behavior, dependencies, existing tests).
2. Read relevant docs (`AGENTS.md`, domain docs, ADRs).
3. Check `docs/backlog/todo/` and `docs/backlog/in-progress/` for overlapping specs.
4. Check `docs/features/` for related behavior docs — list impacted behaviors/tests if found.
5. Summarize findings: current behavior, touched areas, likely impact.
6. **Verify external references against their live source.** Any external reference that will appear in the spec's Acceptance Criteria or Technical Notes — cloud resource identifiers (subscription / resource group / app names), linked documents (Notion, ADRs, other specs), `origin_spec` pointers, or URLs — must be checked against its actual live source, never assumed from a chat message or colleague guidance. Codebase exploration is not sufficient for external systems. Cite the verification command + output (or the resolved link) inline in the spec next to the reference.
7. **Domain ontology (when the project keeps one): map the change onto it.** In `## Technical Notes`, add a `Concepts, invariants & twins touched` list built from the ontology: touched concepts, invariant IDs, the twin of every touched file the ontology pairs (mirrored, or why not), matching change-impact entries, and every `open_questions` entry the change depends on. An open question the change depends on scores GAPS 🔴 in Phase 3 until the user answers it. If the code contradicts the ontology, say so and plan the ontology fix in the Implementation Plan.

### Phase 3 — Probe & Assess

Targeted questions close gaps code exploration cannot — business intent, edge cases, tradeoffs.

Ask clarifying questions until there is a common understanding, covering:

- **Why**: problem and impact.
- **What**: exact expected behavior and boundaries.
- **Increments**: the goals the need breaks into, each one a pull request.
- **Risk**: edge cases, failures, regressions.
- **Gaps**: missing business or technical constraints.

Do not cap the number of questions — continue until ambiguity is resolved and the user explicitly confirms understanding.

Adapt depth to how unclear and how risky the need is: a one-line change needs one quick confirmation; a new behavior, a contract change or a risky change needs multi-round probing.

Once questions are resolved, produce a health assessment:

- Clarity per dimension: 🟢 / 🟡 / 🔴.
- Risk flags and unknowns.
- Any external reference (cloud IDs, linked docs, `origin_spec`, URLs) not yet verified against its live source per Phase 2 scores GAPS 🔴.

Blocking rules:

- Any 🔴 → close gaps before proceeding to Phase 4.

#### One spec, the whole need

The spec covers the whole need. A big need is never split into several specs: it gets more increments (Phase 5), each with its own goal and its own pull request. Ideas outside the need go to `## Follow-up`, as possible future specs.

### Phase 3.5 — Grill (mandatory)

Invoke the `grilling` skill to stress-test the plan before writing the spec. With codebase context from Phase 2, the grill becomes a precision tool — targeting specific branches of the decision tree surfaced by discovery.

Trigger: run `/grilling` or read `.agents/skills/grilling/SKILL.md`, and follow its instructions.

The grill also challenges the increments: does each one have a goal a reviewer understands without the code, does it ship alone as its own pull request, does any change need a feature flag (RISK 🟡/🔴, or existing consumers would see a behavior change), and what can only be checked after deploy (`## Rollout observation`)?

After grilling completes, update the health assessment with any new constraints or decisions, then proceed to Phase 4.

This phase is never optional; the spec is not considered complete without grilling.

### Phase 4 — Specify

The spec is the single source of truth for implementation — precise enough that a different agent in a fresh session can implement without guessing.

1. **New spec**: scaffold with `create-spec.sh`:

   ```bash
   .agents/skills/specify/scripts/create-spec.sh <slug>
   ```

   **Existing spec**: edit the file directly, keeping metadata consistent.

2. Fill using `.agents/skills/specify/templates/spec-template.md` as reference.
3. Quality requirements:
   - Clear context, scope boundaries, and non-goals.
   - Explicit acceptance criteria with `[TEST]` or `[MANUAL]` markers.
   - Concrete behavioral examples with realistic data — minimum 1 per criterion + 1 edge case.
   - If continuing from a previous spec, set `origin_spec` in frontmatter.
   - Populate the Health Check table with scores from Phase 3 assessment.
   - When the change is visible in production (behavior, traffic, data, cost), fill `## Rollout observation`: what changes in production, candidate success and failure signals, observation window. Otherwise delete the section. Post-deploy checks live there, never in the Implementation Plan.
   - **Cross-section consistency (blocking)**: `## What NOT` items must not appear in `## Technical Notes`, `## Implementation Plan`, or `## Health Check`. Resolve obvious stale references silently; ask only when genuinely ambiguous. Blocks `ready-to-implement`.

### Phase 4.5 — Human Review (mandatory)

Each content section is reviewed with the human, one at a time, BEFORE the spec is validated — a single bulk approval lets one misunderstood section slip through, and per-section review catches misunderstandings before the Implementation Plan is derived from them.

Trigger: run `/human-review-spec` or read `.agents/skills/human-review-spec/SKILL.md`, and follow its instructions.

Sections, in order: `## Why`, `## What`, `## What NOT`, `## Acceptance Criteria`, `## Examples`, `## Technical Notes`. Each requires an explicit ✅ before moving on; a revision loops on the same section; a rejected direction returns to Phase 1 with the feedback (guard rail 4). The `## Examples` review includes asking for missing scenarios — this replaces the old examples-confirmation step.

After every section is approved:

1. Validate structure:

   ```bash
   .agents/skills/specify/scripts/validate-spec.sh docs/backlog/todo/<filename>
   ```

   Fix all issues before continuing.

2. Self-review with the `## Spec Quality Checklist`: verify each spec item against the actual spec content and check it off ONLY when true — if an item doesn't hold, fix the spec first. The plan items (increments, flag, refactoring, rollout) are checked in Phase 5, once the plan exists. Do not check boxes to satisfy the validator; the checklist IS the review. Approval is blocked while any box is unchecked.

This phase is never optional; the spec is not considered validated without per-section human approval.

### Phase 5 — Implementation Plan

Before asking for approval, produce a concrete step-by-step implementation plan. This bridges the gap between spec and execution — a different agent in a fresh session must be able to implement from this plan without re-discovering the approach, and a human must be able to review each increment's pull request against it.

1. **Derive the plan from the spec** — discrete, ordered increments, dependency order respected. Before writing any increment, read `.agents/skills/specify/references/implementation-plan.md`: the planning rules, what each increment must specify (**Goal**/**What**/**How**/**Validation**/**Commit** and the bare `- [ ] **Refactoring**: subagent pass` sub-checkbox), the risks and guardrails to flag, and the existing patterns to reference.
2. **Persist the plan into the spec file**: write the increments into the spec's `## Implementation Plan` section as checkboxes (`- [ ] Increment N: title` with **Goal**/**What**/**How**/**Validation**/**Commit** sub-bullets and the bare Refactoring sub-checkbox). The spec file is the handoff artifact — a plan that only lives in the conversation is lost to the implementing session.
3. **Self-review the plan**: check the plan items of the `## Spec Quality Checklist` against the actual plan — ONLY when true, fix the plan first otherwise. Then run `validate-spec.sh <spec> --require-plan`: it checks what is mechanical (a filled **Goal** per increment, bare Refactoring line, no `--filter` in **Validation**, full harness named, no increment that looks post-merge). The self-review and the Phase 3.5 grill cover the rest.
4. **Present the plan**: mirror the spec content as a numbered list with sub-bullets, each increment's Goal first. Keep it scannable — one line per file/action where possible.

### Phase 6 — Confirm

Explicit approval prevents premature implementation and catches scope drift.

Present the spec **and the implementation plan**, then request decision:

- ✅ **Go** — approve as written.
- 🔄 **Iterate** — refine and re-present.
- 🛑 **On-hold** — defer.
- 🗑️ **Reject** — won't do; keep for the record.

Transitions:

- **Go**: run `.agents/skills/specify/scripts/transition-spec.sh docs/backlog/todo/<filename> ready-to-implement`. The script re-validates the spec (Implementation Plan included) and refuses the transition if validation fails — fix the issues and re-run. `ready-to-implement` is the validation stamp the implement skill trusts without re-checking.
- **Capture session at close** (non-blocking): resolve `<session_source>` from the active runtime (Warp → `warp`, Claude Code → `claude-code`, Hermes → `hermes`), then run `.agents/tools/capture-spec-sessions/capture.sh --spec <slug> --source <session_source>` (path relative to the project root; the wrapper works from any cwd, installs the tool's deps on first use, and stores the bundle in the main checkout so a capture made in a worktree survives its removal). Never omit `--source` or infer it from an existing bundle. Report the one-line `wrote …` summary and any `unbindable marker` warning (a decay signal). If the capture fails, log a warning and continue — the transition is not blocked. Local-only: the `SPEC_MARKER` must be in the selected adapter's local session store; remote sessions are not captured unless that adapter explicitly supports them.
- Then **stop**.
- **On-hold**: run `.agents/skills/specify/scripts/transition-spec.sh docs/backlog/todo/<filename> on-hold`.
- **Reject**: record the rejection reason in the spec (one line under `## Why`), then run `.agents/skills/specify/scripts/transition-spec.sh docs/backlog/todo/<filename> rejected`.

After approval, stop. This skill's scope ends at producing an approved spec with a concrete implementation plan.

## INVOCATION WITHOUT TARGET

When the user invokes `specify` without a concrete change request:

1. List specs in `docs/backlog/todo/`.
2. Ask the user to select one (filename or number).
3. Open the selected spec and continue with refinement/approval flow.
4. If empty, ask whether to create a new spec.

## STATUS LEGEND

- `specifying` — draft or refinement in progress.
- `ready-to-implement` — approved AND validated spec with implementation plan, awaiting work start.
- `on-hold` — deferred.
- `implementation-in-progress` — work started, spec moved to `in-progress/`; increments are delivered one pull request each.
- `implemented` — every increment delivered (last pull request open), awaiting merge and human sign-off.
- `done` — human confirmed DONE, spec moved to `done/`.
- `rejected` — won't do, spec moved to `rejected/`; can be resurrected to `specifying`.

---
name: review
description: "Validate that a spec implementation is ready for human review: quality gates on git changes against the spec (test coverage, code quality, refactoring review, impact/blast radius, architecture, full harness). Scopes: git changes (default), one uncommitted increment (plus a whole-spec completeness check for the last one), or the whole branch; optional auto-fix of blockers. Triggers on review, check, validate, done, ready, or 'is this ready to merge'."
effort: high
---

# Review

**Purpose**: Validate that implementation is **ready for human review** — not that it's done.

```text
specify → deliver-increment(N): implement → refactor → review(N) (you are here) → commit → PR, one PR per increment → human merges every PR, says DONE → done
```

## Scopes

| Scope                        | Reviews                                                             | Spec checks                                                        | Used by                      |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------- |
| `git-changes` (default)      | staged + unstaged diff                                              | whole spec                                                         | a human, no scope given      |
| `increment N`                | the uncommitted diff of increment N (staged + unstaged + untracked) | increment N's criteria only; with `last increment`: the whole spec | review(N) of a delivery loop |
| `branch-diff`                | fork point...HEAD, plus the uncommitted changes                     | whole spec, across the branch's commits                            | a human who asks for it      |
| `full-implementation <spec>` | the spec's affected files                                           | whole spec                                                         | a human who asks for it      |

**When a caller chose the scope** (it passed `increment N`, `branch-diff`, or an explicit `git-changes`), never ask anything: an empty diff returns `VERDICT: FAIL empty diff for scope <scope>`. Only the default human flow may ask (see _If the diff is empty_ below).

**Increment N's criteria** are the Acceptance Criteria that increment N's **Goal**/**What**/**How**/**Validation** name, plus the rows the implement proof matrix maps to increment N in `## Implementation Log`.

**Last increment**: the caller adds `last increment` when increment N is the last of the plan. Every earlier increment is already merged through its own PR, so this review also checks the whole spec (see _Last increment_ below).

## Review Scope — Impact-Aware Git Changes (Default)

Review the **git changes** (staged + unstaged diff), then trace the **blast radius** of those changes outward — without reviewing the entire existing codebase.

The focus is the diff. The awareness is what that diff touches downstream.

Why this scope: reviewing the whole task's code every time is slow and noisy, and reviewing the diff in isolation misses ripple effects. The middle path is to review what changed and verify the change is safe where it lands — callers, contracts, persisted data, and consumers that may not appear in the diff at all.

**Do not ask the user to choose a scope.** Proceed directly with impact-aware git-changes review. Only broaden to a full-implementation review if the user explicitly asks to "review the whole implementation" or names files outside the diff.

**If the diff is empty** (no staged or unstaged changes) and no caller chose the scope, stop and ask whether the user wants a full-implementation review instead — there is nothing to anchor the review on. A caller-chosen scope never asks: it returns FAIL (see _Scopes_).

[references/review-checklist.md](references/review-checklist.md) → _What "stay aware of the overall impact" means_ details the outward trace.

## Review Process

### Phase 1 — LOCATE THE SPEC

Every implementation must have a corresponding specification in `docs/backlog/`.

**A caller passed the spec path** → use it, skip the script and the questions below.

**Use the script to locate the spec:**

```bash
.agents/skills/review/scripts/find-in-progress-spec.sh
```

**Script behavior:**

- Exit 0 + prints spec path → exactly ONE spec found (proceed)
- Exit 1 → ZERO or MULTIPLE specs found (ask user for clarification)

**IMPORTANT**: After locating the spec, verify its status is `implementation-in-progress`. Handle other statuses as follows:

- `status: specifying` or `ready-to-implement` → STOP: "Spec hasn't started implementation yet. Run `/deliver-increment` first."
- `status: on-hold` → STOP: "Spec is on hold. Resume it via `specify` first."
- `status: implemented` → Warn: "Gate already passed for this spec. Re-running for additional validation." (proceed)
- `status: done` → STOP: "Spec is already closed (human said DONE)."

**If script returns multiple specs or spec is unclear:**

1. Check both backlog locations:
   - `docs/backlog/in-progress/` (highest priority — active work)
   - `docs/backlog/todo/` (if needed)
2. List all available specs with their titles/slugs
3. Ask user: "Which spec should I validate against?" with the list
4. Wait for explicit user selection before proceeding

**If user mentions a ticket/issue number:**

- Search `docs/backlog/` for matching filename or content
- Confirm with user before proceeding

### Phase 2 — UNDERSTAND THE SPEC

**Emit the spec correlation marker (phase=review).** Run this literal no-op shell command with the active runtime's shell tool (Warp → `run_shell_command`, Claude Code → `Bash`, Hermes → `terminal` or `run_shell_command`). Run it; do not just print it. Run it as its own shell call — the whole command is the marker line alone: no `cd` prefix, no `;`/`&&` chaining, nothing after it (the `:` no-op needs no working directory). Use `spec_id` = the located spec filename without `.md` (resolved literal — no `$(...)` substitution because adapters match the submitted command text):

```bash
: SPEC_MARKER v=1 spec_id=2026-06-30-add-search-endpoint-2 phase=review
```

The leading `:` is a no-op (exit 0). The selected adapter binds it through that runtime's native session store. Emit once, now (session start) — a review subagent emits its own, even when its caller already emitted one. See `.agents/skills/specify/references/spec-marker.md`.

**Read the trace first**: read the previous review entries in `## Implementation Log` (`review · increment N · iteration K …`) before reviewing — a fresh reviewer must know what earlier iterations fixed, found and left open.

Read the spec completely and extract:

**Core requirements:**

- **Why** — problem statement
- **What** — scope of changes
- **Acceptance Criteria** — success conditions
- **Examples** — concrete behavioral scenarios
- **What NOT** — explicit exclusions
- **Technical Notes** — files affected, dependencies, risks

**Health check:**

- Review the health check table (WHY/WHAT/WHAT IF/GAPS)
- Note any 🟡 or 🔴 flags — these areas need extra scrutiny

### Phase 3 — GATHER IMPLEMENTATION ARTIFACTS

**Default: gather git changes (impact-aware).**

```bash
.agents/skills/review/scripts/gather-artifacts.sh git-changes
```

**Script output (JSON):** `scope`, `staged_files`, `unstaged_files` (arrays of modified files).

Then trace the blast radius: from the diff, identify the changed symbols (methods, types, properties, config keys, contracts) and locate their consumers across the codebase — e.g. `grep` for usages of each changed symbol, and check who depends on any changed contract (API, DTO, cache key, event, persisted shape). The diff is the focus; the consumer search is the awareness layer. Read only what each changed hunk forces you to check — not the whole task's code.

Only use `gather-artifacts.sh full-implementation <spec-file>` when the user explicitly asks to review the whole implementation (diff empty, or they named files outside the diff).

**Caller-chosen scopes:**

```bash
.agents/skills/review/scripts/gather-artifacts.sh increment <N> <spec-file>
.agents/skills/review/scripts/gather-artifacts.sh branch-diff
```

`increment` returns `changed_files` (staged + unstaged + untracked — new files count); `branch-diff` returns `fork_point`, `commits`, `committed_files` and `uncommitted_files`. `"empty": true` → `VERDICT: FAIL empty diff for scope <scope>` (for `increment`, a diff that only touches the spec file is empty).

### Phase 4 — REVIEW CHECKLIST

Validate the implementation against these dimensions:

**Before reviewing, read [references/review-checklist.md](references/review-checklist.md)**: checks, mandatory outputs (`[TEST] Criteria Coverage` table, 🔧 smells, Impact & Blast Radius, 🏗️ Architecture) and severities of Spec Alignment, Test Coverage, Code Quality & Refactoring Review, Impact & Blast Radius and Architecture Step-back. The last three dimensions follow.

#### ✅ Full harness

**Rerun the full harness yourself** — never trust the implementer's claim of green (`.agents/skills/specify/references/harness.md`): stage, then `mise exec -- lefthook run pre-commit --no-tty` from the project directory. It runs exactly what the commit will run (build + analyzers + CSharpier, full tests, coverage, linters, NuGet audit, …).

- [ ] Full harness green on the reviewed scope (`branch-diff`: on the branch)

Red harness → **BLOCKER**, with the failing command's output.

#### ✅ Increment integrity

- [ ] **No dead code** — everything the increment adds serves its **Goal** and is used once the increment is done: the increment ships alone, as its own PR. Code nothing calls (only its tests) → **BLOCKER**. An older spec's `**Wired by**: Increment M` bullet still allows it when increment M exists in the plan.
- [ ] **Preparatory refactoring changes no behavior** — an increment titled `Preparatory refactoring: …` (or committed as `refactor`) with a changed test assertion (an expected value or outcome changed, a test removed) or new public behavior (new endpoint, public member, observable output) → **BLOCKER**.
- [ ] **`**Refactoring**` is checked** for the reviewed increment (`last increment`: every increment).
- [ ] **Shippable alone** — the increment needs no later increment to compile or pass tests (the harness run above proves it), and a public contract change updates its consumers in the same increment.

#### ✅ Completeness

`increment N` scope: only increment N's line applies — its `**Refactoring**` is checked; the increment itself stays unchecked until the caller commits it after a PASS. Skip the other items, unless the caller added `last increment`: then apply them all, counting increment N as checked.

- [ ] Spec status is `implementation-in-progress` (ready to transition to `implemented`)
- [ ] All Implementation Plan increments are checked `[x]` (legacy specs: Breakdown checkboxes), except **post-merge increments**
- [ ] Every increment's `**Refactoring**` sub-checkbox is checked `[x]` — each increment ended with its subagent refactoring pass (outcome recorded in `## Implementation Log`), except post-merge increments
- [ ] Post-merge increments (older specs, planned before `## Rollout observation` existed) are identified and listed in the verdict under `### Post-merge increments (human, after deploy)`. A post-merge increment is one whose covered criteria are all `[MANUAL]` and whose title or **How** says it can only run after this change is merged and deployed (e.g. "post-rollout", "after … is live in production"). It cannot be executed on the branch, so it never blocks PASS; it blocks DONE instead (Phase 6).
- [ ] All "Open Questions" in spec are resolved (checked off)
- [ ] If spec had "Follow-up" tasks, they're noted but NOT implemented (out of scope)
- [ ] Mid-implementation changes are recorded in `## Implementation Log`, not silently edited into Acceptance Criteria/Examples

### Phase 5 — REPORT VERDICT

First grade each finding with [references/pitfalls.md](references/pitfalls.md).

Output a clear verdict:

```markdown
## Review: [PASS | FAIL]

**Spec**: `docs/backlog/in-progress/YYYY-MM-DD-slug.md`
**Scope**: Impact-aware git changes (default) | Increment N | Increment N (last increment) | Branch diff | Full implementation (only if user asked)

### Checklist

- [x/✗] Spec alignment: [details]
- [x/✗] Test coverage: [details]
- [x/✗] Code quality & refactoring: [clean | suggestions found]
- [x/✗] Impact & blast radius: [contained | gaps found]
- [x/✗] Architecture: [CLEAN | WATCH | CONCERN]
- [x/✗] Full harness: [details]
- [x/✗] Increment integrity: [dead code, preparatory refactoring, Refactoring checked]
- [x/✗] Completeness: [details]

### Code Quality & Refactoring

[🔧 suggestions or "No suggestions — code is clean."]

### Impact & Blast Radius

[🔍 changed symbols traced, ripple-effect gaps, contract changes, system/ops follow-ups — or "Impact contained, no downstream gaps."]

### Architecture Assessment

[🏗️ assessment with strengths, risks, and change scenarios]

### Post-merge increments (human, after deploy)

[Each unchecked post-merge increment with its `[MANUAL]` criteria, or "None."]

### Issues Found

[List any blockers or warnings]
```

**Verdict rules:**

- **PASS**: All checklist items green, full harness green, no blockers, impact contained (no unhandled ripple-effect gaps), architecture CLEAN or WATCH — and, in auto-fix mode, **zero edits** in this iteration
- **FIXED** (auto-fix mode only): this iteration edited code, tests or spec content and no blocker remains — the caller launches a fresh review
- **FAIL**: Any blocker left (spec criteria unmet, harness red, scope creep, ripple-effect gap that breaks a consumer, dead code, behavior change in a preparatory refactoring, architecture CONCERN unresolved, spec gap)

**Status line** — the report ends with exactly one line, nothing after it:

```text
VERDICT: PASS
VERDICT: FIXED
VERDICT: FAIL <blockers, one line>
```

**Trace** — before the status line, append one entry to the spec's `## Implementation Log` (the caller passes the iteration number K; otherwise count the previous entries for the same scope + 1):

```text
- <timestamp> — review · increment N · iteration K · <PASS|FIXED|FAIL> · blockers fixed: <list|none> · warnings: <list|none> · recommendations: <list|none>
```

`<timestamp>` is the output of `date -u +%Y-%m-%dT%H:%M:%SZ`, run right before writing the entry — never typed, rounded or estimated.

A `branch-diff` review writes `review · branch-diff · iteration K · …`. The trace entry is not an edit: it never turns a PASS into a FIXED. WARNINGs and RECOMMENDATIONs are never auto-fixed — only traced here, so the caller can list the open ones in the PR.

### Auto-fix mode (only when the caller asks for it)

Fix **BLOCKERs only**, then rerun the full harness:

- stay inside the increment's footprint (the files of its diff and their immediate consumers) and the spec's `## What NOT`;
- **never change behavior to fill a spec gap** — return `VERDICT: FAIL spec gap: <question>` with the gap instead;
- never fix a WARNING or a RECOMMENDATION;
- after fixing, rerun the full harness: red → keep fixing inside the footprint, or FAIL;
- anything edited → `VERDICT: FIXED` (a fresh reviewer verifies it); a blocker left → `VERDICT: FAIL`. Never commit — the caller does.

### Last increment

The caller adds `last increment` when increment N is the last of the plan. Every earlier increment is already merged through its own PR. On top of the Phase 4 checklist for increment N:

- every Acceptance Criterion of the spec is mapped to its tests (the `[TEST] Criteria Coverage` table, whole spec — the earlier increments' tests are on `main`);
- every increment's `**Refactoring**` is checked;
- every Completeness item applies, increment N counted as checked.

A PASS does not transition the spec: the caller moves it to `implemented` before committing the last increment.

### Phase 6 — NEXT STEPS

**CRITICAL**: This gate validates readiness for human sign-off, not completion. Only the human can close a spec.

#### If PASS

`increment N` scope (`last increment` included): stop here — no transition, no capture. The caller checks the increment off, moves the spec to `implemented` after the last one, commits it and opens its PR.

Other scopes:

1. Transition spec to `implemented` (stays in `in-progress/`):

```bash
.agents/skills/specify/scripts/transition-spec.sh docs/backlog/in-progress/<filename> implemented
```

2. **Capture session at close** (non-blocking): resolve `<session_source>` from the active runtime (Warp → `warp`, Claude Code → `claude-code`, Hermes → `hermes`), then run `.agents/tools/capture-spec-sessions/capture.sh --spec <slug> --source <session_source>` (path relative to the project root; the wrapper works from any cwd, installs the tool's deps on first use, and stores the bundle in the main checkout so a capture made in a worktree survives its removal). Never omit `--source` or infer it from an existing bundle. Report the one-line `wrote …` summary and any `unbindable marker` warning (a decay signal). If the capture fails, log a warning and continue. Local-only: the `SPEC_MARKER` must be in the selected adapter's local session store; remote sessions are not captured unless that adapter explicitly supports them.
3. Say:

> "✅ Gate passed. Implementation is ready for your review.
>
> Say **DONE** when you are satisfied to close this spec."

4. On exact **"DONE"** keyword from the user:
   - **Verify the handoff actually landed (precondition — do this FIRST, before transitioning or moving the file).** The spec's deliverable must be confirmed delivered, not merely attempted:
     - For code changes: **every increment PR** (one per increment) must be **merged** into the trunk — confirm each with `gh pr view <number> --json state` reporting `MERGED` (an older spec delivered as a single PR: that PR). A branch that is only pushed, or a PR still open or awaiting review, does NOT count.
     - For infra/deploy specs: the deployment step must be confirmed applied to the target environment.
     - **Rollout observation reported**: when the spec has a `## Rollout observation` section, its report is in `## Implementation Log` (an entry `<timestamp> — Rollout observation report: <signals observed over the window> — <verdict>`). Missing → do NOT transition to `done`: keep status `implemented` and say the observation report is missing.
     - Fallback for older specs without that section: every post-merge increment (see Completeness) is checked `[x]`, together with its `**Refactoring**` sub-checkbox, and its results are recorded in `## Implementation Log`. Otherwise do NOT transition to `done`: keep status `implemented` and list the missing increments.
     - If the handoff did NOT succeed: do **NOT** transition to `done` and do **NOT** move the spec file. Keep status `implemented`, report the failure to the user, and wait for it to be resolved before retrying the DONE transition.
   - Run `.agents/skills/specify/scripts/transition-spec.sh docs/backlog/in-progress/<filename> done`
   - Move spec file from `docs/backlog/in-progress/` → `docs/backlog/done/`
   - **Capture session at close** (non-blocking): resolve `<session_source>` from the active runtime (Warp → `warp`, Claude Code → `claude-code`, Hermes → `hermes`), then run `.agents/tools/capture-spec-sessions/capture.sh --spec <slug> --source <session_source>` (path relative to the project root; the wrapper works from any cwd, installs the tool's deps on first use, and stores the bundle in the main checkout so a capture made in a worktree survives its removal). Never omit `--source` or infer it from an existing bundle. Report the one-line `wrote …` summary and any `unbindable marker` warning. If the capture fails, log a warning and continue. Local-only constraint applies to the selected adapter.
   - **Spec consolidation**: Check frontmatter for `merge_on_completion: true`:
     1. If true: Read `origin_spec` path
     2. Merge this spec's content into the origin spec under a `## Completed Increments` section (append, preserving existing content)
     3. Update origin spec's Follow-up section to mark this increment as `[x]` done
     4. Confirm to user: "Spec merged into origin spec and archived in done/"
   - If `merge_on_completion: false` or not set: Confirm to user: "🏁 Spec closed and moved to done/."
   - **Update `docs/features/`** (only when the project keeps feature docs under `docs/features/` with a `SCHEMA.md`; skip this step otherwise):
     1. Read `docs/features/SCHEMA.md` — this defines the required structure every feature doc must follow
     2. Check the spec's "Technical Notes" section for a reference to a `docs/features/` file and a list of affected behaviors (added by specify during Phase 1)
     3. **If a related feature doc is referenced**:
        - Read the current feature doc
        - Update it to reflect the new implementation:
          - Add new **Behaviors / Cases** entries (following the schema: `### N. [context] → [outcome]`, prose, `**Test**:` block with exact test class + method names)
          - Update or remove existing behavior entries whose tests or logic changed
          - Update the **Implementation Pointers** table with any new or renamed files
          - Update **Limits and Known Constraints** if the new spec removed or added a constraint
          - Preserve all existing content that is still accurate
        - **Schema enforcement**: after editing, verify the doc passes the validation checklist in `SCHEMA.md`:
          - Every behavior has a `**Test**:` block with at least one `→ MethodName` line
          - Every listed test method actually exists in the codebase (grep to confirm)
          - No behavior is listed without a test reference (or explicitly marked `[MANUAL]`)
          - Implementation Pointers table is non-empty and paths are correct
     4. **If no related feature doc is referenced**, check whether the implemented feature is significant enough to document (new endpoint, new business rule, new auth mechanism, new infrastructure pattern, etc.):
        - If yes: create a new `docs/features/<slug>.md` strictly following `docs/features/SCHEMA.md` structure, populating `**Test**:` blocks from the actual implemented tests
        - If no (pure refactoring, tooling, migration with no behavior change): skip and explain why
     5. Confirm to user: list which behaviors were added/updated/removed, which tests were anchored, and confirm schema validation passed

#### If FAIL

A caller chose the scope → return the verdict with its status line; the caller decides. The rest of this section is the human flow.

Determine if the failure is due to **spec incompleteness** (missing requirements, unclear acceptance criteria, scope ambiguity) or **code quality** (tests missing, build broken, scope creep).

**If spec incompleteness**:

> "Gate failed due to spec issues. The spec appears incomplete:
> [List spec gaps]
>
> This looks like a spec problem, not a code problem. Want to transition the spec back to `specifying` to refine it?"

**If code quality issues**:

> "Gate failed. [List code blockers to fix]"

Wait for user to address issues and re-run the gate.

## Pitfalls to Catch

The severity table of recurring issues lives in [references/pitfalls.md](references/pitfalls.md) — read it before Phase 5.

## Integration

- **specify**: Ensures spec exists before implementation
- **test-implementation**: Test quality standards
- **lefthook.yml**: the full harness (reused through `.agents/skills/specify/references/harness.md`, never duplicated)

## Reference

See [references/review-patterns.md](references/review-patterns.md) for example reviews (PASS/WARNING/BLOCKER scenarios).

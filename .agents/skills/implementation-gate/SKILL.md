---
name: implementation-gate
description: "Use when the user wants to validate their work is ready. Runs quality gates on git changes against the spec — checks test coverage, code quality, refactoring review (Fowler/Uncle Bob), impact/blast radius, architecture assessment, and build status. Triggers when user says review, check, validate, done, ready, or asks if something is ready to merge."
effort: high
---

# Implementation Gate

**Purpose**: Validate that implementation is **ready for human review** — not that it's done.

```
specify → implement → implementation-gate (you are here) → human says DONE → done
```

## Review Scope — Impact-Aware Git Changes (Default)

Review the **git changes** (staged + unstaged diff), then trace the **blast radius** of those changes outward — without reviewing the entire existing codebase.

The focus is the diff. The awareness is what that diff touches downstream.

Why this scope: reviewing the whole task's code every time is slow and noisy, and reviewing the diff in isolation misses ripple effects. The middle path is to review what changed and verify the change is safe where it lands — callers, contracts, persisted data, and consumers that may not appear in the diff at all.

**Do not ask the user to choose a scope.** Proceed directly with impact-aware git-changes review. Only broaden to a full-implementation review if the user explicitly asks to "review the whole implementation" or names files outside the diff.

**If the diff is empty** (no staged or unstaged changes), stop and ask whether the user wants a full-implementation review instead — there is nothing to anchor the review on.

### What "stay aware of the overall impact" means

For every changed hunk, look outward from the diff and assess:

- **Downstream callers** — who consumes the changed symbol (method, type, property, config key)? Do those callers still compile and behave correctly? If a caller *should* have changed but is not in the diff, that is a ripple-effect gap.
- **Contracts & interfaces** — public APIs, endpoint shapes, request/response DTOs, domain invariants, cache key formats, event/message schemas, persisted data shapes. A change to any of these is a contract change; flag it and identify who depends on it (tests, other services, external callers).
- **Broader architecture & domain** — even beyond direct callers, does the change introduce a dependency-direction violation, a boundary leak, a missing abstraction, or a domain-correctness problem? (Feeds the Architecture Step-back in Phase 4.)

The goal is not to re-review every existing file. It is to confirm the diff is safe across the system it touches.

## Review Process

### Phase 1 — LOCATE THE SPEC

Every implementation must have a corresponding specification in `docs/backlog/`.

**Use the script to locate the spec:**
```bash
.agents/skills/implementation-gate/scripts/find-in-progress-spec.sh
```

**Script behavior:**
- Exit 0 + prints spec path → exactly ONE spec found (proceed)
- Exit 1 → ZERO or MULTIPLE specs found (ask user for clarification)

**IMPORTANT**: After locating the spec, verify its status is `implementation-in-progress`. Handle other statuses as follows:
- `status: specifying` or `ready-to-implement` → STOP: "Spec hasn't started implementation yet. Run the `implement` skill first."
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

**Emit the spec correlation marker (phase=implementation-gate).** Run this literal no-op shell command via `run_shell_command` (run it, do not just print it), with `spec_id` = the located spec filename without `.md` (resolved literal — no `$(...)` substitution, since Warp logs command text as submitted):

```bash
: SPEC_MARKER v=1 spec_id=2026-06-30-multiquote-limit-5 phase=implementation-gate
```

The leading `:` is a no-op (exit 0). It lands in `commands.command` and creates a `blocks` row with `ai_metadata.conversation_id`, binding this session to the spec for the workflow adapter. Emit once, now (session start). See `specify/references/spec-marker.md`.

Read the spec completely and extract:

**Core requirements:**
- **Why** — problem statement
- **What** — scope of changes
- **Acceptance Criteria** — success conditions
- **Examples** — concrete behavioral scenarios
- **What NOT** — explicit exclusions
- **Technical Notes** — files affected, dependencies, risks

**Health check:**
- Review the health check table (WHY/WHAT/HOW BIG/WHAT IF/GAPS)
- Note any 🟡 or 🔴 flags — these areas need extra scrutiny

### Phase 3 — GATHER IMPLEMENTATION ARTIFACTS

**Default: gather git changes (impact-aware).**
```bash
.agents/skills/implementation-gate/scripts/gather-artifacts.sh git-changes
```

**Script output (JSON):** `scope`, `staged_files`, `unstaged_files` (arrays of modified files).

Then trace the blast radius: from the diff, identify the changed symbols (methods, types, properties, config keys, contracts) and locate their consumers across the codebase — e.g. `grep` for usages of each changed symbol, and check who depends on any changed contract (API, DTO, cache key, event, persisted shape). The diff is the focus; the consumer search is the awareness layer. Read only what each changed hunk forces you to check — not the whole task's code.

Only use `gather-artifacts.sh full-implementation <spec-file>` when the user explicitly asks to review the whole implementation (diff empty, or they named files outside the diff).

### Phase 4 — REVIEW CHECKLIST

Validate the implementation against these dimensions:

#### ✅ Spec Alignment
- [ ] All acceptance criteria are met
- [ ] All examples from the spec are covered (either in code or tests)
- [ ] No features/changes beyond spec scope (check "What NOT" section)
- [ ] Technical notes (files, dependencies, risks) were addressed

#### ✅ Test Coverage
- [ ] Every acceptance criterion marked `[TEST]` has a corresponding automated test
- [ ] Criteria marked `[MANUAL]` are appropriately NOT automated (infrastructure, file moves, UI)
- [ ] Tests follow Given/When/Then structure (see `test-implementation` skill)
- [ ] Tests use real-looking data (not placeholders)
- [ ] Edge cases from spec examples are tested
- [ ] Exclusion cases are tested (what should NOT happen)
- [ ] Tests can fail (verify by checking assertion vs implementation)

**`[TEST]` Criteria Coverage Table (mandatory output):**
For each `[TEST]` criterion in the spec, produce an explicit mapping to the corresponding test method:

```markdown
### [TEST] Criteria Coverage
| Criterion | Test method | Status |
|-----------|-------------|--------|
| Given X, When Y, Then Z | `MyTestClass.Given_X_When_Y_Should_Z` | ✅ Found |
| Given A, When B, Then C | — | ❌ Missing |
```

* Any `❌ Missing` entry is a **BLOCKER** — implementation cannot pass the gate.
* If the spec has ONLY `[MANUAL]` criteria (e.g., pure Terraform/infra task), skip this table and note: "No `[TEST]` criteria — test coverage check N/A."

#### ✅ Code Quality & Refactoring Review

**Floor — user rules compliance:**
- [ ] Code is self-explanatory (no unclear names, no unnecessary comments)
- [ ] No dead code, no unrelated changes
- [ ] Follows KISS/YAGNI (simplest solution, no over-engineering)
- [ ] No regex usage (per user rules)
- [ ] Avoids void functions and side effects (prefer pure functions)
- [ ] Follows hexagonal architecture boundaries (Application → Infrastructure → WebApi)

**Depth — Fowler / Uncle Bob review:**
Detect code smells (Fowler's catalog) and clean code violations (Uncle Bob). Suggest concrete refactorings to make the code cleaner, simpler, more expressive.

**Output for each issue found:**
```
🔧 [smell name] — [file:line]
   Problem: [what's wrong]
   Impact: [why it matters for maintainability]
   Suggestion: [specific refactoring — e.g. Extract Method, Introduce Parameter Object, Rename]
```

**If no issues found:** output "✅ Code quality & refactoring — clean. No suggestions."

**Severity:**
- Minor improvements → **RECOMMENDATION** (non-blocking, included in report)
- Smell indicating likely bug or maintenance trap → **WARNING** (discuss before proceeding)

**Note**: Build-time quality checks (analyzers, CSharpier) are enforced by the build step below.

#### ✅ Impact & Blast Radius

This operationalizes "focus on git changes, stay aware of the overall impact." For each changed hunk, trace outward from the diff and confirm the change is safe where it lands.

- [ ] **Downstream callers identified** — for every changed public/internal symbol (method, type, property, config/section key), locate its consumers (grep usages). Confirm callers still compile and behave correctly, or are also in the diff.
- [ ] **Ripple-effect gaps caught** — if a consumer *should* have changed but is NOT in the diff, flag it (BLOCKER if it breaks compile/behavior, else WARNING).
- [ ] **Contract changes surfaced** — changed APIs, endpoint shapes, DTOs, domain invariants, cache key formats, event schemas, persisted data shapes: each listed with who depends on it (tests, other services, external callers).
- [ ] **Unchanged-but-affected tests considered** — existing tests for callers may still pass but now exercise different behavior; note where coverage is now misleading.
- [ ] **External/system impact** — migrations, cache invalidation, config, deployment, observability: does the change require a follow-up outside code? (Often `[MANUAL]`.)

**Output:**
```markdown
### Impact & Blast Radius
- Changed symbols traced: [list, with consumer counts]
- Ripple-effect gaps: [consumer that should have changed but didn't, or "none"]
- Contract changes: [API/DTO/cache/event/persisted — with dependents, or "none"]
- System/ops follow-ups: [migration/cache/config/deploy, or "none"]
```

**Severity:**
- Consumer that breaks compile/behavior and isn't updated → **BLOCKER**
- Contract change with untested dependents → **WARNING** (discuss)
- Misleading-but-passing test coverage → **RECOMMENDATION**
- No ripple effects found → "✅ Impact — contained. No downstream gaps."

#### ✅ Architecture Step-back

Step back from the code. Evaluate the implementation with an architect's lens — spot structural issues that won't hurt today but will slow the team down tomorrow.

Apply principles from Domain-Driven Design (Eric Evans), Clean Architecture / Hexagonal Architecture (Robert C. Martin, Alistair Cockburn), and SOLID (Robert C. Martin). Assess dependency direction, cohesion, boundary integrity, and coupling. Pick 2–3 realistic "what if" change scenarios to stress-test the design — scenarios must be grounded in known domain direction, not speculative (respect YAGNI).

**Distinguish introduced vs pre-existing issues:**
- Issues **introduced by this change** → flag normally (WATCH or CONCERN)
- Issues **pre-existing** (not caused by this change) → apply Boy Scout Rule: if the fix is small and safe, suggest it as a RECOMMENDATION in the current scope. If the fix is too large, suggest opening a new spec to address it separately. Never block the gate for pre-existing issues the change didn't worsen.

**Output:**
```
🏗️ Architecture: [CLEAN | WATCH | CONCERN]

Strengths:
- [what's well structured]

Risks:
- [risk] → [impact] → [mitigation]

Change scenarios:
- "What if [X]?" → [minimal change | moderate refactor | significant redesign]
```

**Severity:**
- **CLEAN**: Sound architecture, no concerns
- **WATCH**: Minor structural risks — track but don't block
- **CONCERN**: Structural issue that will create significant cruft — discuss with user before proceeding

#### ✅ Build & Validation

**Read the project's AGENTS.md for the correct build command.** PricingApi uses `dotnet build -p:ANALYZERS=ENABLED -p:CSHARPIER=ENABLED` while IpaasManagementStudio uses `dotnet build`. Then run tests with coverage:
```bash
# Build (use the command from the project's AGENTS.md)
<project-specific build command>

# Tests with coverage check (same for both projects)
bash scripts/check-coverage.sh
```

**Checklist:**
- [ ] Build succeeds with no errors or warnings
- [ ] All tests pass
- [ ] Coverage maintains or improves baseline (enforced by `scripts/check-coverage.sh`)
- [ ] CSharpier formatting applied (auto-fixed by build)

**Note**: These are the EXACT same validations that run on `git commit`. If they pass here, pre-commit will succeed.

#### ✅ Completeness
- [ ] Spec status is `implementation-in-progress` (ready to transition to `implemented`)
- [ ] All Implementation Plan increments are checked `[x]` (legacy specs: Breakdown checkboxes)
- [ ] All "Open Questions" in spec are resolved (checked off)
- [ ] If spec had "Follow-up" tasks, they're noted but NOT implemented (out of scope)
- [ ] Mid-implementation changes are recorded in `## Implementation Log`, not silently edited into Acceptance Criteria/Examples

### Phase 5 — REPORT VERDICT

Output a clear verdict:

```markdown
## Implementation Gate: [PASS | FAIL]

**Spec**: `docs/backlog/in-progress/YYYY-MM-DD-slug.md`
**Scope**: Impact-aware git changes (default) | Full implementation (only if user asked)

### Checklist
- [x/✗] Spec alignment: [details]
- [x/✗] Test coverage: [details]
- [x/✗] Code quality & refactoring: [clean | suggestions found]
- [x/✗] Impact & blast radius: [contained | gaps found]
- [x/✗] Architecture: [CLEAN | WATCH | CONCERN]
- [x/✗] Build & tests: [details]
- [x/✗] Completeness: [details]

### Code Quality & Refactoring
[🔧 suggestions or "No suggestions — code is clean."]

### Impact & Blast Radius
[🔍 changed symbols traced, ripple-effect gaps, contract changes, system/ops follow-ups — or "Impact contained, no downstream gaps."]

### Architecture Assessment
[🏗️ assessment with strengths, risks, and change scenarios]

### Issues Found
[List any blockers or warnings]
```

**Verdict rules:**
- **PASS**: All checklist items green, build + tests pass, no blockers, impact contained (no unhandled ripple-effect gaps), architecture CLEAN or WATCH
- **FAIL**: Any blocker found (spec criteria unmet, tests failing, build broken, scope creep, ripple-effect gap that breaks a consumer, architecture CONCERN unresolved)

### Phase 6 — NEXT STEPS

**CRITICAL**: This gate validates readiness for human sign-off, not completion. Only the human can close a spec.

#### If PASS:
1. Transition spec to `implemented` (stays in `in-progress/`):
```bash
.agents/skills/specify/scripts/transition-spec.sh docs/backlog/in-progress/<filename> implemented
```
2. **Capture session at close** (non-blocking): run `npx tsx .agents/tools/capture-spec-sessions/src/cli.ts --spec <slug> --out .agents/tools/capture-spec-sessions/spec-sessions` from the dir containing `docs/backlog/`. Report the one-line `wrote …` summary and any `unbindable marker` warning (a decay signal). If the capture fails, log a warning and continue. Local-only: the `SPEC_MARKER` must be in the local Warp DB; remote (Oz cloud) sessions are not captured.
3. Say:
> "✅ Gate passed. Implementation is ready for your review.
>
> Say **DONE** when you are satisfied to close this spec."

4. On exact **"DONE"** keyword from the user:
   - **Verify the handoff actually landed (precondition — do this FIRST, before transitioning or moving the file).** The spec's deliverable must be confirmed delivered, not merely attempted:
     - For code changes: the final push to the remote (e.g. `git push origin main`) must have **succeeded** — confirm the remote actually contains the commits (e.g. `git status` reports the branch up-to-date with its upstream, or the local `HEAD` matches the remote ref). A push that was only attempted, or that failed and needs a rebase/retry, does NOT count.
     - For infra/deploy specs: the deployment step must be confirmed applied to the target environment.
     - If the handoff did NOT succeed: do **NOT** transition to `done` and do **NOT** move the spec file. Keep status `implemented`, report the failure to the user, and wait for it to be resolved before retrying the DONE transition.
   - Run `.agents/skills/specify/scripts/transition-spec.sh docs/backlog/in-progress/<filename> done`
   - Move spec file from `docs/backlog/in-progress/` → `docs/backlog/done/`
   - **Capture session at close** (non-blocking): run `npx tsx .agents/tools/capture-spec-sessions/src/cli.ts --spec <slug> --out .agents/tools/capture-spec-sessions/spec-sessions` from the dir containing `docs/backlog/`. Report the one-line `wrote …` summary and any `unbindable marker` warning. If the capture fails, log a warning and continue. Local-only constraint applies.
   - **Spec consolidation**: Check frontmatter for `merge_on_completion: true`:
     1. If true: Read `origin_spec` path
     2. Merge this spec's content into the origin spec under a `## Completed Increments` section (append, preserving existing content)
     3. Update origin spec's Follow-up section to mark this increment as `[x]` done
     4. Confirm to user: "Spec merged into origin spec and archived in done/"
   - If `merge_on_completion: false` or not set: Confirm to user: "🏁 Spec closed and moved to done/."
   - **Update `docs/features/`** (mandatory — always do this after closing a spec):
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

#### If FAIL:
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

| Issue | Action |
|-------|--------|
| **Scope creep** (features NOT in spec) | BLOCKER — reference spec "What NOT" section |
| **Missing test coverage** (`[TEST]` criteria without automated tests) | BLOCKER — show criteria coverage table |
| **Unchecked plan increments** (Implementation Plan items left `[ ]`) | BLOCKER — implementation incomplete or progress not recorded in the spec |
| **False negatives** (tests can't fail, placeholder data) | WARNING — point to spec examples |
| **Quality violations** (regex, void functions, over-engineering) | WARNING — cite specific user rule |
| **Build/test failures** | BLOCKER — show error output |
| **Code smells** (long methods, feature envy, primitive obsession) | RECOMMENDATION — suggest specific refactoring |
| **Ripple-effect gap** (downstream consumer should have changed but isn't in the diff) | BLOCKER/WARNING — trace blast radius from the diff |
| **Contract change** (API/DTO/cache key/event/persisted shape) with untested dependents | WARNING — list dependents and verify |
| **Wrong dependency direction** (domain depending on infrastructure) | CONCERN — architecture boundary violation |
| **Hidden coupling** (change in one module forces change in unrelated module) | WATCH/CONCERN — assess future impact |
| **Hardcoded assumptions** that will become tech debt | WATCH — flag with "what if" scenario |

## Integration

- **specify**: Ensures spec exists before implementation
- **test-implementation**: Test quality standards
- **lefthook.yml**: Build/test/coverage validation (reused, not duplicated)

## Reference

See [references/review-patterns.md](references/review-patterns.md) for example reviews (PASS/WARNING/BLOCKER scenarios).

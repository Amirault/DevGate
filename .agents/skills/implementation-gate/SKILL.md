---
name: implementation-gate
description: "Use when the user wants to validate their work is ready. Runs quality gates on code changes against the spec — checks test coverage, code quality, refactoring review (Fowler/Uncle Bob), architecture assessment, and build status. Triggers when user says review, check, validate, done, ready, or asks if something is ready to merge."
---

# Implementation Gate

**Purpose**: Validate that implementation is **ready for human review** — not that it's done.

```
spec-gate → implement → implementation-gate (you are here) → human says DONE → done
```

## Review Scope — ALWAYS Clarify First

Before starting the review, ALWAYS ask:

> "Should I review:
> 1. **Git changes only** (what's staged/modified since last commit)
> 2. **Full implementation** (all code related to the current task, including existing files)
> 
> What's your preference?"

**Default if unclear**: Review git changes only (safer, faster).

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
- `status: on-hold` → STOP: "Spec is on hold. Resume it via `spec-gate` first."
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

**Use the script to gather artifacts:**
```bash
# For git changes only:
.agents/skills/implementation-gate/scripts/gather-artifacts.sh git-changes

# For full implementation:
.agents/skills/implementation-gate/scripts/gather-artifacts.sh full-implementation <spec-file>
```

**Script output (JSON):**
- `scope`: "git-changes" or "full-implementation"
- `staged_files` / `unstaged_files`: arrays of modified files (git-changes)
- `affected_files`: files from spec's "Technical Notes" (full-implementation)
- `test_files`: corresponding test files found (full-implementation)

**Then read the relevant files** based on the script output.

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

**Read the project's AGENTS.md for the correct build command.** Build commands can differ per project, so always use the one documented there. Then run tests with coverage:
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
- [ ] All "Open Questions" in spec are resolved (checked off)
- [ ] If spec had "Follow-up" tasks, they're noted but NOT implemented (out of scope)

### Phase 5 — REPORT VERDICT

Output a clear verdict:

```markdown
## Implementation Gate: [PASS | FAIL]

**Spec**: `docs/backlog/in-progress/YYYY-MM-DD-slug.md`
**Scope**: [Git changes only | Full implementation]

### Checklist
- [x/✗] Spec alignment: [details]
- [x/✗] Test coverage: [details]
- [x/✗] Code quality & refactoring: [clean | suggestions found]
- [x/✗] Architecture: [CLEAN | WATCH | CONCERN]
- [x/✗] Build & tests: [details]
- [x/✗] Completeness: [details]

### Code Quality & Refactoring
[🔧 suggestions or "No suggestions — code is clean."]

### Architecture Assessment
[🏗️ assessment with strengths, risks, and change scenarios]

### Issues Found
[List any blockers or warnings]
```

**Verdict rules:**
- **PASS**: All checklist items green, build + tests pass, no blockers, architecture CLEAN or WATCH
- **FAIL**: Any blocker found (spec criteria unmet, tests failing, build broken, scope creep, architecture CONCERN unresolved)

### Phase 6 — NEXT STEPS

**CRITICAL**: This gate validates readiness for human sign-off, not completion. Only the human can close a spec.

#### If PASS:
1. Transition spec to `implemented` (stays in `in-progress/`):
```bash
.agents/skills/spec-gate/scripts/transition-spec.sh docs/backlog/in-progress/<filename> implemented
```
2. Say:
> "✅ Gate passed. Implementation is ready for your review.
>
> Say **DONE** when you are satisfied to close this spec."

3. On exact **"DONE"** keyword from the user:
   - Run `.agents/skills/spec-gate/scripts/transition-spec.sh docs/backlog/in-progress/<filename> done`
   - Move spec file from `docs/backlog/in-progress/` → `docs/backlog/done/`
   - **Spec consolidation**: Check frontmatter for `merge_on_completion: true`:
     1. If true: Read `origin_spec` path
     2. Merge this spec's content into the origin spec under a `## Completed Increments` section (append, preserving existing content)
     3. Update origin spec's Follow-up section to mark this increment as `[x]` done
     4. Confirm to user: "Spec merged into origin spec and archived in done/"
   - If `merge_on_completion: false` or not set: Confirm to user: "🏁 Spec closed and moved to done/."
   - **Update `docs/features/`** (mandatory — always do this after closing a spec):
     1. Read `docs/features/SCHEMA.md` — this defines the required structure every feature doc must follow
     2. Check the spec's "Technical Notes" section for a reference to a `docs/features/` file and a list of affected behaviors (added by spec-gate during Phase 1)
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
| **False negatives** (tests can't fail, placeholder data) | WARNING — point to spec examples |
| **Quality violations** (regex, void functions, over-engineering) | WARNING — cite specific user rule |
| **Build/test failures** | BLOCKER — show error output |
| **Code smells** (long methods, feature envy, primitive obsession) | RECOMMENDATION — suggest specific refactoring |
| **Wrong dependency direction** (domain depending on infrastructure) | CONCERN — architecture boundary violation |
| **Hidden coupling** (change in one module forces change in unrelated module) | WATCH/CONCERN — assess future impact |
| **Hardcoded assumptions** that will become tech debt | WATCH — flag with "what if" scenario |

## Integration

- **spec-gate**: Ensures spec exists before implementation
- **test-implementation**: Test quality standards
- **lefthook.yml**: Build/test/coverage validation (reused, not duplicated)

## Reference

See [references/review-patterns.md](references/review-patterns.md) for example reviews (PASS/WARNING/BLOCKER scenarios).

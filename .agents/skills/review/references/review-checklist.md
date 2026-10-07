# Review Checklist — Phase 4 Dimensions

Read by `SKILL.md` → Phase 4 before reviewing. Severity summary: [pitfalls.md](pitfalls.md).

## ✅ Spec Alignment

- [ ] All acceptance criteria are met
- [ ] All examples from the spec are covered (either in code or tests)
- [ ] No features/changes beyond spec scope (check "What NOT" section)
- [ ] Technical notes (files, dependencies, risks) were addressed

## ✅ Test Coverage

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

| Criterion               | Test method                           | Status     |
| ----------------------- | ------------------------------------- | ---------- |
| Given X, When Y, Then Z | `MyTestClass.Given_X_When_Y_Should_Z` | ✅ Found   |
| Given A, When B, Then C | —                                     | ❌ Missing |
```

- Any `❌ Missing` entry is a **BLOCKER** — implementation cannot pass the gate.
- If the spec has ONLY `[MANUAL]` criteria (e.g., pure Terraform/infra task), skip this table and note: "No `[TEST]` criteria — test coverage check N/A."

## ✅ Code Quality & Refactoring Review

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

```text
🔧 [smell name] — [file:line]
   Problem: [what's wrong]
   Impact: [why it matters for maintainability]
   Suggestion: [specific refactoring — e.g. Extract Method, Introduce Parameter Object, Rename]
```

**If no issues found:** output "✅ Code quality & refactoring — clean. No suggestions."

**Severity:**

- Minor improvements → **RECOMMENDATION** (non-blocking, included in report)
- Smell indicating likely bug or maintenance trap → **WARNING** (discuss before proceeding)

**Note**: Build-time quality checks (analyzers, CSharpier) are enforced by the Full harness step of Phase 4 in `SKILL.md`.

## What "stay aware of the overall impact" means

For every changed hunk, look outward from the diff and assess:

- **Downstream callers** — who consumes the changed symbol (method, type, property, config key)? Do those callers still compile and behave correctly? If a caller _should_ have changed but is not in the diff, that is a ripple-effect gap.
- **Contracts & interfaces** — public APIs, endpoint shapes, request/response DTOs, domain invariants, cache key formats, event/message schemas, persisted data shapes. A change to any of these is a contract change; flag it and identify who depends on it (tests, other services, external callers).
- **Broader architecture & domain** — even beyond direct callers, does the change introduce a dependency-direction violation, a boundary leak, a missing abstraction, or a domain-correctness problem? (Feeds the Architecture Step-back in Phase 4.)

The goal is not to re-review every existing file. It is to confirm the diff is safe across the system it touches.

## ✅ Impact & Blast Radius

This operationalizes "focus on git changes, stay aware of the overall impact." For each changed hunk, trace outward from the diff and confirm the change is safe where it lands.

- [ ] **Downstream callers identified** — for every changed public/internal symbol (method, type, property, config/section key), locate its consumers (grep usages). Confirm callers still compile and behave correctly, or are also in the diff.
- [ ] **Ripple-effect gaps caught** — if a consumer _should_ have changed but is NOT in the diff, flag it (BLOCKER if it breaks compile/behavior, else WARNING).
- [ ] **Contract changes surfaced** — changed APIs, endpoint shapes, DTOs, domain invariants, cache key formats, event schemas, persisted data shapes: each listed with who depends on it (tests, other services, external callers).
- [ ] **Unchanged-but-affected tests considered** — existing tests for callers may still pass but now exercise different behavior; note where coverage is now misleading.
- [ ] **External/system impact** — migrations, cache invalidation, config, deployment, observability: does the change require a follow-up outside code? (Often `[MANUAL]`.)
- [ ] **Ontology alignment (when the project keeps a domain ontology)** — read it. Every changed file the ontology pairs with a twin has that twin in the diff too, or a known-divergence entry records why not. Every invariant whose behavior the diff changes is updated in the ontology in the same diff and pinned by a test. Every changed target of an `ASK` change-impact entry has the user's approval recorded in `## Implementation Log`.

**Output:**

```markdown
### Impact & Blast Radius

- Changed symbols traced: [list, with consumer counts]
- Ripple-effect gaps: [consumer that should have changed but didn't, or "none"]
- Contract changes: [API/DTO/cache/event/persisted — with dependents, or "none"]
- Ontology alignment: [twins mirrored, invariants updated and tested, or gaps; "N/A" without an ontology]
- System/ops follow-ups: [migration/cache/config/deploy, or "none"]
```

**Severity:**

- Consumer that breaks compile/behavior and isn't updated → **BLOCKER**
- Twin not mirrored without a recorded divergence, or touched invariant without ontology update or test → **BLOCKER**
- Contract change with untested dependents → **WARNING** (discuss)
- Misleading-but-passing test coverage → **RECOMMENDATION**
- No ripple effects found → "✅ Impact — contained. No downstream gaps."

## ✅ Architecture Step-back

Step back from the code. Evaluate the implementation with an architect's lens — spot structural issues that won't hurt today but will slow the team down tomorrow.

Apply principles from Domain-Driven Design (Eric Evans), Clean Architecture / Hexagonal Architecture (Robert C. Martin, Alistair Cockburn), and SOLID (Robert C. Martin). Assess dependency direction, cohesion, boundary integrity, and coupling. Pick 2–3 realistic "what if" change scenarios to stress-test the design — scenarios must be grounded in known domain direction, not speculative (respect YAGNI).

**Distinguish introduced vs pre-existing issues:**

- Issues **introduced by this change** → flag normally (WATCH or CONCERN)
- Issues **pre-existing** (not caused by this change) → apply Boy Scout Rule: if the fix is small and safe, suggest it as a RECOMMENDATION in the current scope. If the fix is too large, suggest opening a new spec to address it separately. Never block the gate for pre-existing issues the change didn't worsen.

**Output:**

```text
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

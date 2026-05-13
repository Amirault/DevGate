---
name: spec-gate
description: "Use for any code change request — features, bugs, refactors, migrations, deletions, improvements. Creates a structured specification with acceptance criteria and examples before any implementation starts. Requires explicit user approval to proceed."
---

#### CRITICAL RULES
1. **Language**: ALL spec content MUST be written in English. This includes: titles, descriptions, acceptance criteria, examples, technical notes, and all other sections.
2. **No implementation before approval**: You MUST NOT write any implementation code until:
   - The spec status is `ready-to-implement` (verified in frontmatter, in `docs/backlog/todo/`)
   - The user explicitly starts implementation via the `implement` skill
3. **Spec files only**: The only files you can create or edit before approval are spec files in `docs/backlog/todo/`.
4. **NEVER bypass the gate**: If a spec exists with `status: specifying`, you MUST go through the approval process. Do NOT assume approval based on document content.

#### TODO SELECTION MODE
**When spec-gate is invoked WITHOUT a specific request** (user says "spec-gate", "validate spec", "work on backlog", etc.):

1. **List all TODO specs**: Run `ls -la docs/backlog/todo/` and display the available specs with their dates
2. **Ask user to choose**: Present the list and ask:
   > "📋 Available TODO specs:
   > [List each spec with date and slug]
   > 
   > Which spec would you like to work on? (Provide the filename or number)"
3. **Load the selected spec**: Read the spec file and check its status
4. **Proceed based on status**:
   - `status: specifying` → Ask for approval (proceed to Phase 5 - CONFIRM)
   - `status: ready-to-implement` → Ask: "This spec is approved. Do you want to start the implementation phase?" On yes: run `transition-spec.sh ... implementation-in-progress`, move spec from `todo/ → in-progress/`, say "Implementation phase started. Run the `implement` skill in a fresh session."
   - `status: on-hold` → Ask if they want to resume
   - Other statuses → Handle per Phase 0 rules

**This mode is triggered when:**
- User runs spec-gate manually without describing a specific change request
- User asks to "validate a spec", "check backlog", "work on TODO", etc.
- No implementation request context is provided

#### EXPLORATORY MODE (SESSION BYPASS)
**When the user asks to implement/build/fix/refactor something, FIRST ask:**
> "Is this exploratory work (research/understanding, won't be committed), or should I create a spec?
> - 🔬 **Exploratory** — Skip spec-gate, proceed directly (work won't be committed)
> - 📋 **Spec-gated** — Follow full spec process (default for production work)"

**If user chooses Exploratory:**
- Skip ALL phases (DISCOVER, PROBE, CLASSIFY, SPECIFY, CONFIRM)
- Proceed directly to implementation without creating spec files
- Remind the user once: "⚠️ Exploratory mode: changes won't be committed. Use for research/understanding only."
- Work freely without spec approval requirements
- This mode is valid **only for the current session** — does NOT persist across conversations

**If user chooses Spec-gated (or doesn't respond):**
- Proceed with the normal spec-gate process below (this is the default)

**IMPORTANT:** The exploratory bypass is ONLY for intentional, temporary research work. All production changes MUST go through the spec-gate process.

#### PROCESS

##### Phase 0 — CHECK FOR EXISTING SPEC
**When user asks to implement something:**

1. **Search `docs/backlog/` for matching specs**
2. **Check the spec status in frontmatter** (ONLY source of truth):
   - `status: ready-to-implement` in `docs/backlog/todo/` → **Spec approved, awaiting implementation start**. Ask: "This spec is ready. Do you want to start the implementation phase?" On yes: run `transition-spec.sh ... implementation-in-progress`, move spec from `todo/ → in-progress/`, then say "Implementation phase started. Run the `implement` skill in a fresh session."
   - `status: specifying` in `docs/backlog/todo/` → **Ask for approval**, present spec and request "Go"
   - `status: on-hold` → **Ask user** if they want to resume or keep on hold
   - `status: implementation-in-progress` in `docs/backlog/in-progress/` → **Inform user** implementation is already underway
   - `status: implemented` in `docs/backlog/in-progress/` → **Inform user** implementation-gate has passed, awaiting human "DONE" sign-off
   - `status: done` in `docs/backlog/done/` → **Inform user** spec is fully closed
   - `status: rejected` in `docs/backlog/rejected/` → **Inform user** spec was previously rejected (show `rejected_reason`), ask if they want to reconsider
   - No spec found → **Proceed to Phase 1** (create new spec)

**Note**: A `ready-to-implement` spec can be transitioned back to `specifying` if implementation reveals the spec is incomplete. This is a valid workflow when spec gaps are discovered.

##### Phase 1 — DISCOVER
When the user describes what they want, do NOT ask questions yet. First, go learn.

**1. Explore the codebase**
* Search for files, modules, and functions related to the request
* Read the relevant source code to understand current implementation
* Check for existing tests, patterns, and conventions in that area
* Look at recent git history on related files (who touched it, why, recent changes)
* **Determine which project this spec targets** (ProjectA or ProjectB) based on the files involved

**2. Check existing documentation**
* Read `AGENTS.md`, `CLAUDE.md`, `README.md` for project context
* **Search `docs/backlog/todo/` and `docs/backlog/in-progress/` for existing specs that match the current request** (already done in Phase 0)
  - If a matching spec exists (same feature/fix/change), UPDATE it instead of creating a new one
  - If the existing spec is in `specifying` status, refine it based on new information
  - If the existing spec is in `on-hold`, ask the user if they want to resume it
  - If the spec is in `in-progress/`, ask user if they want to continue or start fresh
  - Only create a new spec if no match exists
* **Search `docs/features/` for existing feature docs related to the request**
  - Read `docs/features/SCHEMA.md` first — this defines the mandatory structure all feature docs follow (Behaviors with `**Test**:` blocks, Implementation Pointers, Limits)
  - Run `ls docs/features/` to see what is documented
  - Read any feature doc whose name or topic is related to the request (keyword match on slug)
  - When reading a feature doc, focus on the **Behaviors / Cases** section — each behavior is anchored to one or more test method names. These are the tests that verify the current behavior and may need updating if the spec changes that behavior.
  - Look for: existing behavior that the new spec would change or extend, opposite/contradictory behaviors, shared data models, adjacent flows
  - If a related feature doc is found:
    - Explicitly note which behaviors (and their anchored tests) are affected by the new spec
    - Flag whether the new spec **updates**, **extends**, **contradicts**, or **replaces** the documented behavior
    - Note which existing test methods will need updating or removal
    - After approval, the spec's "Technical Notes" section must reference the related feature doc AND list which behaviors are affected, so the gate can update them precisely
  - If no related feature doc exists: note it so a new one can be created after implementation (following `docs/features/SCHEMA.md`)
* Check for inline documentation, comments, ADRs if they exist

**3. Search the web if needed**
* If the request involves an external API, library, or domain concept you're unsure about — search for it
* If there are best practices or known pitfalls for this type of change — look them up

**4. Assess apparent size and complexity**
* Based on what you found: how many files are involved? How interconnected is the code? Are there tests?
* Form an initial size estimate: XS / S / M / L

**5. Summarize your understanding**
* Before asking any question, tell the user: "Here's what I found and what I understand so far about [topic]:"
* List: files involved, current behavior, dependencies, potential impact areas
* This lets the user correct misunderstandings BEFORE the probing phase

Then move to Phase 2.

##### Phase 2 — PROBE
Ask questions across 5 dimensions. Max 3 questions per round, wait for answers, then follow up if needed.

| Dimension | What to ask |
|-----------|-------------|
| **WHY** | What's the real problem? Who is affected? What happens if we don't do this? |
| **WHAT** | What exactly changes? What's the boundary? Can you describe it in one sentence? |
| **SIZE** | How many files/modules does this touch? Can it be done in < 2 hours? Should it be split? |
|| **RISK** | Edge cases? Error states? What could break? What are the side effects? |
| **GAPS** | Business rules unclear? Technical constraints unknown? Dependencies? Need to ask someone? |

**Adapt intensity to apparent size:**
* XS: 1 quick confirmation round ("Just to confirm: X affects only Y, no side effects. Correct?")
* S: 2–3 targeted questions, then spec
* M: full multi-round probe
* L: full probe + mandatory split before proceeding

**Size definitions:** XS < 5 min · S < 15 min · M < 30 min · L > 1h

**ESCALATION RULE:** If the request seems small but you detect hidden complexity (touches many files, unclear scope, cross-cutting concerns), escalate. Say: "This might be bigger than it looks. Let me ask a few more questions before we start."

**SIMPLICITY RULE:** Always present the simplest approach that solves the problem (KISS/YAGNI). Do NOT suggest complex solutions upfront — the user will specify when more complexity is actually needed.

##### Phase 3 — CLASSIFY
After probing, output a health check:
* **Size estimate**: XS / S / M / L
* **Clarity score per dimension**: 🟢 (clear) / 🟡 (some gaps) / 🔴 (blocked)
* **Risk flags** (if any): side effects, missing knowledge, dependencies

**BLOCKING RULE:** If ANY dimension is 🔴, do NOT proceed to spec. Ask for more info or suggest the user asks someone else.

**BREAKDOWN RULE:** Every spec MUST include a breakdown, regardless of size. Even XS/S tasks benefit from explicit steps for implementation tracking.

**SPLITTING RULE:**
* If estimated size is M (< 30 min but touches many areas): **suggest splitting** into XS/S tasks. User can override with "Keep as one."
* If estimated size is L (> 1h): **mandatory split** — refuse to proceed until broken down into M/S/XS tasks.

**When splitting:**
1. Break the work into independent XS/S tasks, each < 30 min
2. Each sub-task gets its own spec file in `docs/backlog/todo/` — not just bullet points in one spec, but separate files:
```
docs/backlog/todo/2026-03-12-fix-nullable-auth-module.md
docs/backlog/todo/2026-03-12-fix-nullable-user-module.md
docs/backlog/todo/2026-03-12-fix-nullable-add-tests.md
```
3. Define the sequence — which task goes first, which depends on which
4. Each spec is self-contained — someone (or the agent) should be able to pick up any single spec and understand what to do without reading the others
5. Run `.agents/skills/spec-gate/scripts/create-spec.sh <slug>` for each sub-task to scaffold all spec files
6. Ask the user: "I've split this into N tasks (~time each). Want to start with #1, or adjust the split first?"

##### Phase 4 — SPECIFY
Create or update the spec at `docs/backlog/todo/YYYY-MM-DD-<slug>.md` (or update existing if found in Phase 1). Use the template at `.agents/skills/spec-gate/templates/spec-template.md`.

**Examples are mandatory (Example Mapping style — behavioral scenarios, not code).** For every spec:
1. **Spot where examples are needed** — look for:
    * Business rules with conditions ("if X then Y") → show a concrete case for each branch
    * Data transformations → show before/after with real-looking data
    * Edge cases found during probing → show what happens at the boundary
    * Error states → show what happens when things go wrong
    * Nullable/optional fields → show behavior with and without the value
    * Multi-step flows → walk through a full scenario with concrete values
2. **Write examples with real-looking data**, not placeholders:
    * ❌ Bad: "Given a user, When they log in, Then it works"
    * ✅ Good: "Given user `alex.smith@example.com` with role `underwriter` and expired session, When they submit login with valid credentials, Then a new session is created and they're redirected to `/dashboard`"
3. **Minimum**: at least 1 example per acceptance criterion + 1 edge case example
4. **Ask the user to confirm examples**: "Here are the examples I've identified. Do they match your understanding? Any scenario I'm missing?"
5. **If creating a new spec**: Run `.agents/skills/spec-gate/scripts/create-spec.sh <slug>` to scaffold the spec file from the template with the correct date prefix and frontmatter.
6. **If updating an existing spec**: Edit the existing file directly, preserving its metadata (created_at, status).
7. Fill all sections based on the discovery and probing conversation. **Write everything in English.**
8. **Mark testable criteria**: In the Acceptance Criteria section, explicitly identify which criteria should be implemented as automated tests by adding a `[TEST]` marker:
   ```markdown
   ## Acceptance Criteria
   - [TEST] Given user with role "underwriter", When they access /dashboard, Then they see the underwriting panel
   - [TEST] Given user with role "admin", When they access /dashboard, Then they see the admin panel
   - [MANUAL] The UI displays correctly on mobile devices (manual validation)
   ```
   **`[TEST]` vs `[MANUAL]` guidance:**
   * `[TEST]` — Criterion MUST be implemented as an automated test in the codebase. Use for: business logic validation, data transformations, API behavior, domain rules.
   * `[MANUAL]` — Criterion requires manual validation and is NOT expected as an automated test. Use for: file moves/renames, infrastructure verification (Terraform apply), UI checks, deployment state.
   * Some tasks (pure infrastructure, file reorganization) may have ONLY `[MANUAL]` criteria — this is valid.
   * **The implementation-gate will verify that every `[TEST]` criterion has a corresponding automated test.** Missing tests are blockers.
9. Run `.agents/skills/spec-gate/scripts/validate-spec.sh docs/backlog/todo/<filename>` to verify structural completeness. If validation fails, fix the missing sections before presenting to the user.

##### Phase 5 — CONFIRM
Present the spec to the user. Ask explicitly:
> "Does this spec look right? Your options:
> - ✅ **Go** — I'll start implementing based on this spec
> - 🔄 **Iterate** — Let's refine something
> - 🛑 **On-hold** — Too big or unclear, we'll come back later
> - 🚫 **Reject** — Discard this spec (provide a reason)"

* On "Go":
  1. **Auto-detect spec series**: If the spec has a Follow-up section with sibling specs, automatically set `merge_on_completion: true` and `origin_spec: <path to first spec in the series>` in frontmatter. Inform user: "This spec is part of a series — it will be merged into the origin spec when done."
  2. Run `.agents/skills/spec-gate/scripts/transition-spec.sh docs/backlog/todo/<filename> ready-to-implement`
  3. Spec stays in `docs/backlog/todo/` — it does NOT move yet. The move to `in-progress/` happens when the `implement` skill starts.
  4. **STOP and say**: "✅ Spec approved. Start a new session and run the `implement` skill to begin implementation."
  5. **DO NOT proceed with implementation** — wait for user to start a new session with fresh context
* On "Iterate": refine and re-present
* On "On-hold": run `.agents/skills/spec-gate/scripts/transition-spec.sh docs/backlog/todo/<filename> on-hold`
* On "Reject":
  1. Ask the user for a short rejection reason (mandatory)
  2. Add `rejected_at: YYYY-MM-DD` and `rejected_reason: <reason>` fields to the spec frontmatter
  3. Run `.agents/skills/spec-gate/scripts/transition-spec.sh docs/backlog/todo/<filename> rejected`
  4. Move spec file from `docs/backlog/todo/` → `docs/backlog/rejected/`
  5. Say: "🚫 Spec rejected and archived in `docs/backlog/rejected/`."

**Status legend:**
* `specifying` — spec is actively being written and refined (in `todo/`)
* `ready-to-implement` — user said "Go", waiting for implementation to start (in `todo/`)
* `on-hold` — deferred, will revisit later (in `todo/`)
* `implementation-in-progress` — implement skill is actively working on it (in `in-progress/`)
* `implemented` — implementation-gate passed, awaiting human "DONE" sign-off (in `in-progress/`)
* `done` — human said DONE, fully closed (in `done/`)
* `rejected` — explicitly discarded; archived in `docs/backlog/rejected/` with mandatory `rejected_reason`

#### POST-APPROVAL
**CRITICAL**: After spec approval, STOP. Do NOT start implementing.
- The user prefers to start implementation in a fresh session with clean context
- Once approved, the spec file itself contains all implementation rules (see "Implementation Rules" section in the template)
- In the new session, the agent will follow the spec — not this skill

#!/bin/bash
# validate-spec.sh — Validates a spec file has all required sections filled
# Usage: ./validate-spec.sh <path-to-spec-file> [--require-plan]
# --require-plan: also validates the Implementation Plan and Open Questions sections.
#                 Used by transition-spec.sh at approval (specifying -> ready-to-implement),
#                 so `ready-to-implement` is a trustworthy validation stamp for the implement skill.
# Exit 0 = valid, Exit 1 = invalid (with details on stderr)

SPEC_FILE="$1"
REQUIRE_PLAN=false
if [ "$2" = "--require-plan" ]; then
    REQUIRE_PLAN=true
fi
ERRORS=()

if [ -z "$SPEC_FILE" ] || [ ! -f "$SPEC_FILE" ]; then
    echo "Error: Spec file not found: $SPEC_FILE" >&2
    exit 1
fi

CONTENT=$(cat "$SPEC_FILE")
# Extract section content between a level-2 heading and the next level-2 heading.
# Matches the exact heading or the heading with a parenthetical suffix,
# e.g. "What NOT" matches both "## What NOT" and "## What NOT (explicit exclusions)".
extract_section() {
    local heading="$1"
    echo "$CONTENT" | awk -v heading="$heading" '
        $0 == ("## " heading) || index($0, "## " heading " (") == 1 { in_section=1; next }
        in_section && /^## / { exit }
        in_section { print }
    '
}

# Check required sections exist and are not empty/placeholder
check_section() {
    local section="$1"
    local body
    body="$(extract_section "$section")"
    if [ -z "$body" ]; then
        ERRORS+=("Missing or empty section: $section")
        return
    fi

    local normalized
    normalized="$(echo "$body" | tr -d '[:space:]')"
    if [ -z "$normalized" ]; then
        ERRORS+=("Section '$section' is empty")
    fi
}

# Check unresolved placeholders globally
if echo "$CONTENT" | grep -q '{{[^}]*}}'; then
    ERRORS+=("Unresolved placeholders found ({{ ... }})")
fi

# Check frontmatter status exists
if ! echo "$CONTENT" | head -20 | grep -q "^status:"; then
    ERRORS+=("Missing frontmatter: status field")
fi

# Check frontmatter size exists
if ! echo "$CONTENT" | head -20 | grep -q "^size:"; then
    ERRORS+=("Missing frontmatter: size field")
fi

# Validate origin_spec points to existing file if set
ORIGIN_SPEC=$(echo "$CONTENT" | grep -m1 "^origin_spec:" | sed 's/^origin_spec:[[:space:]]*//')
if [ -n "$ORIGIN_SPEC" ]; then
    BACKLOG_ROOT=$(dirname "$(dirname "$SPEC_FILE")")
    FOUND=false
    for subdir in todo in-progress done rejected; do
        if [ -f "$BACKLOG_ROOT/$subdir/$ORIGIN_SPEC" ]; then
            FOUND=true
            break
        fi
    done
    if [ "$FOUND" != "true" ]; then
        ERRORS+=("origin_spec '$ORIGIN_SPEC' does not match any existing spec in backlog")
    fi
fi

# Check required sections
check_section "Why"
check_section "What"
check_section "Acceptance Criteria"
check_section "What NOT"
check_section "Implementation Rules"
check_section "Examples"
check_section "Health Check"

# Parse Acceptance Criteria section
ACCEPTANCE_SECTION="$(extract_section "Acceptance Criteria")"
ACCEPTANCE_LINES="$(echo "$ACCEPTANCE_SECTION" | grep -E '^[[:space:]]*-[[:space:]]')"
CRITERIA_COUNT=$(echo "$ACCEPTANCE_LINES" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')

if [ "$CRITERIA_COUNT" -eq 0 ]; then
    ERRORS+=("Acceptance Criteria: need at least one bullet criterion")
fi

# Enforce [TEST]/[MANUAL] marker on each criterion line
if [ -n "$ACCEPTANCE_LINES" ]; then
    INVALID_CRITERIA="$(echo "$ACCEPTANCE_LINES" | grep -Ev '^[[:space:]]*-[[:space:]]*\[(TEST|MANUAL)\][[:space:]]')"
    if [ -n "$INVALID_CRITERIA" ]; then
        ERRORS+=("Acceptance Criteria: each bullet must start with [TEST] or [MANUAL]")
    fi
fi

# Ensure at least one Given/When/Then criterion exists
if ! echo "$ACCEPTANCE_LINES" | grep -qi "Given.*When.*Then"; then
    ERRORS+=("Acceptance Criteria: need at least one Given/When/Then criterion")
fi

# Parse Examples section
EXAMPLES_SECTION="$(extract_section "Examples")"
EXAMPLE_COUNT=$(echo "$EXAMPLES_SECTION" | grep -c '^### Example')
EXPECTED_MIN_EXAMPLES=$((CRITERIA_COUNT + 1))

if [ "$EXAMPLE_COUNT" -eq 0 ]; then
    ERRORS+=("Examples: need at least one '### Example'")
elif [ "$EXAMPLE_COUNT" -lt "$EXPECTED_MIN_EXAMPLES" ]; then
    ERRORS+=("Examples: need at least one example per acceptance criterion plus one edge case")
fi

# Require explicit edge-case example heading
if ! echo "$EXAMPLES_SECTION" | grep -Eiq '^### Example.*edge case'; then
    ERRORS+=("Examples: need at least one explicit edge case example heading")
fi

# Check examples have complete Context/Action/Result entries
CAR_COUNT=$(echo "$EXAMPLES_SECTION" | grep -c '\*\*Context\*\*:\|\*\*Action\*\*:\|\*\*Result\*\*:')
EXPECTED_CAR=$((EXAMPLE_COUNT * 3))
if [ "$CAR_COUNT" -lt "$EXPECTED_CAR" ]; then
    ERRORS+=("Examples: each example needs Context, Action, and Result")
fi

# Check no red only in Health Check section (blocking)
HEALTH_SECTION="$(extract_section "Health Check")"
if echo "$HEALTH_SECTION" | grep -q "🔴"; then
    ERRORS+=("BLOCKED: Health check has 🔴 dimensions — resolve before approving")
fi

# Approval-time checks: Implementation Plan filled, Open Questions resolved
if [ "$REQUIRE_PLAN" = "true" ]; then
    PLAN_SECTION="$(extract_section "Implementation Plan")"
    INCREMENT_COUNT=$(echo "$PLAN_SECTION" | grep -c '^- \[')
    if [ "$INCREMENT_COUNT" -eq 0 ]; then
        ERRORS+=("Implementation Plan: need at least one '- [ ] Increment' checkbox item")
    else
        WHAT_COUNT=$(echo "$PLAN_SECTION" | grep -c '\*\*What\*\*:[[:space:]]*[^[:space:]]')
        VALIDATION_COUNT=$(echo "$PLAN_SECTION" | grep -c '\*\*Validation\*\*:[[:space:]]*[^[:space:]]')
        if [ "$WHAT_COUNT" -lt "$INCREMENT_COUNT" ]; then
            ERRORS+=("Implementation Plan: each increment needs a filled **What** line")
        fi
        if [ "$VALIDATION_COUNT" -lt "$INCREMENT_COUNT" ]; then
            ERRORS+=("Implementation Plan: each increment needs a filled **Validation** line")
        fi
    fi

    UNCHECKED_QUESTIONS=$(extract_section "Open Questions" | grep -c '^- \[ \]')
    if [ "$UNCHECKED_QUESTIONS" -gt 0 ]; then
        ERRORS+=("Open Questions: $UNCHECKED_QUESTIONS unresolved question(s) — resolve before approval")
    fi

    QUALITY_SECTION="$(extract_section "Spec Quality Checklist")"
    QUALITY_ITEMS=$(echo "$QUALITY_SECTION" | grep -c '^- \[')
    QUALITY_UNCHECKED=$(echo "$QUALITY_SECTION" | grep -c '^- \[ \]')
    if [ "$QUALITY_ITEMS" -eq 0 ]; then
        ERRORS+=("Spec Quality Checklist: section missing or empty — add the author self-review checklist")
    elif [ "$QUALITY_UNCHECKED" -gt 0 ]; then
        ERRORS+=("Spec Quality Checklist: $QUALITY_UNCHECKED item(s) unchecked — verify each against the spec before approval")
    fi
fi

# Report results
if [ ${#ERRORS[@]} -eq 0 ]; then
    echo "✅ Spec validation PASSED"
    exit 0
else
    echo "❌ Spec validation FAILED (${#ERRORS[@]} issues):" >&2
    for err in "${ERRORS[@]}"; do
        echo "  - $err" >&2
    done
    exit 1
fi

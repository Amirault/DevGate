#!/bin/bash
# validate-spec.sh — Validates a spec file has all required sections filled
# Usage: ./validate-spec.sh <path-to-spec-file>
# Exit 0 = valid, Exit 1 = invalid (with details on stderr)

SPEC_FILE="$1"
ERRORS=()

if [ -z "$SPEC_FILE" ] || [ ! -f "$SPEC_FILE" ]; then
    echo "Error: Spec file not found: $SPEC_FILE" >&2
    exit 1
fi

CONTENT=$(cat "$SPEC_FILE")

# Check required sections exist and are not empty/placeholder
check_section() {
    local section="$1"
    local pattern="$2"
    if ! echo "$CONTENT" | grep -q "$pattern"; then
        ERRORS+=("Missing section: $section")
    else
        # Check if section content is just placeholder
        local after
        after=$(echo "$CONTENT" | sed -n "/$pattern/,/^## /p" | tail -n +2 | sed '$d' | tr -d '[:space:]')
        if [ -z "$after" ] || echo "$after" | grep -q '{{'; then
            ERRORS+=("Section '$section' is empty or still has placeholders")
        fi
    fi
}

# Check frontmatter status exists
if ! echo "$CONTENT" | head -20 | grep -q "^status:"; then
    ERRORS+=("Missing frontmatter: status field")
fi

# Check frontmatter size exists
if ! echo "$CONTENT" | head -20 | grep -q "^size:"; then
    ERRORS+=("Missing frontmatter: size field")
fi

# Check required sections
check_section "Why" "^## Why"
check_section "What" "^## What$"
check_section "Acceptance Criteria" "^## Acceptance Criteria"
check_section "What NOT" "^## What NOT"
check_section "Implementation Rules" "^## Implementation Rules"

# Check at least one acceptance criterion in Given/When/Then format
if ! echo "$CONTENT" | grep -qi "Given.*When.*Then"; then
    ERRORS+=("Acceptance Criteria: need at least one Given/When/Then")
fi

# Check examples section exists and has at least one concrete example
if ! echo "$CONTENT" | grep -q "^## Examples"; then
    ERRORS+=("Missing section: Examples")
elif ! echo "$CONTENT" | grep -q "^### Example"; then
    ERRORS+=("Examples section exists but has no concrete examples (need at least one '### Example')")
fi

# Check examples have real content (Context/Action/Result pattern)
EXAMPLE_COUNT=$(echo "$CONTENT" | grep -c "^### Example")
CAR_COUNT=$(echo "$CONTENT" | grep -c "\*\*Context\*\*:\|\*\*Action\*\*:\|\*\*Result\*\*:")
EXPECTED_CAR=$((EXAMPLE_COUNT * 3))
if [ "$CAR_COUNT" -lt "$EXPECTED_CAR" ]; then
    ERRORS+=("Some examples are incomplete — each needs Context, Action, and Result")
fi

# Check health check table exists
if ! echo "$CONTENT" | grep -q "^## Health Check"; then
    ERRORS+=("Missing section: Health Check")
fi

# Check no red in health check (blocking)
if echo "$CONTENT" | grep -q "🔴"; then
    ERRORS+=("BLOCKED: Health check has 🔴 dimensions — resolve before approving")
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

#!/bin/bash
# gather-artifacts.sh — Collects implementation artifacts for review
# Usage: ./gather-artifacts.sh [git-changes|full-implementation] [spec-file]
# Output: JSON with file paths and git info

SCOPE="$1"
SPEC_FILE="$2"

if [ -z "$SCOPE" ]; then
    echo "Usage: gather-artifacts.sh [git-changes|full-implementation] [spec-file]" >&2
    exit 1
fi

# Helper: extract "Files likely affected" from spec Technical Notes section
extract_affected_files() {
    local spec="$1"
    if [ ! -f "$spec" ]; then
        echo "[]"
        return
    fi
    
    # More robust: look for "Files" + "affected" anywhere in the line (handles ### or **)
    # Then extract bullet points until next section heading
    sed -n '/[Ff]iles.*affected/,/^##\|^###\|^\*\*/p' "$spec" | \
        grep -E '^\s*[-*]' | \
        sed 's/^[[:space:]]*[-*][[:space:]]*//' | \
        sed 's/[[:space:]]*[—-].*$//' | \
        sed 's/[[:space:]]*(.*).*$//' | \
        grep -v '^$' | \
        jq -R -s 'split("\n") | map(select(length > 0))'
}

case "$SCOPE" in
    "git-changes")
        # Gather git diff information
        STAGED=$(git --no-pager diff --cached --name-only | jq -R -s 'split("\n") | map(select(length > 0))')
        UNSTAGED=$(git --no-pager diff --name-only | jq -R -s 'split("\n") | map(select(length > 0))')
        
        jq -n \
            --argjson staged "$STAGED" \
            --argjson unstaged "$UNSTAGED" \
            '{
                scope: "git-changes",
                staged_files: $staged,
                unstaged_files: $unstaged
            }'
        ;;
        
    "full-implementation")
        if [ -z "$SPEC_FILE" ]; then
            echo "Error: spec-file required for full-implementation scope" >&2
            exit 1
        fi
        
        # Extract affected files from spec
        AFFECTED=$(extract_affected_files "$SPEC_FILE")
        
        # Find corresponding test files using find-based search
        TEST_FILES=$(echo "$AFFECTED" | jq -r '.[]' | while read -r file; do
            if echo "$file" | grep -q "\.cs$"; then
                base=$(basename "$file" .cs)
                # Search for *Tests.cs or *_Tests.cs files across all *.Tests directories
                find . -type f -path "*.Tests/*" \( -name "${base}Tests.cs" -o -name "${base}_Tests.cs" \) 2>/dev/null | sed 's|^./||'
            fi
        done | sort -u | jq -R -s 'split("\n") | map(select(length > 0))')
        
        # Warn if no test files found for specs with [TEST] criteria
        if [ "$(echo "$TEST_FILES" | jq '. | length')" -eq 0 ]; then
            if grep -q "\[TEST\]" "$SPEC_FILE" 2>/dev/null; then
                echo "Warning: No test files found, but spec has [TEST] acceptance criteria" >&2
            fi
        fi
        
        jq -n \
            --argjson affected "$AFFECTED" \
            --argjson tests "$TEST_FILES" \
            '{
                scope: "full-implementation",
                affected_files: $affected,
                test_files: $tests
            }'
        ;;
        
    *)
        echo "Error: Invalid scope '$SCOPE'. Use 'git-changes' or 'full-implementation'" >&2
        exit 1
        ;;
esac

#!/bin/bash
# gather-artifacts.sh — Collects implementation artifacts for review
# Usage: ./gather-artifacts.sh git-changes
#        ./gather-artifacts.sh increment <N> <spec-file>
#        ./gather-artifacts.sh branch-diff [base-ref]      (default base-ref: origin/main)
#        ./gather-artifacts.sh full-implementation <spec-file>
# Output: JSON with file paths and git info.
# increment / branch-diff report "empty": true when there is nothing to review — a caller that
# chose the scope treats it as a FAIL, never as a question.
# shellcheck disable=SC2250,SC2292,SC2312  # style/note-level rules surfaced by the repo-wide `enable=all` (.shellcheckrc) — legacy patterns kept verbatim (file only moved by the review-spec-implementation→review rename); error/warning-level rules stay active

SCOPE="$1"
SPEC_FILE="$2"

if [ -z "$SCOPE" ]; then
    echo "Usage: gather-artifacts.sh [git-changes|increment <N> <spec-file>|branch-diff [base-ref]|full-implementation <spec-file>]" >&2
    exit 1
fi

# Helper: newline-separated paths on stdin -> JSON array
to_json_array() {
    jq -R -s 'split("\n") | map(select(length > 0))'
}

# Helper: every uncommitted path (staged + unstaged + untracked), repo-relative
uncommitted_files() {
    {
        git --no-pager diff --cached --name-only
        git --no-pager diff --name-only
        git ls-files --others --exclude-standard --full-name "$(git rev-parse --show-toplevel)"
    } | sort -u
}

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
        
    "increment")
        INCREMENT="$2"
        SPEC_FILE="$3"
        if [ -z "$INCREMENT" ] || [ -z "$SPEC_FILE" ]; then
            echo "Error: increment scope needs <N> and <spec-file>" >&2
            exit 1
        fi
        SPEC_REPO_PATH=$(git ls-files --full-name --others --cached -- "$SPEC_FILE" 2>/dev/null | head -1)
        [ -z "$SPEC_REPO_PATH" ] && SPEC_REPO_PATH="$SPEC_FILE"
        CHANGED=$(uncommitted_files | to_json_array)

        jq -n \
            --arg increment "$INCREMENT" \
            --arg spec "$SPEC_REPO_PATH" \
            --argjson changed "$CHANGED" \
            '{
                scope: "increment",
                increment: ($increment | tonumber),
                spec_file: $spec,
                changed_files: $changed,
                empty: ($changed | map(select(. != $spec)) | length == 0)
            }'
        ;;

    "branch-diff")
        BASE_REF="${2:-origin/main}"
        FORK_POINT=$(git merge-base --fork-point "$BASE_REF" HEAD 2>/dev/null || git merge-base "$BASE_REF" HEAD)
        if [ -z "$FORK_POINT" ]; then
            echo "Error: no fork point between $BASE_REF and HEAD" >&2
            exit 1
        fi
        COMMITTED=$(git --no-pager diff --name-only "$FORK_POINT"...HEAD | to_json_array)
        COMMITS=$(git --no-pager log --format='%h %s' "$FORK_POINT"..HEAD | to_json_array)
        UNCOMMITTED=$(uncommitted_files | to_json_array)

        jq -n \
            --arg base "$BASE_REF" \
            --arg fork "$FORK_POINT" \
            --argjson committed "$COMMITTED" \
            --argjson commits "$COMMITS" \
            --argjson uncommitted "$UNCOMMITTED" \
            '{
                scope: "branch-diff",
                base_ref: $base,
                fork_point: $fork,
                commits: $commits,
                committed_files: $committed,
                uncommitted_files: $uncommitted,
                empty: (($committed | length) == 0 and ($uncommitted | length) == 0)
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
        echo "Error: Invalid scope '$SCOPE'. Use 'git-changes', 'increment', 'branch-diff' or 'full-implementation'" >&2
        exit 1
        ;;
esac

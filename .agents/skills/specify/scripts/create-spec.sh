#!/bin/bash
# create-spec.sh — Scaffolds a new spec file from the template
# Usage: ./create-spec.sh <slug>
# Output: creates docs/backlog/todo/YYYY-MM-DD-<slug>.md

SLUG="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$SCRIPT_DIR/../templates/spec-template.md"

# Determine spec directory: walk up from current directory first, then fall back to git root
SEARCH_DIR="$(pwd)"
while [ "$SEARCH_DIR" != "/" ]; do
    if [ -d "$SEARCH_DIR/docs/backlog" ]; then
        SPEC_DIR="$SEARCH_DIR/docs/backlog/todo"
        break
    fi
    SEARCH_DIR="$(dirname "$SEARCH_DIR")"
done

# Fallback: use git root if no docs/backlog found above
if [ -z "$SPEC_DIR" ]; then
    REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
    if [ -n "$REPO_ROOT" ] && [ -d "$REPO_ROOT/docs/backlog" ]; then
        SPEC_DIR="$REPO_ROOT/docs/backlog/todo"
    fi
fi

if [ -z "$SPEC_DIR" ]; then
    echo "Error: Could not find docs/backlog/ directory. Run from within a git repository or a project tree." >&2
    exit 1
fi

if [ -z "$SLUG" ]; then
    echo "Usage: create-spec.sh <slug>" >&2
    echo "Example: create-spec.sh fix-nullable-auth" >&2
    exit 1
fi

if [ ! -f "$TEMPLATE" ]; then
    echo "Error: Template not found at $TEMPLATE" >&2
    exit 1
fi

mkdir -p "$SPEC_DIR"

DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +"%Y-%m-%d %H:%M")
FILENAME="$SPEC_DIR/$DATE-$SLUG.md"

if [ -f "$FILENAME" ]; then
    echo "Error: Spec file already exists: $FILENAME" >&2
    exit 1
fi

sed "s/{{ YYYY-MM-DD HH:MM }}/$TIMESTAMP/" "$TEMPLATE" > "$FILENAME"
echo "✅ Spec created: $FILENAME"

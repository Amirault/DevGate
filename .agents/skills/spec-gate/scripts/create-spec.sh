#!/bin/bash
# create-spec.sh — Scaffolds a new spec file from the template
# Usage: ./create-spec.sh <slug>
# Output: creates docs/backlog/todo/YYYY-MM-DD-<slug>.md

SLUG="$1"
SCRIPT_DIR="$(dirname "$0")"
TEMPLATE="$SCRIPT_DIR/../templates/spec-template.md"
SPEC_DIR="docs/backlog/todo"

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

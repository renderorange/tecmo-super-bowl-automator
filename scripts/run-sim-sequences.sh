#!/usr/bin/env bash

set -e

SEQUENCES=${1:-10}

echo "Running ${SEQUENCES} simulation sequences (stopping on failure)"
echo "============================================================="
echo ""

for i in $(seq 1 "$SEQUENCES"); do
    echo "### sequence $i"
    echo "## creating backup"
    npm run db:backup
    node scripts/run-multi-season.js --quiet
done

echo ""
echo "All ${SEQUENCES} sequences completed successfully!"

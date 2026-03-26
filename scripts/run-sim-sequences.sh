#!/usr/bin/env bash

set -e

SEQUENCES=10

while [ $# -gt 0 ]; do
    case "$1" in
        --sequences|-s)
            if [ -z "$2" ]; then
                echo "Error: --sequences requires a numeric value"
                exit 1
            fi
            SEQUENCES="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--sequences N]"
            echo ""
            echo "Options:"
            echo "  --sequences, -s   Number of simulation sequences to run (default: 10)"
            exit 0
            ;;
        *)
            echo "Error: unknown argument '$1'"
            echo "Use --help to see available options"
            exit 1
            ;;
    esac
done

if ! [[ "$SEQUENCES" =~ ^[0-9]+$ ]]; then
    echo "Error: --sequences must be a non-negative integer"
    exit 1
fi

LOG_FILE="runs/sim-sequences-$(date +%Y%m%d-%H%M%S).log"

echo "Running ${SEQUENCES} simulation sequences (stopping on failure)"
echo "Logging to: $LOG_FILE"
echo "============================================================="

exec > >(tee -a "$LOG_FILE") 2>&1

for i in $(seq 1 "$SEQUENCES"); do
    echo
    echo "### sequence $i"
    echo
    node scripts/run-multi-season.js --quiet --skip-post-import

    echo
    echo "## Running post-import aggregation..."
    echo
    node scripts/post-import-aggregation.js

    echo
    echo "## creating backup"
    echo
    npm run db:backup
done

echo
echo "All ${SEQUENCES} sequences completed successfully!"

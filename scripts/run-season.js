#!/usr/bin/env node

/**
 * Run a full 17-week Tecmo Super Bowl season (COM vs COM).
 *
 * Usage:
 *   node scripts/run-season.js [options]
 *
 * Options:
 *   --output, -o  Output JSONL file (default: runs/season-{timestamp}.jsonl)
 *   --max-games   Max games to run (default: 238 = 14*17)
 *   --quiet, -q   Suppress per-game output
 */

import { Emulator } from "../src/emulator/index.js";
import fs from "fs";
import path from "path";
import minimist from "minimist";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const args = minimist(process.argv.slice(2), {
    alias: { o: "output", q: "quiet" },
    default: { "max-games": 238 },
});

// Set up output file
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const runsDir = path.join(projectRoot, "runs");
fs.mkdirSync(runsDir, { recursive: true });

const outputFile = args.output || path.join(runsDir, `season-${timestamp}.jsonl`);
const maxGames = parseInt(args["max-games"], 10);
const quiet = args.quiet || false;

console.log("Tecmo Super Bowl Season Simulator");
console.log("==================================");
console.log(`Output:    ${outputFile}`);
console.log(`Max games: ${maxGames}`);
console.log();

const emulator = new Emulator({
    outputFile,
    maxGames,
});

// Track stats for summary
let gameCount = 0;
let currentWeek = -1;
const weekResults = {};
const teamRecords = {};
const startTime = Date.now();

function updateRecords(game) {
    const p1 = game.p1_team;
    const p2 = game.p2_team;

    if (!teamRecords[p1]) {
        teamRecords[p1] = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 };
    }
    if (!teamRecords[p2]) {
        teamRecords[p2] = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 };
    }

    teamRecords[p1].pf += game.p1_score;
    teamRecords[p1].pa += game.p2_score;
    teamRecords[p2].pf += game.p2_score;
    teamRecords[p2].pa += game.p1_score;

    if (game.p1_score > game.p2_score) {
        teamRecords[p1].wins++;
        teamRecords[p2].losses++;
    } else if (game.p2_score > game.p1_score) {
        teamRecords[p2].wins++;
        teamRecords[p1].losses++;
    } else {
        teamRecords[p1].ties++;
        teamRecords[p2].ties++;
    }
}

try {
    const results = await emulator.run({
        maxGames,
        outputFile,
        onProgress: (line) => {
            if (!quiet) {
                if (line.startsWith("Starting week")) {
                    console.log(`\n${line}`);
                } else if (line.startsWith("---")) {
                    console.log(line);
                } else if (line.startsWith("Game ")) {
                    console.log(`  ${line}`);
                } else if (line.startsWith("Regular season") || line.startsWith("Done:")) {
                    console.log(`\n${line}`);
                }
            }
        },
    });

    // Compute standings from full results
    gameCount = results.length;
    results.forEach(game => updateRecords(game));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n==================================");
    console.log(`Season complete: ${gameCount} games in ${elapsed}s`);
    console.log(`Results: ${outputFile}`);

    // Print standings
    if (Object.keys(teamRecords).length > 0) {
        console.log("\nFinal Standings:");
        console.log("Team   W   L   T    PF    PA   Diff");
        console.log("----  --  --  --  ----  ----  -----");

        const sorted = Object.entries(teamRecords)
            .sort((a, b) => {
                // Sort by wins desc, then point diff desc
                if (b[1].wins !== a[1].wins) {
                    return b[1].wins - a[1].wins;
                }
                return (b[1].pf - b[1].pa) - (a[1].pf - a[1].pa);
            });

        for (const [team, rec] of sorted) {
            const diff = rec.pf - rec.pa;
            const diffStr = (diff >= 0 ? "+" : "") + diff;
            console.log(
                `${team.padEnd(5)} ${String(rec.wins).padStart(2)}  ` +
                `${String(rec.losses).padStart(2)}  ${String(rec.ties).padStart(2)}  ` +
                `${String(rec.pf).padStart(4)}  ${String(rec.pa).padStart(4)}  ${diffStr.padStart(5)}`,
            );
        }
    }
} catch (error) {
    console.error(`\nFailed: ${error.message}`);
    emulator.forceStop();
    process.exit(1);
}

#!/usr/bin/env node

/**
 * Run multiple Tecmo Super Bowl seasons in parallel.
 *
 * Spawns N concurrent run-season.js child processes, each running
 * an independent full season. Results are saved to the database
 * and individual JSONL files.
 *
 * Usage:
 *   node scripts/run-multi-season.js [options]
 *
 * Options:
 *   --seasons, -n    Number of seasons to run (default: 10)
 *   --concurrency, -c  Max concurrent seasons (default: CPU cores - 1, min 1)
 *   --quiet, -q      Suppress per-game output from child processes
 *   --no-db          Skip database persistence (JSONL only)
 */

import { spawn } from "child_process";
import os from "os";
import path from "path";
import minimist from "minimist";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const RUN_SEASON_SCRIPT = path.join(__dirname, "run-season.js");

const args = minimist(process.argv.slice(2), {
    alias: { n: "seasons", c: "concurrency", q: "quiet" },
    default: {
        seasons: 10,
        concurrency: Math.max(1, os.cpus().length - 1),
    },
    boolean: ["quiet", "no-db"],
});

const total_seasons = parseInt(args.seasons, 10);
const max_concurrency = parseInt(args.concurrency, 10);
const quiet = args.quiet || false;
const save_db = !args["no-db"];

console.log("Tecmo Super Bowl Multi-Season Runner");
console.log("=====================================");
console.log(`Seasons:     ${total_seasons}`);
console.log(`Concurrency: ${max_concurrency}`);
console.log(`Database:    ${save_db ? "Enabled" : "Disabled"}`);
console.log(`Quiet:       ${quiet}`);
console.log();

const results = [];
let completed = 0;
let failed = 0;
let running = 0;
let next_season = 0;
const start_time = Date.now();

/**
 * Run a single season as a child process.
 *
 * @param {number} season_number - 1-based season index (for display only)
 * @returns {Promise<object>} Result summary
 */
function run_season (season_number) {
    return new Promise((resolve) => {
        const child_args = ["--quiet"];
        if (save_db) {
            child_args.push("--save-db");
        }

        const child = spawn("node", [RUN_SEASON_SCRIPT, ...child_args], {
            cwd: PROJECT_ROOT,
            stdio: ["ignore", "pipe", "pipe"],
            env: {
                ...process.env,
                TSB_SEED: String(season_number),
            },
        });

        let stdout_buffer = "";
        let stderr_buffer = "";

        child.stdout.on("data", (data) => {
            stdout_buffer += data.toString();
        });

        child.stderr.on("data", (data) => {
            stderr_buffer += data.toString();
        });

        child.on("close", (code) => {
            const elapsed = ((Date.now() - start_time) / 1000).toFixed(1);
            const result = {
                season_number,
                pid: child.pid,
                exit_code: code,
                success: code === 0,
                stderr: stderr_buffer.trim() || null,
            };

            if (code === 0) {
                completed++;
                // Extract season ID from stdout if available
                const season_id_match = stdout_buffer.match(/Created season record: (\d+)/);
                const games_match = stdout_buffer.match(/Season complete: (\d+) games/);
                result.season_id = season_id_match ? parseInt(season_id_match[1], 10) : null;
                result.games_completed = games_match ? parseInt(games_match[1], 10) : null;

                console.log(
                    `[${elapsed}s] Season ${season_number}/${total_seasons} completed` +
                    `${result.season_id ? ` (id: ${result.season_id})` : ""}` +
                    `${result.games_completed ? ` -- ${result.games_completed} games` : ""}` +
                    ` [${completed} done, ${failed} failed, ${running - 1} running]`,
                );
            } else {
                failed++;
                console.error(
                    `[${elapsed}s] Season ${season_number}/${total_seasons} FAILED (exit ${code})` +
                    ` [${completed} done, ${failed} failed, ${running - 1} running]`,
                );
                if (!quiet && stderr_buffer.trim()) {
                    const first_line = stderr_buffer.trim()
                        .split("\n")[0];
                    console.error(`  stderr: ${first_line}`);
                }
            }

            resolve(result);
        });

        child.on("error", (err) => {
            failed++;
            const elapsed = ((Date.now() - start_time) / 1000).toFixed(1);
            console.error(
                `[${elapsed}s] Season ${season_number}/${total_seasons} spawn error: ${err.message}`,
            );
            resolve({
                season_number,
                pid: null,
                exit_code: null,
                success: false,
                stderr: err.message,
            });
        });
    });
}

/**
 * Run all seasons with concurrency throttling.
 */
async function run_all () {
    const pending = [];

    function start_next () {
        if (next_season >= total_seasons) {
            return null;
        }

        next_season++;
        running++;
        const season_num = next_season;

        const promise = run_season(season_num)
            .then((result) => {
                running--;
                results.push(result);
                // Start another if there are more queued
                const next = start_next();
                return next || result;
            });

        return promise;
    }

    // Seed the initial batch
    const initial_batch = Math.min(max_concurrency, total_seasons);
    for (let i = 0; i < initial_batch; i++) {
        const promise = start_next();
        if (promise) {
            pending.push(promise);
        }
    }

    // Wait for all to complete
    await Promise.all(pending);

    // Print summary
    const total_elapsed = ((Date.now() - start_time) / 1000).toFixed(1);
    const successful = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    console.log("\n=====================================");
    console.log("Multi-Season Summary");
    console.log("=====================================");
    console.log(`Total:     ${total_seasons} seasons`);
    console.log(`Completed: ${successful.length}`);
    console.log(`Failed:    ${failures.length}`);
    console.log(`Time:      ${total_elapsed}s`);

    if (successful.length > 0) {
        const total_games = successful.reduce((sum, r) => sum + (r.games_completed || 0), 0);
        const avg_games = (total_games / successful.length).toFixed(0);
        console.log(`Games:     ${total_games} total (avg ${avg_games}/season)`);

        const season_ids = successful
            .filter((r) => r.season_id)
            .map((r) => r.season_id);
        if (season_ids.length > 0) {
            console.log(`Season IDs: ${season_ids.join(", ")}`);
        }
    }

    if (failures.length > 0) {
        console.log("\nFailed seasons:");
        for (const f of failures) {
            const first_err = f.stderr ? f.stderr.split("\n")[0] : null;
            console.log(
                `  Season ${f.season_number}: exit ${f.exit_code}${first_err ? ` -- ${first_err}` : ""}`,
            );
        }
    }

    const avg_per_season = successful.length > 0
        ? (parseFloat(total_elapsed) / successful.length).toFixed(1)
        : "N/A";
    console.log(`\nAvg time per season: ${avg_per_season}s (wall-clock / completed)`);

    // Exit with error if any failed
    if (failures.length > 0) {
        process.exit(1);
    }
}

run_all()
    .catch((err) => {
        console.error(`Fatal error: ${err.message}`);
        process.exit(2);
    });

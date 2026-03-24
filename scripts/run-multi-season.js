#!/usr/bin/env node

/**
 * Run multiple Tecmo Super Bowl seasons in parallel.
 *
 * Spawns N concurrent run-season.js child processes, each running
 * an independent full season. Child processes write JSONL only;
 * the parent process handles all database writes sequentially
 * to prevent "database is locked" errors.
 *
 * Usage:
 *   node scripts/run-multi-season.js [options]
 *
 * Options:
 *   --seasons, -n    Number of seasons to run (default: 10)
 *   --concurrency, -c  Max concurrent seasons (default: CPU cores - 1, min 1)
 *   --quiet, -q      Suppress per-game output from child processes
 *   --no-db          Skip database persistence (JSONL only)
 *   --skip-import   Skip database import (useful for just running sims)
 */

import { spawn } from "child_process";
import os from "os";
import path from "path";
import minimist from "minimist";
import { fileURLToPath } from "url";
import { acquire_lock, release_lock, import_all_seasons } from "./db-writer.js";
import db from "../src/db/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const RUN_SEASON_SCRIPT = path.join(__dirname, "run-season.js");

const args = minimist(process.argv.slice(2), {
    alias: { n: "seasons", c: "concurrency", q: "quiet" },
    default: {
        seasons: 10,
        concurrency: Math.max(1, os.cpus().length - 1),
    },
    boolean: ["quiet", "no-db", "skip-import"],
});

const total_seasons = parseInt(args.seasons, 10);
const max_concurrency = parseInt(args.concurrency, 10);
const quiet = args.quiet || false;
const skip_import = args["skip-import"] || false;

console.log("Tecmo Super Bowl Multi-Season Runner");
console.log("=====================================");
console.log(`Seasons:     ${total_seasons}`);
console.log(`Concurrency: ${max_concurrency}`);
console.log(`Database:    ${!skip_import ? "Enabled" : "Disabled"}`);
console.log(`Quiet:       ${quiet}`);
console.log();

const results = [];
const jsonl_files = [];
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
function run_season(season_number) {
    return new Promise((resolve) => {
        const child_args = [];
        if (quiet) {
            child_args.push("--quiet");
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
                const games_match = stdout_buffer.match(/Season complete: (\d+) games/);
                result.games_completed = games_match ? parseInt(games_match[1], 10) : null;

                const output_match = stdout_buffer.match(/Results: (.+\.jsonl)/);
                if (output_match) {
                    result.jsonl_file = output_match[1];
                    jsonl_files.push(result.jsonl_file);
                }

                console.log(
                    `[${elapsed}s] Season ${season_number}/${total_seasons} completed` +
                        `${result.jsonl_file ? ` (${path.basename(result.jsonl_file)})` : ""}` +
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
                    const first_line = stderr_buffer.trim().split("\n")[0];
                    console.error(`  stderr: ${first_line}`);
                }
            }

            resolve(result);
        });

        child.on("error", (err) => {
            failed++;
            const elapsed = ((Date.now() - start_time) / 1000).toFixed(1);
            console.error(`[${elapsed}s] Season ${season_number}/${total_seasons} spawn error: ${err.message}`);
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
async function run_all() {
    const pending = new Set();

    function start_next() {
        if (next_season >= total_seasons) {
            return null;
        }

        next_season++;
        running++;
        const season_num = next_season;

        const promise = run_season(season_num).then((result) => {
            running--;
            results.push(result);
            const next = start_next();
            return next || result;
        });

        return promise;
    }

    const initial_batch = Math.min(max_concurrency, total_seasons);
    for (let i = 0; i < initial_batch; i++) {
        const promise = start_next();
        if (promise) {
            pending.add(promise);
        }
    }

    await Promise.all(pending);

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
    }

    if (failures.length > 0) {
        console.log("\nFailed seasons:");
        for (const f of failures) {
            const first_err = f.stderr ? f.stderr.split("\n")[0] : null;
            console.log(`  Season ${f.season_number}: exit ${f.exit_code}${first_err ? ` -- ${first_err}` : ""}`);
        }
    }

    if (!skip_import && jsonl_files.length > 0) {
        console.log("\n=====================================");
        console.log("Importing seasons to database");
        console.log("=====================================");

        try {
            await acquire_lock();
            console.log("Acquired database lock");

            const imported = await import_all_seasons(jsonl_files);

            console.log("\nImport results:");
            let imported_count = 0;
            for (const imp of imported) {
                if (imp.success) {
                    console.log(`  ${path.basename(imp.file)} -> season ${imp.season_id} (${imp.games_saved} games)`);
                    imported_count++;
                } else {
                    console.error(`  ${path.basename(imp.file)} -> FAILED: ${imp.error}`);
                }
            }
            console.log(`\nImported ${imported_count}/${jsonl_files.length} seasons to database`);
        } catch (err) {
            console.error(`Import failed: ${err.message}`);
            process.exitCode = 1;
        } finally {
            release_lock();
            console.log("Released database lock");
        }
    }

    const avg_per_season = successful.length > 0 ? (parseFloat(total_elapsed) / successful.length).toFixed(1) : "N/A";
    console.log(`\nAvg time per season: ${avg_per_season}s (wall-clock / completed)`);

    if (failures.length > 0) {
        process.exitCode = 1;
    }
}

run_all()
    .catch((err) => {
        console.error(`Fatal error: ${err.message}`);
        process.exitCode = 2;
    })
    .finally(async () => {
        if (db && db.destroy) {
            await db.destroy();
        }
    });

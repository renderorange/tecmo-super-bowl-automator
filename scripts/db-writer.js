/**
 * Database writer with mutex lock for multi-process safety.
 *
 * Ensures only one process can perform database writes at a time,
 * preventing "database is locked" errors when running concurrent seasons.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SeasonRepository } from "../src/db/season-repository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCK_FILE = path.join(__dirname, "..", "data", ".db.lock");

let lockHandle = null;

async function acquire_lock(max_wait_ms = 60000, poll_interval_ms = 100) {
    const start = Date.now();

    while (true) {
        try {
            lockHandle = fs.openSync(LOCK_FILE, "wx");
            return;
        } catch (err) {
            if (err.code !== "EEXIST") {
                throw err;
            }
        }

        if (Date.now() - start > max_wait_ms) {
            throw new Error(`Failed to acquire database lock after ${max_wait_ms}ms`);
        }

        await new Promise((resolve) => setTimeout(resolve, poll_interval_ms));
    }
}

function release_lock() {
    if (lockHandle) {
        fs.closeSync(lockHandle);
        lockHandle = null;
    }
    try {
        fs.unlinkSync(LOCK_FILE);
    } catch {
        // Ignore if already removed
    }
}

async function import_season(jsonl_file_path) {
    const repository = new SeasonRepository();
    const results = [];

    const file_content = fs.readFileSync(jsonl_file_path, "utf-8");
    const lines = file_content.trim().split("\n");

    for (const line of lines) {
        try {
            results.push(JSON.parse(line));
        } catch (err) {
            console.error(`  Failed to parse line: ${err.message}`);
        }
    }

    if (results.length === 0) {
        throw new Error(`No games found in ${jsonl_file_path}`);
    }

    console.log(`  Importing ${results.length} games from ${path.basename(jsonl_file_path)}`);

    const season_id = await repository.create_season(results.length);
    console.log(`  Created season record: ${season_id}`);

    let games_saved = 0;
    for (const game of results) {
        try {
            await repository.save_game(season_id, game);
            games_saved++;
        } catch (err) {
            console.error(`  Failed to save game: ${err.message}`);
        }
    }

    console.log(`  Updating team season stats...`);
    await repository.update_team_season_stats(season_id);

    console.log(`  Refreshing player injury stats...`);
    await repository.refresh_player_injury_stats();

    await repository.complete_season(season_id, games_saved);
    console.log(`  Season ${season_id} saved to database`);

    console.log(`  Cleaning up ${jsonl_file_path}...`);
    fs.unlinkSync(jsonl_file_path);
    console.log("  JSONL file removed");

    return { season_id, games_saved };
}

async function import_all_seasons(jsonl_files) {
    const imported = [];

    for (const jsonl_file of jsonl_files) {
        try {
            const result = await import_season(jsonl_file);
            imported.push({
                file: jsonl_file,
                season_id: result.season_id,
                games_saved: result.games_saved,
                success: true,
            });
        } catch (err) {
            imported.push({
                file: jsonl_file,
                success: false,
                error: err.message,
            });
        }
    }

    return imported;
}

export { acquire_lock, release_lock, import_season, import_all_seasons };

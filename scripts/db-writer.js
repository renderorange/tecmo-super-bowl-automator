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

const DEFAULT_EXPECTED_GAMES = 224;

function parse_start_time_from_filename(jsonl_file_path) {
    const basename = path.basename(jsonl_file_path);
    const match = basename.match(/^season-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})(?:-\d+)?\.jsonl$/);
    if (!match) {
        return null;
    }

    const iso_without_zone = match[1].replace(/T(\d{2})-(\d{2})-(\d{2})$/, "T$1:$2:$3");
    const parsed = new Date(`${iso_without_zone}Z`);

    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed.toISOString();
}

function get_file_modified_time(jsonl_file_path) {
    try {
        const stats = fs.statSync(jsonl_file_path);
        return stats.mtime.toISOString();
    } catch {
        return null;
    }
}

/**
 * Import a season from a JSONL file.
 *
 * @param {string} jsonl_file_path - Path to the JSONL file
 * @param {object} options - Import options
 * @param {number} options.expected_games - Expected number of games (default: 224)
 * @param {boolean} options.skip_post_import - Skip update_team_season_stats and refresh_player_injury_stats (default: false)
 * @param {object} options.db - Optional knex instance (defaults to real database)
 * @returns {Promise<{season_id: number,games_saved: number, games_expected: number, is_complete: boolean}>}
 */
async function import_season(jsonl_file_path, options = {}) {
    const expected_games = options.expected_games || DEFAULT_EXPECTED_GAMES;
    const skip_post_import = options.skip_post_import || false;
    const repository = new SeasonRepository(options.db ? { db: options.db } : {});
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

    if (results.length !== expected_games) {
        throw new Error(`Incomplete JSONL file: got ${results.length} games, expected ${expected_games}`);
    }

    console.log(`  Importing ${results.length} games from ${path.basename(jsonl_file_path)}`);

    const started_at = parse_start_time_from_filename(jsonl_file_path);
    const completed_at = get_file_modified_time(jsonl_file_path);

    const season_id = await repository.create_season(expected_games, {
        started_at,
    });
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

    if (!skip_post_import) {
        console.log(`  Updating team season stats...`);
        await repository.update_team_season_stats(season_id);

        console.log(`  Refreshing player injury stats...`);
        await repository.refresh_player_injury_stats();
    }

    await repository.complete_season(season_id, games_saved, {
        completed_at,
    });
    console.log(`  Season ${season_id} saved to database`);

    console.log(`  Cleaning up ${jsonl_file_path}...`);
    fs.unlinkSync(jsonl_file_path);
    console.log("  JSONL file removed");

    return {
        season_id,
        games_saved,
        games_expected: expected_games,
        is_complete: games_saved === expected_games,
    };
}

/**
 * Import multiple seasons from JSONL files.
 *
 * @param {string[]} jsonl_files - Array of JSONL file paths
 * @param {object} options - Import options
 * @param {number} options.expected_games - Expected number of games per season (default: 224)
 * @param {boolean} options.skip_post_import - Skip update_team_season_stats and refresh_player_injury_stats (default: false)
 * @param {object} options.db - Optional knex instance (defaults to real database)
 * @returns {Promise<Array<{file: string, season_id?: number, games_saved?: number, success: boolean, error?: string}>>}
 */
async function import_all_seasons(jsonl_files, options = {}) {
    const imported = [];
    for (const jsonl_file of jsonl_files) {
        try {
            const result = await import_season(jsonl_file, options);
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

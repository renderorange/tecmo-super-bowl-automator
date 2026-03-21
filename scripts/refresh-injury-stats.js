#!/usr/bin/env node

/**
 * Refresh the player_injury_stats materialized table.
 *
 * This script rebuilds the player_injury_stats table with current data
 * from the database. Run this after manually importing data or if the
 * stats get out of sync.
 *
 * The table is automatically refreshed when running:
 *   - npm run simulate
 *   - npm run simulate:multi
 *
 * Manual refresh:
 *   npm run db:refresh-injury-stats
 */

import db from "../src/db/index.js";
import { SeasonRepository } from "../src/db/season-repository.js";

async function main() {
    console.log("Refreshing player_injury_stats table...");

    const repository = new SeasonRepository({ db });

    try {
        await repository.refresh_player_injury_stats();
        console.log("✓ Player injury stats refreshed successfully");
    } catch (error) {
        console.error("✗ Error refreshing player injury stats:", error.message);
        process.exit(1);
    } finally {
        db.destroy();
    }
}

main();

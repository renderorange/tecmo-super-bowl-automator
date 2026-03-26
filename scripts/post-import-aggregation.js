#!/usr/bin/env node

import { SeasonRepository } from "../src/db/season-repository.js";

async function main() {
    const repository = new SeasonRepository();

    const seasons = await repository.get_all_seasons();
    const completed = seasons.filter((s) => s.status === "completed");

    console.log("Post-Import Aggregation");
    console.log("=======================");
    console.log(`Seasons checked: ${completed.length}`);

    let updated = 0;
    for (const season of completed) {
        const existing = await repository.db("team_season_stats").where("season_id", season.id).first();
        if (!existing) {
            console.log(`  Updating season ${season.id}...`);
            await repository.update_team_season_stats(season.id);
            updated++;
        }
    }
    console.log(`Seasons updated: ${updated}`);
    console.log("Refreshing player injury stats...");
    await repository.refresh_player_injury_stats();
    console.log("Done");
    await repository.db.destroy();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

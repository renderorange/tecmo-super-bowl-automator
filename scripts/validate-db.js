#!/usr/bin/env node
/**
 * Database integrity validation script.
 *
 * Usage: node scripts/validate-db.js
 *
 * Checks:
 *   - Season counts (completed/running/failed)
 *   - Games per season (should be 224 for completed)
 *   - Team stats per season (should be 28 for completed)
 *   - Player stats completeness
 *   - Orphaned records
 *   - W-L-T consistency
 */

import db from "../src/db/index.js";

async function validate() {
    console.log("=== Database Integrity Validation ===\n");

    const issues = [];

    // 1. Season summary
    const seasons = await db("seasons").select("*");
    const completed = seasons.filter((s) => s.status === "completed");
    const running = seasons.filter((s) => s.status === "running");
    const failed = seasons.filter((s) => s.status === "failed");

    console.log("Seasons:");
    console.log("  Total:", seasons.length);
    console.log("  Completed:", completed.length);
    console.log("  Running:", running.length);
    console.log("  Failed:", failed.length);

    // 2. Games per completed season
    const gameCounts = await db("games").select("season_id").count("* as count").groupBy("season_id");

    const gameCountMap = new Map(gameCounts.map((g) => [g.season_id, g.count]));

    const incompleteSeasons = completed.filter((s) => {
        const count = gameCountMap.get(s.id) || 0;
        return count !== 224;
    });

    console.log("\nGames per completed season:");
    if (incompleteSeasons.length === 0) {
        console.log("  OK: All " + completed.length + " completed seasons have 224 games");
    } else {
        console.log("  PROBLEM: " + incompleteSeasons.length + " seasons have missing games");
        for (const s of incompleteSeasons.slice(0, 5)) {
            const count = gameCountMap.get(s.id) || 0;
            console.log("    Season " + s.id + ": " + count + " games");
        }
        issues.push("incomplete_games");
    }

    // 3. Team stats per completed season
    const statsCounts = await db("team_season_stats").select("season_id").count("* as count").groupBy("season_id");

    const statsCountMap = new Map(statsCounts.map((s) => [s.season_id, s.count]));

    const missingStats = completed.filter((s) => {
        const count = statsCountMap.get(s.id) || 0;
        return count !== 28;
    });

    console.log("\nTeam season stats per completed season:");
    if (missingStats.length === 0) {
        console.log("  OK: All " + completed.length + " completed seasons have 28 team stats records");
    } else {
        console.log("  PROBLEM: " + missingStats.length + " seasons missing team stats");
        for (const s of missingStats.slice(0, 5)) {
            const count = statsCountMap.get(s.id) || 0;
            console.log("    Season " + s.id + ": " + count + " teams");
        }
        issues.push("missing_team_stats");
    }

    // 4. Player stats completeness
    const totalGames = await db("games").count("* as count").first();
    const gamesWithPlayerStats = await db("player_game_stats").select("game_id").count("* as count").groupBy("game_id");

    console.log("\nPlayer game stats:");
    console.log("  Total games:", totalGames.count);
    console.log("  Games with player stats:", gamesWithPlayerStats.length);

    if (gamesWithPlayerStats.length < parseInt(totalGames.count)) {
        const diff = parseInt(totalGames.count) - gamesWithPlayerStats.length;
        console.log("  PROBLEM: " + diff + " games missing player stats");
        issues.push("missing_player_stats");
    } else {
        console.log("  OK: All games have player stats");
    }

    // 5. Orphaned records
    const orphanedInjuries = await db("injuries")
        .leftJoin("games", "injuries.game_id", "games.id")
        .whereNull("games.id")
        .count("* as count")
        .first();

    const orphanedPlayerStats = await db("player_game_stats")
        .leftJoin("games", "player_game_stats.game_id", "games.id")
        .whereNull("games.id")
        .count("* as count")
        .first();

    const orphanedTeamStats = await db("team_season_stats")
        .leftJoin("seasons", "team_season_stats.season_id", "seasons.id")
        .whereNull("seasons.id")
        .count("* as count")
        .first();

    console.log("\nOrphaned records:");
    console.log("  Injuries without game:", orphanedInjuries.count);
    console.log("  Player stats without game:", orphanedPlayerStats.count);
    console.log("  Team stats without season:", orphanedTeamStats.count);

    if (parseInt(orphanedInjuries.count) > 0) issues.push("orphaned_injuries");
    if (parseInt(orphanedPlayerStats.count) > 0) issues.push("orphaned_player_stats");
    if (parseInt(orphanedTeamStats.count) > 0) issues.push("orphaned_team_stats");

    // 6. W-L-T consistency check on sample seasons
    console.log("\nW-L-T consistency (sample of 5 seasons):");
    const sampleSeasons = completed.slice(0, 5);
    let wltIssues = 0;

    for (const season of sampleSeasons) {
        const standings = await db("team_season_stats").where("season_id", season.id);

        const totalWins = standings.reduce((sum, t) => sum + t.wins, 0);
        const totalLosses = standings.reduce((sum, t) => sum + t.losses, 0);
        const totalTies = standings.reduce((sum, t) => sum + t.ties, 0);

        const winsOk = totalWins === totalLosses;
        const tiesOk = totalTies % 2 === 0;

        if (!winsOk || !tiesOk) {
            console.log("  Season " + season.id + ": W=" + totalWins + " L=" + totalLosses + " T=" + totalTies + " (ISSUE)");
            wltIssues++;
        } else {
            console.log("  Season " + season.id + ": W=" + totalWins + " L=" + totalLosses + " T=" + totalTies + " (OK)");
        }
    }

    if (wltIssues > 0) {
        issues.push("wlt_inconsistency");
    }

    // 7. player_injury_stats count
    const injuryStatsCount = await db("player_injury_stats").count("* as count").first();
    console.log("\nplayer_injury_stats: " + injuryStatsCount.count + " records");

    // Summary
    console.log("\n=== Summary ===");
    if (issues.length === 0) {
        console.log("PASS: All checks passed");
    } else {
        console.log("FAIL: " + issues.length + " issue(s) found:");
        for (const issue of issues) {
            console.log("  - " + issue);
        }
    }

    await db.destroy();
    process.exit(issues.length > 0 ? 1 : 0);
}

validate().catch((err) => {
    console.error("Validation failed:", err);
    process.exit(1);
});

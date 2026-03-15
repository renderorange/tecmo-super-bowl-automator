#!/usr/bin/env node

/**
 * Seed the database with team and player data extracted from the ROM.
 *
 * Reads: src/db/seeds/teams_with_attributes.json
 * Writes to: teams and players tables in data/stats.db
 *
 * Safe to run multiple times -- clears existing data first.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../src/db/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(__dirname, "..", "src", "db", "seeds", "teams_with_attributes.json");

async function seed () {
    if (!fs.existsSync(SEED_PATH)) {
        console.error("Seed data not found: %s", SEED_PATH);
        console.error("Run: node scripts/extract-rom-data.js");
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));

    console.log("Seeding %d teams, %d players...", data.teams.length, data.players.length);

    // Clear existing data (reverse FK order)
    await db("injuries")
        .del();
    await db("player_game_stats")
        .del();
    await db("games")
        .del();
    await db("team_season_stats")
        .del();
    await db("seasons")
        .del();
    await db("players")
        .del();
    await db("teams")
        .del();

    // Insert teams
    await db.batchInsert("teams", data.teams, 50);
    console.log("  Inserted %d teams", data.teams.length);

    // Insert players (in batches, map JSON fields to table columns)
    const player_rows = data.players.map((p) => ({
        id: p.id,
        team_id: p.team_id,
        name: p.name,
        position: p.position,
        position_detail: p.position_detail,
        jersey: p.jersey,
        face: p.face,
        name_rom_offset: p.name_rom_offset,
        ability_rom_offset: p.ability_rom_offset,
        rushing_power: p.rushing_power,
        running_speed: p.running_speed,
        maximum_speed: p.maximum_speed,
        hitting_power: p.hitting_power,
        passing_speed: p.passing_speed || null,
        pass_control: p.pass_control || null,
        accuracy_of_passing: p.accuracy_of_passing || null,
        avoid_pass_block: p.avoid_pass_block || null,
        ball_control: p.ball_control || null,
        receptions: p.receptions || null,
        pass_interceptions: p.pass_interceptions || null,
        quickness: p.quickness || null,
        kicking_ability: p.kicking_ability || null,
        avoid_kick_block: p.avoid_kick_block || null,
    }));

    await db.batchInsert("players", player_rows, 50);
    console.log("  Inserted %d players", player_rows.length);

    // Verify
    const team_count = await db("teams")
        .count("* as count")
        .first();
    const player_count = await db("players")
        .count("* as count")
        .first();
    const qb_count = await db("players")
        .where("position", "QB")
        .count("* as count")
        .first();

    console.log("\nVerification:");
    console.log("  Teams:   %d", team_count.count);
    console.log("  Players: %d", player_count.count);
    console.log("  QBs:     %d", qb_count.count);

    // Spot check
    const montana = await db("players")
        .where("name", "Joe Montana")
        .first();
    if (montana) {
        console.log("\n  Joe Montana: PC=%d, PS=%d, MS=%d, APB=%d",
            montana.pass_control, montana.passing_speed, montana.maximum_speed, montana.avoid_pass_block);
    }

    const sf = await db("teams")
        .where("abbreviation", "SF")
        .first();
    if (sf) {
        const sf_players = await db("players")
            .where("team_id", sf.id)
            .orderBy("position_detail");
        console.log("  49ers roster: %d players", sf_players.length);
    }
}

seed()
    .then(() => {
        console.log("\nSeed complete.");
        return db.destroy();
    })
    .catch((err) => {
        console.error("Seed failed:", err);
        return db.destroy()
            .then(() => process.exit(1));
    });

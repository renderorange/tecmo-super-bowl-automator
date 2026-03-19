/**
 * Pipeline integration test: validates full JSONL-to-database round-trip.
 *
 * Constructs a realistic game object matching emulator JSONL output format,
 * saves it via save_game(), then queries back and verifies all data persisted
 * correctly.
 */

import knex_init from "knex";
import fs from "fs";
import path from "path";

let db;
let SeasonRepository;
let repository;
const TEST_DB_PATH = path.join("/tmp", `tsb-pipeline-test-${process.pid}.db`);

const TEST_TEAMS = [
    { id: 0, name: "Bills", city: "Buffalo", abbreviation: "BUF", conference: "AFC", division: "East" },
    { id: 2, name: "Dolphins", city: "Miami", abbreviation: "MIA", conference: "AFC", division: "East" },
];

const TEST_PLAYERS = [
    { id: 1, team_id: 0, name: "BUF QB1", position: "QB", position_detail: "QB1", jersey: 12 },
    { id: 2, team_id: 0, name: "BUF RB1", position: "RB", position_detail: "RB1", jersey: 34 },
    { id: 3, team_id: 0, name: "BUF K", position: "K", position_detail: "K", jersey: 1 },
    { id: 4, team_id: 0, name: "BUF P", position: "P", position_detail: "P", jersey: 2 },
];

const REALISTIC_GAME = {
    p1_team_id: 0,
    p2_team_id: 2,
    p1_team: "BUF",
    p2_team: "MIA",
    p1_score: 27,
    p2_score: 21,
    week: 3,
    game_in_week: 5,
    is_overtime: false,
    p1_pregame_record: {
        wins: 3,
        losses: 0,
        ties: 0,
        points_for: 84,
        points_against: 42,
        passing_yards_allowed: 450,
        rushing_yards_allowed: 280,
    },
    p2_pregame_record: {
        wins: 2,
        losses: 1,
        ties: 0,
        points_for: 63,
        points_against: 55,
        passing_yards_allowed: 510,
        rushing_yards_allowed: 320,
    },
    p1_players: {
        qb1: {
            passing_attempts: 22,
            passing_completions: 14,
            passing_yards: 185,
            passing_tds: 2,
            interceptions_thrown: 1,
            rushing_attempts: 3,
            rushing_yards: 12,
            rushing_tds: 0,
        },
        rb1: {
            rushing_attempts: 18,
            rushing_yards: 95,
            rushing_tds: 1,
            receptions: 2,
            receiving_yards: 15,
            receiving_tds: 0,
            kick_return_attempts: 3,
            kick_return_yards: 68,
            kick_return_tds: 0,
            punt_return_attempts: 0,
            punt_return_yards: 0,
            punt_return_tds: 0,
        },
        k: { xp_attempts: 3, xp_made: 3, fg_attempts: 2, fg_made: 2 },
        p: { punts: 4, punt_yards: 165 },
    },
    p2_players: {},
    p1_team_stats: {
        rushing_attempts: 25,
        rushing_yards: 120,
        rushing_tds: 1,
        passing_attempts: 22,
        passing_completions: 14,
        passing_yards: 185,
        passing_tds: 2,
        interceptions_thrown: 1,
        receptions: 14,
        receiving_yards: 185,
        receiving_tds: 2,
        sacks: 3,
        interceptions: 2,
        interception_return_yards: 30,
        interception_return_tds: 0,
        kick_return_attempts: 3,
        kick_return_yards: 68,
        kick_return_tds: 0,
        punt_return_attempts: 1,
        punt_return_yards: 8,
        punt_return_tds: 0,
        k: { xp_attempts: 3, xp_made: 3, fg_attempts: 2, fg_made: 2 },
        punting: { punts: 4, punt_yards: 165 },
        first_downs: 8,
        in_game_rushing_attempts: 25,
        in_game_rushing_yards: 120,
        in_game_passing_yards: 185,
        tracked_pts: 27,
        untracked_pts: 0,
    },
    p2_team_stats: {
        rushing_attempts: 20,
        rushing_yards: 85,
        rushing_tds: 1,
        passing_attempts: 28,
        passing_completions: 16,
        passing_yards: 210,
        passing_tds: 1,
        interceptions_thrown: 2,
        receptions: 16,
        receiving_yards: 210,
        receiving_tds: 1,
        sacks: 1,
        interceptions: 1,
        interception_return_yards: 0,
        interception_return_tds: 0,
        kick_return_attempts: 4,
        kick_return_yards: 90,
        kick_return_tds: 0,
        punt_return_attempts: 2,
        punt_return_yards: 18,
        punt_return_tds: 0,
        k: { xp_attempts: 3, xp_made: 3, fg_attempts: 0, fg_made: 0 },
        punting: { punts: 5, punt_yards: 200 },
        first_downs: 7,
        in_game_rushing_attempts: 20,
        in_game_rushing_yards: 85,
        in_game_passing_yards: 210,
        tracked_pts: 15,
        untracked_pts: 6,
    },
    p1_injury_detail: { qb1: 0, rb1: 0 },
    p2_injury_detail: {},
    p1_conditions: { qb1: "good", rb1: "excellent", k: "average", p: "average" },
    p2_conditions: {},
    weekly_matchups: [{ home: 0, away: 2 }],
    p1_playbook: [1, 2, 3, 4, 5, 6, 7, 8],
    p2_playbook: [1, 2, 3, 4, 5, 6, 7, 8],
    cpu_boosts: { def_ms: 0, off_ms: 0, def_int: 0, pass_ctrl: 0, reception: 0, boost_idx: 0 },
};

beforeAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
    }

    db = knex_init({
        client: "better-sqlite3",
        connection: { filename: TEST_DB_PATH },
        useNullAsDefault: true,
    });

    const migration = await import("../../src/db/migrations/001_initial_schema.js");
    await migration.up(db);

    const migration2 = await import("../../src/db/migrations/002_add_game_in_week_fix_total_games.js");
    await migration2.up(db);

    await db("teams").insert(TEST_TEAMS);
    await db("players").insert(TEST_PLAYERS);

    const mod = await import("../../src/db/season-repository.js");
    SeasonRepository = mod.SeasonRepository;
    repository = new SeasonRepository({ db });
});

afterAll(async () => {
    await db.destroy();
    if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
    }
});

beforeEach(async () => {
    await db("injuries").del();
    await db("player_game_stats").del();
    await db("games").del();
    await db("team_season_stats").del();
    await db("seasons").del();
    repository.injury_state_cache.clear();
});

describe("Pipeline integration: JSONL-to-database round-trip", () => {
    test("saves and retrieves full game data with all stat columns", async () => {
        const season_id = await repository.create_season();
        const game_id = await repository.save_game(season_id, REALISTIC_GAME);

        const game = await db("games").where("id", game_id).first();

        // Core game fields
        expect(game.week).toBe(4); // 0-based 3 -> 1-based 4
        expect(game.game_in_week).toBe(5);
        expect(game.home_team_id).toBe(0);
        expect(game.away_team_id).toBe(2);
        expect(game.home_score).toBe(27);
        expect(game.away_score).toBe(21);

        // Team stats
        expect(game.home_rushing_yards).toBe(120);
        expect(game.home_passing_yards).toBe(185);
        expect(game.away_rushing_yards).toBe(85);
        expect(game.away_passing_yards).toBe(210);

        // Tracked/untracked points
        expect(game.home_tracked_pts).toBe(27);
        expect(game.home_untracked_pts).toBe(0);
        expect(game.away_tracked_pts).toBe(15);
        expect(game.away_untracked_pts).toBe(6);

        // Pre-game records
        expect(game.home_pre_wins).toBe(3);
        expect(game.home_pre_losses).toBe(0);
        expect(game.away_pre_losses).toBe(1);
        expect(game.home_pre_pass_yards_allowed).toBe(450);
        expect(game.away_pre_pass_yards_allowed).toBe(510);

        // JSON metadata
        const matchups = JSON.parse(game.weekly_matchups);
        expect(matchups).toEqual([{ home: 0, away: 2 }]);
        expect(game.cpu_boosts).toBeDefined();
        const boosts = JSON.parse(game.cpu_boosts);
        expect(boosts.def_ms).toBe(0);
        expect(boosts.boost_idx).toBe(0);
    });

    test("saves and retrieves player stats with correct position mapping", async () => {
        const season_id = await repository.create_season();
        await repository.save_game(season_id, REALISTIC_GAME);

        // Query player_game_stats joined with players
        const stats = await db("player_game_stats")
            .join("players", "player_game_stats.player_id", "players.id")
            .select("players.position_detail", "player_game_stats.*");

        const qb_stats = stats.find((s) => s.position_detail === "QB1");
        expect(qb_stats).toBeDefined();
        expect(qb_stats.passing_yards).toBe(185);
        expect(qb_stats.passing_tds).toBe(2);
        expect(qb_stats.injury_status).toBe(0);
        expect(qb_stats.condition_status).toBe(2); // "good" = 2

        const rb_stats = stats.find((s) => s.position_detail === "RB1");
        expect(rb_stats).toBeDefined();
        expect(rb_stats.rushing_yards).toBe(95);
        expect(rb_stats.kick_return_yards).toBe(68);
        expect(rb_stats.condition_status).toBe(3); // "excellent" = 3
    });

    test("update_team_season_stats produces correct aggregation", async () => {
        const season_id = await repository.create_season();
        await repository.save_game(season_id, REALISTIC_GAME);
        await repository.update_team_season_stats(season_id);

        const buf_stats = await db("team_season_stats").where({ season_id, team_id: 0 }).first();
        expect(buf_stats.wins).toBe(1);
        expect(buf_stats.losses).toBe(0);
        expect(buf_stats.points_for).toBe(27);
        expect(buf_stats.points_against).toBe(21);

        const mia_stats = await db("team_season_stats").where({ season_id, team_id: 2 }).first();
        expect(mia_stats.wins).toBe(0);
        expect(mia_stats.losses).toBe(1);
        expect(mia_stats.points_for).toBe(21);
        expect(mia_stats.points_against).toBe(27);
    });
});

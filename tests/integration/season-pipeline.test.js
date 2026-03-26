/**
 * Integration test: full season pipeline with mocked emulator.
 *
 * Mocks the nesl emulator to return pre-recorded game data,
 * then verifies the full pipeline saves correctly to database.
 */

import knex_init from "knex";
import fs from "fs";
import path from "path";

const TEST_DB_PATH = path.join("/tmp", `tsb-integration-test-${process.pid}.db`);
const TEST_OUTPUT_FILE = path.join("/tmp", `tsb-integration-output-${process.pid}.jsonl`);

const TEST_TEAMS = [
    { id: 0, name: "Bills", city: "Buffalo", abbreviation: "BUF", conference: "AFC", division: "East" },
    { id: 2, name: "Dolphins", city: "Miami", abbreviation: "MIA", conference: "AFC", division: "East" },
    { id: 4, name: "Patriots", city: "New England", abbreviation: "NE", conference: "AFC", division: "East" },
    { id: 6, name: "Jets", city: "NY Jets", abbreviation: "NYJ", conference: "AFC", division: "East" },
];

const TEST_PLAYERS = [
    { id: 1, team_id: 0, name: "BUF QB1", position: "QB", position_detail: "QB1", jersey: 12 },
    { id: 2, team_id: 0, name: "BUF RB1", position: "RB", position_detail: "RB1", jersey: 34 },
    { id: 3, team_id: 0, name: "BUF K", position: "K", position_detail: "K", jersey: 1 },
    { id: 4, team_id: 0, name: "BUF P", position: "P", position_detail: "P", jersey: 2 },
    { id: 5, team_id: 2, name: "MIA QB1", position: "QB", position_detail: "QB1", jersey: 12 },
    { id: 6, team_id: 2, name: "MIA RB1", position: "RB", position_detail: "RB1", jersey: 34 },
    { id: 7, team_id: 2, name: "MIA K", position: "K", position_detail: "K", jersey: 1 },
    { id: 8, team_id: 4, name: "NE QB1", position: "QB", position_detail: "QB1", jersey: 12 },
    { id: 9, team_id: 4, name: "NE RB1", position: "RB", position_detail: "RB1", jersey: 34 },
    { id: 10, team_id: 4, name: "NE K", position: "K", position_detail: "K", jersey: 1 },
];

const FIXTURE_GAMES = [
    {
        p1_team_id: 0,
        p2_team_id: 2,
        p1_team: "Bills",
        p2_team: "Dolphins",
        p1_score: 24,
        p2_score: 17,
        week: 0,
        game_in_week: 0,
        is_overtime: false,
        p1_pregame_record: {
            wins: 0,
            losses: 0,
            ties: 0,
            points_for: 0,
            points_against: 0,
            passing_yards_allowed: 0,
            rushing_yards_allowed: 0,
        },
        p2_pregame_record: {
            wins: 0,
            losses: 0,
            ties: 0,
            points_for: 0,
            points_against: 0,
            passing_yards_allowed: 0,
            rushing_yards_allowed: 0,
        },
        p1_players: {
            qb1: {
                passing_attempts: 20,
                passing_completions: 14,
                passing_yards: 180,
                passing_tds: 2,
                interceptions_thrown: 0,
                rushing_attempts: 2,
                rushing_yards: 5,
                rushing_tds: 0,
            },
            rb1: {
                rushing_attempts: 15,
                rushing_yards: 65,
                rushing_tds: 1,
                receptions: 2,
                receiving_yards: 15,
                receiving_tds: 0,
                kick_return_attempts: 0,
                kick_return_yards: 0,
                kick_return_tds: 0,
                punt_return_attempts: 0,
                punt_return_yards: 0,
                punt_return_tds: 0,
            },
            rb2: {
                rushing_attempts: 8,
                rushing_yards: 30,
                rushing_tds: 0,
                receptions: 1,
                receiving_yards: 8,
                receiving_tds: 0,
                kick_return_attempts: 0,
                kick_return_yards: 0,
                kick_return_tds: 0,
                punt_return_attempts: 0,
                punt_return_yards: 0,
                punt_return_tds: 0,
            },
            k: { xp_attempts: 3, xp_made: 3, fg_attempts: 1, fg_made: 1 },
            p: { punts: 3, punt_yards: 120 },
        },
        p2_players: {
            qb1: {
                passing_attempts: 25,
                passing_completions: 16,
                passing_yards: 200,
                passing_tds: 1,
                interceptions_thrown: 1,
                rushing_attempts: 3,
                rushing_yards: 10,
                rushing_tds: 0,
            },
            rb1: {
                rushing_attempts: 12,
                rushing_yards: 45,
                rushing_tds: 1,
                receptions: 3,
                receiving_yards: 25,
                receiving_tds: 0,
                kick_return_attempts: 0,
                kick_return_yards: 0,
                kick_return_tds: 0,
                punt_return_attempts: 0,
                punt_return_yards: 0,
                punt_return_tds: 0,
            },
            k: { xp_attempts: 2, xp_made: 2, fg_attempts: 1, fg_made: 0 },
            p: { punts: 4, punt_yards: 160 },
        },
        p1_team_stats: {
            rushing_attempts: 25,
            rushing_yards: 100,
            rushing_tds: 1,
            passing_attempts: 20,
            passing_completions: 14,
            passing_yards: 180,
            passing_tds: 2,
            interceptions_thrown: 0,
            receptions: 14,
            receiving_yards: 180,
            receiving_tds: 2,
            sacks: 2,
            interceptions: 1,
            interception_return_yards: 15,
            interception_return_tds: 0,
            kick_return_attempts: 2,
            kick_return_yards: 40,
            kick_return_tds: 0,
            punt_return_attempts: 1,
            punt_return_yards: 8,
            punt_return_tds: 0,
            k: { xp_attempts: 3, xp_made: 3, fg_attempts: 1, fg_made: 1 },
            punting: { punts: 3, punt_yards: 120 },
            first_downs: 18,
            in_game_rushing_attempts: 25,
            in_game_rushing_yards: 100,
            in_game_passing_yards: 180,
            tracked_pts: 24,
            untracked_pts: 0,
        },
        p2_team_stats: {
            rushing_attempts: 20,
            rushing_yards: 70,
            rushing_tds: 1,
            passing_attempts: 25,
            passing_completions: 16,
            passing_yards: 200,
            passing_tds: 1,
            interceptions_thrown: 1,
            receptions: 16,
            receiving_yards: 200,
            receiving_tds: 1,
            sacks: 1,
            interceptions: 0,
            interception_return_yards: 0,
            interception_return_tds: 0,
            kick_return_attempts: 2,
            kick_return_yards: 45,
            kick_return_tds: 0,
            punt_return_attempts: 1,
            punt_return_yards: 5,
            punt_return_tds: 0,
            k: { xp_attempts: 2, xp_made: 2, fg_attempts: 1, fg_made: 0 },
            punting: { punts: 4, punt_yards: 160 },
            first_downs: 15,
            in_game_rushing_attempts: 20,
            in_game_rushing_yards: 70,
            in_game_passing_yards: 200,
            tracked_pts: 17,
            untracked_pts: 0,
        },
        p1_injury_detail: {},
        p2_injury_detail: {},
        p1_conditions: {},
        p2_conditions: {},
        weekly_matchups: [{ home: 0, away: 2 }],
        p1_playbook: [1, 2, 3, 4, 5, 6, 7, 8],
        p2_playbook: [1, 2, 3, 4, 5, 6, 7, 8],
        cpu_boosts: { def_ms: 0, off_ms: 0, def_int: 0, pass_ctrl: 0, reception: 0, boost_idx: 0 },
    },
    {
        p1_team_id: 0,
        p2_team_id: 4,
        p1_team: "Bills",
        p2_team: "Patriots",
        p1_score: 31,
        p2_score: 10,
        week: 0,
        game_in_week: 1,
        is_overtime: false,
        p1_pregame_record: {
            wins: 1,
            losses: 0,
            ties: 0,
            points_for: 24,
            points_against: 17,
            passing_yards_allowed: 200,
            rushing_yards_allowed: 70,
        },
        p2_pregame_record: {
            wins: 0,
            losses: 1,
            ties: 0,
            points_for: 10,
            points_against: 31,
            passing_yards_allowed: 180,
            rushing_yards_allowed: 100,
        },
        p1_players: {
            qb1: {
                passing_attempts: 18,
                passing_completions: 12,
                passing_yards: 150,
                passing_tds: 3,
                interceptions_thrown: 0,
                rushing_attempts: 4,
                rushing_yards: 20,
                rushing_tds: 0,
            },
            rb1: {
                rushing_attempts: 20,
                rushing_yards: 95,
                rushing_tds: 1,
                receptions: 1,
                receiving_yards: 10,
                receiving_tds: 0,
                kick_return_attempts: 0,
                kick_return_yards: 0,
                kick_return_tds: 0,
                punt_return_attempts: 0,
                punt_return_yards: 0,
                punt_return_tds: 0,
            },
            k: { xp_attempts: 4, xp_made: 4, fg_attempts: 1, fg_made: 1 },
            p: { punts: 2, punt_yards: 80 },
        },
        p2_players: {
            qb1: {
                passing_attempts: 22,
                passing_completions: 12,
                passing_yards: 140,
                passing_tds: 1,
                interceptions_thrown: 2,
                rushing_attempts: 5,
                rushing_yards: 15,
                rushing_tds: 0,
            },
            k: { xp_attempts: 1, xp_made: 1, fg_attempts: 1, fg_made: 1 },
            p: { punts: 5, punt_yards: 210 },
        },
        p1_team_stats: {
            rushing_attempts: 28,
            rushing_yards: 125,
            rushing_tds: 1,
            passing_attempts: 18,
            passing_completions: 12,
            passing_yards: 150,
            passing_tds: 3,
            interceptions_thrown: 0,
            receptions: 12,
            receiving_yards: 150,
            receiving_tds: 3,
            sacks: 3,
            interceptions: 2,
            interception_return_yards: 40,
            interception_return_tds: 1,
            kick_return_attempts: 1,
            kick_return_yards: 20,
            kick_return_tds: 0,
            punt_return_attempts: 0,
            punt_return_yards: 0,
            punt_return_tds: 0,
            k: { xp_attempts: 4, xp_made: 4, fg_attempts: 1, fg_made: 1 },
            punting: { punts: 2, punt_yards: 80 },
            first_downs: 20,
            in_game_rushing_attempts: 28,
            in_game_rushing_yards: 125,
            in_game_passing_yards: 150,
            tracked_pts: 31,
            untracked_pts: 0,
        },
        p2_team_stats: {
            rushing_attempts: 15,
            rushing_yards: 50,
            rushing_tds: 0,
            passing_attempts: 22,
            passing_completions: 12,
            passing_yards: 140,
            passing_tds: 1,
            interceptions_thrown: 2,
            receptions: 12,
            receiving_yards: 140,
            receiving_tds: 1,
            sacks: 1,
            interceptions: 0,
            interception_return_yards: 0,
            interception_return_tds: 0,
            kick_return_attempts: 3,
            kick_return_yards: 60,
            kick_return_tds: 0,
            punt_return_attempts: 1,
            punt_return_yards: 10,
            punt_return_tds: 0,
            k: { xp_attempts: 1, xp_made: 1, fg_attempts: 1, fg_made: 1 },
            punting: { punts: 5, punt_yards: 210 },
            first_downs: 12,
            in_game_rushing_attempts: 15,
            in_game_rushing_yards: 50,
            in_game_passing_yards: 140,
            tracked_pts: 10,
            untracked_pts: 0,
        },
        p1_injury_detail: {},
        p2_injury_detail: {},
        p1_conditions: {},
        p2_conditions: {},
        weekly_matchups: [
            { home: 0, away: 4 },
            { home: 2, away: 6 },
        ],
        p1_playbook: [1, 2, 3, 4, 5, 6, 7, 8],
        p2_playbook: [1, 2, 3, 4, 5, 6, 7, 8],
        cpu_boosts: { def_ms: 0, off_ms: 0, def_int: 0, pass_ctrl: 0, reception: 0, boost_idx: 0 },
    },
];

let db;
let SeasonRepository;

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

    const migration3 = await import("../../src/db/migrations/003_add_performance_indexes.js");
    await migration3.up(db);

    const migration4 = await import("../../src/db/migrations/004_add_player_injury_stats_table.js");
    await migration4.up(db);

    const migration5 = await import("../../src/db/migrations/005_add_pgs_compound_index.js");
    await migration5.up(db);

    await db("teams").insert(TEST_TEAMS);
    await db("players").insert(TEST_PLAYERS);

    const mod = await import("../../src/db/season-repository.js");
    SeasonRepository = mod.SeasonRepository;
});

afterAll(async () => {
    await db.destroy();
    if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_OUTPUT_FILE)) {
        fs.unlinkSync(TEST_OUTPUT_FILE);
    }
});

beforeEach(async () => {
    console.warn = () => {};
    await db("injuries").del();
    await db("player_game_stats").del();
    await db("games").del();
    await db("team_season_stats").del();
    await db("seasons").del();
});

describe("Full season pipeline with mocked emulator", () => {
    test("saves full season to database and computes stats correctly", async () => {
        const repository = new SeasonRepository({ db });

        fs.writeFileSync(TEST_OUTPUT_FILE, FIXTURE_GAMES.map((g) => JSON.stringify(g)).join("\n") + "\n");

        const season_id = await repository.create_season(FIXTURE_GAMES.length);
        expect(season_id).toBeDefined();

        for (const game of FIXTURE_GAMES) {
            await repository.save_game(season_id, game);
        }

        const games = await db("games").where("season_id", season_id);
        expect(games.length).toBe(2);

        const bills_games = games.filter((g) => g.home_team_id === 0 || g.away_team_id === 0);
        expect(bills_games.length).toBe(2);

        await repository.update_team_season_stats(season_id);
        await repository.refresh_player_injury_stats();

        await repository.complete_season(season_id, FIXTURE_GAMES.length);

        const team_stats = await db("team_season_stats").where("season_id", season_id);
        expect(team_stats.length).toBeGreaterThan(0);

        const bills_stats = team_stats.find((t) => t.team_id === 0);
        expect(bills_stats.wins).toBe(2);
        expect(bills_stats.losses).toBe(0);
        expect(bills_stats.points_for).toBe(55);
        expect(bills_stats.points_against).toBe(27);

        const season = await db("seasons").where("id", season_id).first();
        expect(season.status).toBe("completed");
        expect(season.total_games).toBe(2);
    });

    test("handles --skip-post-import correctly", async () => {
        const repository = new SeasonRepository({ db });

        fs.writeFileSync(TEST_OUTPUT_FILE, FIXTURE_GAMES.map((g) => JSON.stringify(g)).join("\n") + "\n");

        const season_id = await repository.create_season(FIXTURE_GAMES.length);

        for (const game of FIXTURE_GAMES) {
            await repository.save_game(season_id, game);
        }

        await repository.complete_season(season_id, FIXTURE_GAMES.length);

        const team_stats_before = await db("team_season_stats").where("season_id", season_id);
        expect(team_stats_before.length).toBe(0);

        await repository.update_team_season_stats(season_id);
        await repository.refresh_player_injury_stats();

        const team_stats_after = await db("team_season_stats").where("season_id", season_id);
        expect(team_stats_after.length).toBeGreaterThan(0);
    });
});

describe("db-writer import functions", () => {
    let logs;
    let originalLog;
    let originalWarn;
    beforeAll(() => {
        originalLog = console.log;
        originalWarn = console.warn;
    });
    afterAll(() => {
        console.log = originalLog;
        console.warn = originalWarn;
    });
    beforeEach(async () => {
        logs = [];
        console.log = (...args) => logs.push(args.join(" "));
        console.warn = () => {};
        await db("injuries").del();
        await db("player_game_stats").del();
        await db("games").del();
        await db("team_season_stats").del();
        await db("seasons").del();
    });

    test("import_season skips post-import when skip_post_import is true", async () => {
        const { import_season } = await import("../../scripts/db-writer.js");

        fs.writeFileSync(TEST_OUTPUT_FILE, FIXTURE_GAMES.map((g) => JSON.stringify(g)).join("\n") + "\n");

        const result = await import_season(TEST_OUTPUT_FILE, {
            expected_games: 2,
            skip_post_import: true,
            db: db,
        });

        expect(result.season_id).toBeDefined();
        expect(result.games_saved).toBe(2);
        expect(result.is_complete).toBe(true);

        const team_stats = await db("team_season_stats").where("season_id", result.season_id);
        expect(team_stats.length).toBe(0);

        expect(logs.some((l) => l.includes("Updating team season stats"))).toBe(false);
        expect(logs.some((l) => l.includes("Refreshing player injury stats"))).toBe(false);
    });

    test("import_season runs post-import when skip_post_import is false", async () => {
        const { import_season } = await import("../../scripts/db-writer.js");

        fs.writeFileSync(TEST_OUTPUT_FILE, FIXTURE_GAMES.map((g) => JSON.stringify(g)).join("\n") + "\n");

        const result = await import_season(TEST_OUTPUT_FILE, {
            expected_games: 2,
            skip_post_import: false,
            db: db,
        });

        expect(result.season_id).toBeDefined();

        const team_stats = await db("team_season_stats").where("season_id", result.season_id);
        expect(team_stats.length).toBeGreaterThan(0);

        expect(logs.some((l) => l.includes("Updating team season stats"))).toBe(true);
        expect(logs.some((l) => l.includes("Refreshing player injury stats"))).toBe(true);
    });

    test("import_all_seasons processes multiple seasons with skip_post_import", async () => {
        const { import_all_seasons } = await import("../../scripts/db-writer.js");

        const file1 = "/tmp/tsb-test-multi-1.jsonl";
        const file2 = "/tmp/tsb-test-multi-2.jsonl";

        const game1 = FIXTURE_GAMES[0];
        const game2 = { ...FIXTURE_GAMES[0], p1_score: 20, p2_score: 10 };
        fs.writeFileSync(file1, [game1].map((g) => JSON.stringify(g)).join("\n") + "\n");
        fs.writeFileSync(file2, [game2].map((g) => JSON.stringify(g)).join("\n") + "\n");

        const results = await import_all_seasons([file1, file2], {
            expected_games: 1,
            skip_post_import: true,
            db: db,
        });

        expect(results.length).toBe(2);
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(true);

        const all_team_stats = await db("team_season_stats").select("*");
        expect(all_team_stats.length).toBe(0);

        expect(logs.some((l) => l.includes("Updating team season stats"))).toBe(false);
        expect(logs.some((l) => l.includes("Refreshing player injury stats"))).toBe(false);

        if (fs.existsSync(file1)) fs.unlinkSync(file1);
        if (fs.existsSync(file2)) fs.unlinkSync(file2);
    });

    test("import_all_seasons runs post-import after processing all seasons", async () => {
        const { import_all_seasons } = await import("../../scripts/db-writer.js");

        const file1 = "/tmp/tsb-test-multi-3.jsonl";
        const file2 = "/tmp/tsb-test-multi-4.jsonl";

        const game1 = FIXTURE_GAMES[0];
        const game2 = { ...FIXTURE_GAMES[0], p1_score: 20, p2_score: 10 };
        fs.writeFileSync(file1, [game1].map((g) => JSON.stringify(g)).join("\n") + "\n");
        fs.writeFileSync(file2, [game2].map((g) => JSON.stringify(g)).join("\n") + "\n");

        const results = await import_all_seasons([file1, file2], {
            expected_games: 1,
            skip_post_import: false,
            db: db,
        });

        expect(results.every((r) => r.success)).toBe(true);

        const all_team_stats = await db("team_season_stats").select("*");
        expect(all_team_stats.length).toBeGreaterThan(0);

        expect(logs.some((l) => l.includes("Updating team season stats"))).toBe(true);
        expect(logs.some((l) => l.includes("Refreshing player injury stats"))).toBe(true);

        if (fs.existsSync(file1)) fs.unlinkSync(file1);
        if (fs.existsSync(file2)) fs.unlinkSync(file2);
    });
});

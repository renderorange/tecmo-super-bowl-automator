/**
 * Tests for the SeasonRepository.
 */

import knex_init from "knex";
import fs from "fs";
import path from "path";

let db;
let SeasonRepository;
let repository;
const TEST_DB_PATH = path.join("/tmp", `tsb-season-repository-test-${process.pid}.db`);

const TEST_TEAMS = [
    { id: 0, name: "Bills", city: "Buffalo", abbreviation: "BUF", conference: "AFC", division: "East" },
    { id: 1, name: "Colts", city: "Indianapolis", abbreviation: "IND", conference: "AFC", division: "East" },
    { id: 2, name: "Dolphins", city: "Miami", abbreviation: "MIA", conference: "AFC", division: "East" },
];

const TEST_PLAYERS = [
    { id: 1, team_id: 0, name: "BUF QB1", position: "QB", position_detail: "QB1", jersey: 12 },
    { id: 2, team_id: 0, name: "BUF RB1", position: "RB", position_detail: "RB1", jersey: 34 },
    { id: 3, team_id: 0, name: "BUF K", position: "K", position_detail: "K", jersey: 1 },
    { id: 4, team_id: 0, name: "BUF P", position: "P", position_detail: "P", jersey: 2 },
    { id: 5, team_id: 1, name: "IND RILB", position: "LB", position_detail: "RILB", jersey: 55 },
];

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
    // Clean up test data
    await db("season_crashes").del();
    await db("injuries").del();
    await db("player_game_stats").del();
    await db("games").del();
    await db("team_season_stats").del();
    await db("seasons").del();
    repository.injury_state_cache.clear();
});

describe("SeasonRepository.create_season", () => {
    test("creates a season with default total games", async () => {
        const season_id = await repository.create_season();

        expect(season_id).toBeDefined();
        expect(typeof season_id).toBe("number");

        const season = await db("seasons").where("id", season_id).first();
        expect(season).toBeDefined();
        expect(season.status).toBe("running");
        expect(season.total_games).toBe(224);
    });

    test("creates a season with custom total games", async () => {
        const season_id = await repository.create_season(42);

        const season = await db("seasons").where("id", season_id).first();
        expect(season.total_games).toBe(42);
    });

    test("creates a season with explicit started_at", async () => {
        const started_at = "2026-03-26T16:23:29.000Z";
        const season_id = await repository.create_season(224, { started_at });

        const season = await db("seasons").where("id", season_id).first();
        expect(new Date(season.started_at).toISOString()).toBe(started_at);
    });
});

describe("SeasonRepository.complete_season", () => {
    test("marks season as completed with games count", async () => {
        const season_id = await repository.create_season();

        await repository.complete_season(season_id, 100);

        const season = await db("seasons").where("id", season_id).first();
        expect(season.status).toBe("completed");
        expect(season.games_completed).toBe(100);
        expect(season.completed_at).toBeDefined();
    });

    test("marks season as completed with explicit completed_at", async () => {
        const season_id = await repository.create_season();
        const completed_at = "2026-03-26T16:54:38.000Z";

        await repository.complete_season(season_id, 224, { completed_at });

        const season = await db("seasons").where("id", season_id).first();
        expect(new Date(season.completed_at).toISOString()).toBe(completed_at);
    });
});

describe("SeasonRepository.fail_season", () => {
    test("marks season as failed", async () => {
        const season_id = await repository.create_season();

        await repository.fail_season(season_id);

        const season = await db("seasons").where("id", season_id).first();
        expect(season.status).toBe("failed");
    });
});

describe("SeasonRepository.save_game", () => {
    test("saves a game with basic info", async () => {
        const season_id = await repository.create_season();

        const game_data = {
            p1_team_id: 0,
            p2_team_id: 1,
            p1_team: "BUF",
            p2_team: "IND",
            p1_score: 21,
            p2_score: 14,
            week: 0,
            game_in_week: 0,
            p1_players: {},
            p2_players: {},
        };

        const game_id = await repository.save_game(season_id, game_data);

        expect(game_id).toBeDefined();

        const game = await db("games").where("id", game_id).first();
        expect(game.season_id).toBe(season_id);
        expect(game.week).toBe(1); // Converted to 1-based
        expect(game.home_team_id).toBe(0);
        expect(game.away_team_id).toBe(1);
        expect(game.home_score).toBe(21);
        expect(game.away_score).toBe(14);
        expect(game.game_in_week).toBe(0);
    });

    test("saves player stats for QB", async () => {
        const season_id = await repository.create_season();

        const game_data = {
            p1_team_id: 0,
            p2_team_id: 1,
            p1_team: "BUF",
            p2_team: "IND",
            p1_score: 21,
            p2_score: 14,
            week: 0,
            game_in_week: 0,
            p1_players: {
                qb1: {
                    passing_attempts: 25,
                    passing_completions: 15,
                    passing_yards: 210,
                    passing_tds: 2,
                    interceptions_thrown: 1,
                    rushing_attempts: 3,
                    rushing_yards: 15,
                    rushing_tds: 0,
                },
            },
            p2_players: {},
        };

        await repository.save_game(season_id, game_data);

        // Find the QB1 player for team 0 (Bills)
        const qb = await db("players").where({ team_id: 0, position_detail: "QB1" }).first();
        expect(qb).toBeDefined();

        const stats = await db("player_game_stats").where("player_id", qb.id).first();

        expect(stats).toBeDefined();
        expect(stats.passing_attempts).toBe(25);
        expect(stats.passing_completions).toBe(15);
        expect(stats.passing_yards).toBe(210);
        expect(stats.passing_tds).toBe(2);
        expect(stats.interceptions_thrown).toBe(1);
        expect(stats.rushing_attempts).toBe(3);
        expect(stats.rushing_yards).toBe(15);
    });

    test("saves player stats for RB", async () => {
        const season_id = await repository.create_season();

        const game_data = {
            p1_team_id: 0,
            p2_team_id: 1,
            p1_team: "BUF",
            p2_team: "IND",
            p1_score: 21,
            p2_score: 14,
            week: 0,
            game_in_week: 0,
            p1_players: {
                rb1: {
                    rushing_attempts: 20,
                    rushing_yards: 120,
                    rushing_tds: 1,
                    receptions: 3,
                    receiving_yards: 25,
                    receiving_tds: 0,
                    kick_return_attempts: 2,
                    kick_return_yards: 45,
                    kick_return_tds: 0,
                    punt_return_attempts: 1,
                    punt_return_yards: 10,
                    punt_return_tds: 0,
                },
            },
            p2_players: {},
        };

        await repository.save_game(season_id, game_data);

        const rb = await db("players").where({ team_id: 0, position_detail: "RB1" }).first();
        expect(rb).toBeDefined();

        const stats = await db("player_game_stats").where("player_id", rb.id).first();

        expect(stats).toBeDefined();
        expect(stats.rushing_attempts).toBe(20);
        expect(stats.rushing_yards).toBe(120);
        expect(stats.rushing_tds).toBe(1);
        expect(stats.receptions).toBe(3);
        expect(stats.receiving_yards).toBe(25);
        expect(stats.kick_return_attempts).toBe(2);
        expect(stats.kick_return_yards).toBe(45);
        expect(stats.punt_return_attempts).toBe(1);
        expect(stats.punt_return_yards).toBe(10);
    });

    test("saves player stats for defense", async () => {
        const season_id = await repository.create_season();

        const game_data = {
            p1_team_id: 0,
            p2_team_id: 1,
            p1_team: "BUF",
            p2_team: "IND",
            p1_score: 21,
            p2_score: 14,
            week: 0,
            game_in_week: 0,
            p1_players: {},
            p2_players: {
                rilb: {
                    sacks: 2,
                    interceptions: 1,
                    interception_return_yards: 25,
                    interception_return_tds: 1,
                },
            },
        };

        await repository.save_game(season_id, game_data);

        const lb = await db("players").where({ team_id: 1, position_detail: "RILB" }).first();
        expect(lb).toBeDefined();

        const stats = await db("player_game_stats").where("player_id", lb.id).first();

        expect(stats).toBeDefined();
        expect(stats.sacks).toBe(2);
        expect(stats.interceptions).toBe(1);
        expect(stats.interception_return_yards).toBe(25);
        expect(stats.interception_return_tds).toBe(1);
    });

    test("saves player stats for kicker", async () => {
        const season_id = await repository.create_season();

        const game_data = {
            p1_team_id: 0,
            p2_team_id: 1,
            p1_team: "BUF",
            p2_team: "IND",
            p1_score: 21,
            p2_score: 14,
            week: 0,
            game_in_week: 0,
            p1_players: {
                k: {
                    xp_attempts: 3,
                    xp_made: 3,
                    fg_attempts: 2,
                    fg_made: 1,
                },
            },
            p2_players: {},
        };

        await repository.save_game(season_id, game_data);

        const kicker = await db("players").where({ team_id: 0, position_detail: "K" }).first();
        expect(kicker).toBeDefined();

        const stats = await db("player_game_stats").where("player_id", kicker.id).first();

        expect(stats).toBeDefined();
        expect(stats.xp_attempts).toBe(3);
        expect(stats.xp_made).toBe(3);
        expect(stats.fg_attempts).toBe(2);
        expect(stats.fg_made).toBe(1);
    });

    test("saves player stats for punter", async () => {
        const season_id = await repository.create_season();

        const game_data = {
            p1_team_id: 0,
            p2_team_id: 1,
            p1_team: "BUF",
            p2_team: "IND",
            p1_score: 21,
            p2_score: 14,
            week: 0,
            game_in_week: 0,
            p1_players: {
                p: {
                    punts: 5,
                    punt_yards: 210,
                },
            },
            p2_players: {},
        };

        await repository.save_game(season_id, game_data);

        const punter = await db("players").where({ team_id: 0, position_detail: "P" }).first();
        expect(punter).toBeDefined();

        const stats = await db("player_game_stats").where("player_id", punter.id).first();

        expect(stats).toBeDefined();
        expect(stats.punts).toBe(5);
        expect(stats.punt_yards).toBe(210);
    });
});

describe("SeasonRepository.log_crash", () => {
    test("records crash and marks season as failed", async () => {
        const season_id = await repository.create_season();

        const crash_id = await repository.log_crash({
            season_id: season_id,
            games_completed: 42,
            last_week: 3,
            error_message: "nesl exited with code 139: segfault",
            error_stack: "Error: nesl exited...\n    at Emulator.run",
            emulator_stderr: "Segmentation fault (core dumped)",
            error_source: "emulator",
        });

        expect(crash_id).toBeDefined();
        expect(typeof crash_id).toBe("number");

        // Verify crash record
        const crash = await db("season_crashes").where("id", crash_id).first();
        expect(crash.season_id).toBe(season_id);
        expect(crash.games_completed).toBe(42);
        expect(crash.last_week).toBe(3);
        expect(crash.error_message).toBe("nesl exited with code 139: segfault");
        expect(crash.error_stack).toContain("Emulator.run");
        expect(crash.emulator_stderr).toBe("Segmentation fault (core dumped)");
        expect(crash.error_source).toBe("emulator");

        // Verify season is marked as failed
        const season = await db("seasons").where("id", season_id).first();
        expect(season.status).toBe("failed");
    });

    test("requires season_id", async () => {
        await expect(repository.log_crash({ games_completed: 0 })).rejects.toThrow("log_crash requires season_id");
    });

    test("handles minimal crash data", async () => {
        const season_id = await repository.create_season();

        const crash_id = await repository.log_crash({
            season_id: season_id,
        });

        const crash = await db("season_crashes").where("id", crash_id).first();
        expect(crash.season_id).toBe(season_id);
        expect(crash.games_completed).toBe(0);
        expect(crash.error_source).toBe("unknown");
    });
});

describe("SeasonRepository.update_team_season_stats", () => {
    test("aggregates team records from games", async () => {
        const season_id = await repository.create_season();

        // Create two games
        await repository.save_game(season_id, {
            p1_team_id: 0,
            p2_team_id: 1,
            p1_score: 21,
            p2_score: 14,
            week: 0,
            p1_players: {},
            p2_players: {},
        });

        await repository.save_game(season_id, {
            p1_team_id: 0,
            p2_team_id: 2,
            p1_score: 10,
            p2_score: 24,
            week: 1,
            p1_players: {},
            p2_players: {},
        });

        await repository.update_team_season_stats(season_id);

        const team0_stats = await db("team_season_stats").where({ season_id, team_id: 0 }).first();

        expect(team0_stats.wins).toBe(1);
        expect(team0_stats.losses).toBe(1);
        expect(team0_stats.points_for).toBe(31);
        expect(team0_stats.points_against).toBe(38);
        expect(team0_stats.home_wins).toBe(1);
        expect(team0_stats.home_losses).toBe(1);
    });

    test("handles ties correctly", async () => {
        const season_id = await repository.create_season();

        await repository.save_game(season_id, {
            p1_team_id: 0,
            p2_team_id: 1,
            p1_score: 17,
            p2_score: 17,
            week: 0,
            p1_players: {},
            p2_players: {},
        });

        await repository.update_team_season_stats(season_id);

        const team0_stats = await db("team_season_stats").where({ season_id, team_id: 0 }).first();

        expect(team0_stats.ties).toBe(1);
        expect(team0_stats.wins).toBe(0);
        expect(team0_stats.losses).toBe(0);
    });
});

describe("SeasonRepository.get_season_summary", () => {
    test("returns season with standings sorted by wins", async () => {
        const season_id = await repository.create_season();

        await repository.save_game(season_id, {
            p1_team_id: 0,
            p2_team_id: 1,
            p1_score: 35,
            p2_score: 7,
            week: 0,
            p1_players: {},
            p2_players: {},
        });

        await repository.update_team_season_stats(season_id);
        await repository.complete_season(season_id, 1);

        const summary = await repository.get_season_summary(season_id);

        expect(summary.season).toBeDefined();
        expect(summary.standings).toHaveLength(2);
        expect(summary.standings[0].wins).toBe(1);
        expect(summary.standings[1].losses).toBe(1);
    });

    test("returns null for non-existent season", async () => {
        const summary = await repository.get_season_summary(99999);
        expect(summary).toBeNull();
    });
});

describe("SeasonRepository.get_all_seasons", () => {
    test("returns all seasons ordered by id", async () => {
        const season_id1 = await repository.create_season();
        const season_id2 = await repository.create_season();
        const season_id3 = await repository.create_season();

        await repository.complete_season(season_id1, 224);
        await repository.complete_season(season_id2, 224);

        const seasons = await repository.get_all_seasons();

        expect(seasons).toHaveLength(3);
        expect(seasons[0].id).toBe(season_id1);
        expect(seasons[1].id).toBe(season_id2);
        expect(seasons[2].id).toBe(season_id3);
        expect(seasons[0].status).toBe("completed");
        expect(seasons[2].status).toBe("running");
    });

    test("returns empty array when no seasons exist", async () => {
        const seasons = await repository.get_all_seasons();
        expect(seasons).toEqual([]);
    });
});

describe("POSITION_KEY_MAP", () => {
    test("maps all emulator position keys to database values", async () => {
        const mod = await import("../../src/db/season-repository.js");
        const POSITION_KEY_MAP = mod.POSITION_KEY_MAP;

        expect(POSITION_KEY_MAP.qb1).toBe("QB1");
        expect(POSITION_KEY_MAP.qb2).toBe("QB2");
        expect(POSITION_KEY_MAP.rb1).toBe("RB1");
        expect(POSITION_KEY_MAP.wr1).toBe("WR1");
        expect(POSITION_KEY_MAP.te1).toBe("TE1");
        expect(POSITION_KEY_MAP.re).toBe("RE");
        expect(POSITION_KEY_MAP.nt).toBe("NT");
        expect(POSITION_KEY_MAP.rolb).toBe("ROLB");
        expect(POSITION_KEY_MAP.rilb).toBe("RILB");
        expect(POSITION_KEY_MAP.fs).toBe("FS");
        expect(POSITION_KEY_MAP.ss).toBe("SS");
        expect(POSITION_KEY_MAP.k).toBe("K");
        expect(POSITION_KEY_MAP.p).toBe("P");
    });
});

describe("SeasonRepository injury detection", () => {
    const make_game_data = (week, team_id, injury_detail) => ({
        p1_team_id: team_id,
        p2_team_id: team_id === 0 ? 1 : 0,
        p1_score: 14,
        p2_score: 7,
        week: week,
        game_in_week: 0,
        p1_players: {
            qb1: {
                passing_attempts: 10,
                passing_completions: 5,
                passing_yards: 80,
                passing_tds: 1,
                interceptions_thrown: 0,
                rushing_attempts: 1,
                rushing_yards: 3,
                rushing_tds: 0,
            },
        },
        p2_players: {},
        p1_injury_detail: injury_detail,
        p2_injury_detail: {},
    });

    test("detects new injury when player transitions from healthy to injured", async () => {
        const season_id = await repository.create_season();

        // Game 1: QB1 healthy
        await repository.save_game(season_id, make_game_data(0, 0, { qb1: 0 }));

        // Game 2: QB1 doubtful
        await repository.save_game(season_id, make_game_data(1, 0, { qb1: 3 }));

        const injuries = await db("injuries").where({ season_id });
        expect(injuries).toHaveLength(1);
        expect(injuries[0].player_id).toBe(1); // BUF QB1
        expect(injuries[0].week_injured).toBe(2); // week 1 (0-based) + 1 = 2
    });

    test("does not create duplicate injury for already-injured player", async () => {
        const season_id = await repository.create_season();

        // Game 1: QB1 questionable (first appearance already injured)
        await repository.save_game(season_id, make_game_data(0, 0, { qb1: 2 }));

        // Game 2: QB1 still injured (doubtful)
        await repository.save_game(season_id, make_game_data(1, 0, { qb1: 3 }));

        const injuries = await db("injuries").where({ season_id });
        expect(injuries).toHaveLength(1); // Only from game 1 (default 0 -> 2)
    });

    test("creates new injury record when player recovers then re-injured", async () => {
        const season_id = await repository.create_season();

        // Game 1: QB1 questionable (new injury: default 0 -> 2)
        await repository.save_game(season_id, make_game_data(0, 0, { qb1: 2 }));

        // Game 2: QB1 recovered
        await repository.save_game(season_id, make_game_data(1, 0, { qb1: 0 }));

        // Game 3: QB1 re-injured (doubtful, new injury: 0 -> 3)
        await repository.save_game(season_id, make_game_data(2, 0, { qb1: 3 }));

        const injuries = await db("injuries").where({ season_id }).orderBy("week_injured");
        expect(injuries).toHaveLength(2);
        expect(injuries[0].week_injured).toBe(1); // week 0 + 1
        expect(injuries[1].week_injured).toBe(3); // week 2 + 1
    });

    test("does not create injury record for healthy players", async () => {
        const season_id = await repository.create_season();

        // Game 1: QB1 healthy
        await repository.save_game(season_id, make_game_data(0, 0, { qb1: 0 }));

        const injuries = await db("injuries").where({ season_id });
        expect(injuries).toHaveLength(0);
    });
});

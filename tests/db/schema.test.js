/**
 * Tests for the database schema and seed data.
 *
 * These tests run against the actual seeded database (data/stats.db)
 * to verify the migration and seed process produced correct results.
 */

import knex_init from "knex";

let db;

beforeAll(async () => {
    const config = (await import("../../knexfile.js")).default;
    db = knex_init(config);
});

afterAll(async () => {
    await db.destroy();
});

describe("schema tables exist", () => {
    const expected_tables = ["teams", "players", "seasons", "team_season_stats", "games", "player_game_stats", "injuries"];

    for (const table of expected_tables) {
        test(`${table} table exists`, async () => {
            const exists = await db.schema.hasTable(table);
            expect(exists).toBe(true);
        });
    }
});

describe("teams", () => {
    test("has 28 teams", async () => {
        const count = await db("teams").count("* as count").first();
        expect(count.count).toBe(28);
    });

    test("has 14 AFC teams", async () => {
        const count = await db("teams").where("conference", "AFC").count("* as count").first();
        expect(count.count).toBe(14);
    });

    test("has 14 NFC teams", async () => {
        const count = await db("teams").where("conference", "NFC").count("* as count").first();
        expect(count.count).toBe(14);
    });

    test("every team has a city, name, and abbreviation", async () => {
        const teams = await db("teams").select("*");
        for (const team of teams) {
            expect(team.city).toBeTruthy();
            expect(team.name).toBeTruthy();
            expect(team.abbreviation).toBeTruthy();
        }
    });

    test("49ers are in NFC West", async () => {
        const sf = await db("teams").where("abbreviation", "SF").first();
        expect(sf).toBeDefined();
        expect(sf.conference).toBe("NFC");
        expect(sf.division).toBe("West");
    });

    test("Bills are in AFC East", async () => {
        const buf = await db("teams").where("abbreviation", "BUF").first();
        expect(buf).toBeDefined();
        expect(buf.conference).toBe("AFC");
        expect(buf.division).toBe("East");
    });
});

describe("players", () => {
    test("has 840 players", async () => {
        const count = await db("players").count("* as count").first();
        expect(count.count).toBe(840);
    });

    test("every team has exactly 30 players", async () => {
        const counts = await db("players").select("team_id").count("* as count").groupBy("team_id");

        expect(counts.length).toBe(28);
        for (const row of counts) {
            expect(row.count).toBe(30);
        }
    });

    test("has 56 QBs (2 per team)", async () => {
        const count = await db("players").where("position", "QB").count("* as count").first();
        expect(count.count).toBe(56);
    });

    test("every player has speed attributes", async () => {
        const missing = await db("players")
            .whereNull("rushing_power")
            .orWhereNull("running_speed")
            .orWhereNull("maximum_speed")
            .orWhereNull("hitting_power")
            .count("* as count")
            .first();

        expect(missing.count).toBe(0);
    });

    test("all attribute values are in the valid 16-notch scale", async () => {
        const valid_values = [6, 13, 19, 25, 31, 38, 44, 50, 56, 63, 69, 75, 81, 88, 94, 100];
        const attr_columns = ["rushing_power", "running_speed", "maximum_speed", "hitting_power"];

        for (const col of attr_columns) {
            const values = await db("players").distinct(col).orderBy(col);
            for (const row of values) {
                if (row[col] !== null) {
                    expect(valid_values).toContain(row[col]);
                }
            }
        }
    });

    test("QBs have passing attributes", async () => {
        const qbs = await db("players").where("position", "QB").select("*");
        for (const qb of qbs) {
            expect(qb.passing_speed).not.toBeNull();
            expect(qb.pass_control).not.toBeNull();
            expect(qb.avoid_pass_block).not.toBeNull();
        }
    });

    test("non-QBs do not have passing attributes", async () => {
        const non_qbs = await db("players").whereNot("position", "QB").whereNotNull("pass_control").count("* as count").first();

        expect(non_qbs.count).toBe(0);
    });

    test("RBs, WRs, TEs have ball_control and receptions", async () => {
        const skill_positions = await db("players").whereIn("position", ["RB", "WR", "TE"]).select("*");

        for (const p of skill_positions) {
            expect(p.ball_control).not.toBeNull();
            expect(p.receptions).not.toBeNull();
        }
    });

    test("DL, LB, DB have pass_interceptions", async () => {
        const defenders = await db("players").whereIn("position", ["DL", "LB", "DB"]).select("*");

        for (const p of defenders) {
            expect(p.pass_interceptions).not.toBeNull();
        }
    });

    test("K and P have kicking_ability", async () => {
        const kickers = await db("players").whereIn("position", ["K", "P"]).select("*");

        for (const p of kickers) {
            expect(p.kicking_ability).not.toBeNull();
            expect(p.avoid_kick_block).not.toBeNull();
        }
    });
});

describe("known player spot checks", () => {
    test("Joe Montana has correct attributes", async () => {
        const p = await db("players").where("name", "Joe Montana").first();
        expect(p).toBeDefined();
        expect(p.position).toBe("QB");
        expect(p.rushing_power).toBe(69);
        expect(p.running_speed).toBe(25);
        expect(p.maximum_speed).toBe(19);
        expect(p.hitting_power).toBe(13);
        expect(p.passing_speed).toBe(56);
        expect(p.pass_control).toBe(81);
        expect(p.accuracy_of_passing).toBe(81);
        expect(p.avoid_pass_block).toBe(75);
    });

    test("Thurman Thomas has correct attributes", async () => {
        const p = await db("players").where("name", "Thurman Thomas").first();
        expect(p).toBeDefined();
        expect(p.position).toBe("RB");
        expect(p.rushing_power).toBe(69);
        expect(p.running_speed).toBe(38);
        expect(p.maximum_speed).toBe(63);
        expect(p.hitting_power).toBe(25);
        expect(p.ball_control).toBe(75);
        expect(p.receptions).toBe(50);
    });

    test("Bo Jackson has correct attributes", async () => {
        const p = await db("players").where("name", "Bo Jackson").first();
        expect(p).toBeDefined();
        expect(p.position).toBe("RB");
        expect(p.maximum_speed).toBe(75);
        expect(p.hitting_power).toBe(31);
        expect(p.ball_control).toBe(81);
    });

    test("Lawrence Taylor has correct attributes", async () => {
        const p = await db("players").where("name", "Lawrence Taylor").first();
        expect(p).toBeDefined();
        expect(p.position).toBe("LB");
        expect(p.hitting_power).toBe(75);
    });

    test("previously missing players are present", async () => {
        const names = ["Ivy Joe Hunter", "Steve De Berg", "John L. Williams", "Harper Le Bel", "Hart Lee Dykes"];

        for (const name of names) {
            const results = await db("players").whereRaw("LOWER(name) = ?", [name.toLowerCase()]).count("* as count").first();

            expect(results.count).toBeGreaterThanOrEqual(1);
        }
    });
});

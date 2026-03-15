/**
 * Initial schema for the Tecmo Super Bowl season simulator.
 *
 * Tables:
 *   teams           - 28 NFL teams (static reference data from ROM)
 *   players         - 840 players with all ROM attributes (static reference data)
 *   seasons         - each simulated season run
 *   team_season_stats - win/loss/points aggregates per team per season
 *   games           - individual game results within a season
 *   player_game_stats - per-player per-game stat lines
 *   injuries        - injury tracking per game
 */

export function up (knex) {
    return knex.schema
        .createTable("teams", (table) => {
            table.integer("id")
                .primary();
            table.string("name")
                .notNullable();
            table.string("city")
                .notNullable();
            table.string("abbreviation")
                .notNullable();
            table.string("conference")
                .notNullable();
            table.string("division")
                .notNullable();
        })

        .createTable("players", (table) => {
            table.integer("id")
                .primary();
            table.integer("team_id")
                .notNullable()
                .references("id")
                .inTable("teams");
            table.string("name")
                .notNullable();
            table.string("position")
                .notNullable();
            table.string("position_detail")
                .notNullable();
            table.integer("jersey")
                .notNullable();
            table.integer("face");

            // ROM offsets (for debugging / cross-referencing)
            table.integer("name_rom_offset");
            table.integer("ability_rom_offset");

            // Speed attributes (all positions)
            table.integer("rushing_power");
            table.integer("running_speed");
            table.integer("maximum_speed");
            table.integer("hitting_power");

            // QB-only attributes
            table.integer("passing_speed");
            table.integer("pass_control");
            table.integer("accuracy_of_passing");
            table.integer("avoid_pass_block");

            // Skill position attributes (RB, WR, TE)
            table.integer("ball_control");
            table.integer("receptions");

            // Defensive attributes (DL, LB, DB)
            table.integer("pass_interceptions");
            table.integer("quickness");

            // Special teams attributes (K, P)
            table.integer("kicking_ability");
            table.integer("avoid_kick_block");

            table.index("team_id");
            table.index("position");
        })

        .createTable("seasons", (table) => {
            table.increments("id")
                .primary();
            table.timestamp("started_at")
                .defaultTo(knex.fn.now());
            table.timestamp("completed_at");
            table.integer("games_completed")
                .defaultTo(0);
            table.integer("total_games")
                .defaultTo(240); // 15 weeks * 16 games/week (some teams have byes)
            table.string("status")
                .defaultTo("pending"); // pending, running, completed, failed
        })

        .createTable("team_season_stats", (table) => {
            table.increments("id")
                .primary();
            table.integer("season_id")
                .notNullable()
                .references("id")
                .inTable("seasons");
            table.integer("team_id")
                .notNullable()
                .references("id")
                .inTable("teams");
            table.integer("wins")
                .defaultTo(0);
            table.integer("losses")
                .defaultTo(0);
            table.integer("ties")
                .defaultTo(0);
            table.integer("points_for")
                .defaultTo(0);
            table.integer("points_against")
                .defaultTo(0);
            table.integer("home_wins")
                .defaultTo(0);
            table.integer("home_losses")
                .defaultTo(0);
            table.integer("away_wins")
                .defaultTo(0);
            table.integer("away_losses")
                .defaultTo(0);

            table.unique(["season_id", "team_id"]);
        })

        .createTable("games", (table) => {
            table.increments("id")
                .primary();
            table.integer("season_id")
                .notNullable()
                .references("id")
                .inTable("seasons");
            table.integer("week")
                .notNullable();
            table.integer("home_team_id")
                .notNullable()
                .references("id")
                .inTable("teams");
            table.integer("away_team_id")
                .notNullable()
                .references("id")
                .inTable("teams");
            table.integer("home_score");
            table.integer("away_score");
            table.boolean("is_overtime")
                .defaultTo(false);

            // Team-level box score stats
            table.integer("home_first_downs");
            table.integer("away_first_downs");
            table.integer("home_rushing_attempts");
            table.integer("home_rushing_yards");
            table.integer("away_rushing_attempts");
            table.integer("away_rushing_yards");
            table.integer("home_passing_yards");
            table.integer("away_passing_yards");
            table.integer("home_penalty_yards");
            table.integer("away_penalty_yards");
            table.integer("home_turnovers");
            table.integer("away_turnovers");

            table.index(["season_id", "week"]);
            table.index("home_team_id");
            table.index("away_team_id");
        })

        .createTable("player_game_stats", (table) => {
            table.increments("id")
                .primary();
            table.integer("game_id")
                .notNullable()
                .references("id")
                .inTable("games");
            table.integer("player_id")
                .notNullable()
                .references("id")
                .inTable("players");

            // Rushing
            table.integer("rushing_attempts")
                .defaultTo(0);
            table.integer("rushing_yards")
                .defaultTo(0);
            table.integer("rushing_tds")
                .defaultTo(0);

            // Receiving
            table.integer("receptions")
                .defaultTo(0);
            table.integer("receiving_yards")
                .defaultTo(0);
            table.integer("receiving_tds")
                .defaultTo(0);

            // Passing
            table.integer("passing_attempts")
                .defaultTo(0);
            table.integer("passing_completions")
                .defaultTo(0);
            table.integer("passing_yards")
                .defaultTo(0);
            table.integer("passing_tds")
                .defaultTo(0);
            table.integer("interceptions_thrown")
                .defaultTo(0);

            // Returns
            table.integer("kick_return_yards")
                .defaultTo(0);
            table.integer("kick_return_tds")
                .defaultTo(0);
            table.integer("punt_return_yards")
                .defaultTo(0);
            table.integer("punt_return_tds")
                .defaultTo(0);

            // Defense
            table.integer("tackles")
                .defaultTo(0);
            table.integer("sacks")
                .defaultTo(0);
            table.integer("interceptions")
                .defaultTo(0);

            // Other
            table.integer("fumbles")
                .defaultTo(0);
            table.boolean("is_injured")
                .defaultTo(false);

            table.index("game_id");
            table.index("player_id");
        })

        .createTable("injuries", (table) => {
            table.increments("id")
                .primary();
            table.integer("season_id")
                .notNullable()
                .references("id")
                .inTable("seasons");
            table.integer("game_id")
                .notNullable()
                .references("id")
                .inTable("games");
            table.integer("player_id")
                .notNullable()
                .references("id")
                .inTable("players");
            table.integer("week_injured")
                .notNullable();
            table.integer("games_missed")
                .defaultTo(0);

            table.index(["season_id", "player_id"]);
        });
}

export function down (knex) {
    return knex.schema
        .dropTableIfExists("injuries")
        .dropTableIfExists("player_game_stats")
        .dropTableIfExists("games")
        .dropTableIfExists("team_season_stats")
        .dropTableIfExists("seasons")
        .dropTableIfExists("players")
        .dropTableIfExists("teams");
}

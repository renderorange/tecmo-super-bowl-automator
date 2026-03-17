/**
 * Initial schema for Tecmo Super Bowl season simulator.
 *
 * Tables:
 *   teams           - 28 NFL teams (static reference data from ROM)
 *   players         - 840 players with all ROM attributes (static reference data)
 *   seasons         - each simulated season run
 *   team_season_stats - win/loss/points aggregates per team per season
 *   games           - individual game results within a season
 *   player_game_stats - per-player per-game stat lines
 *   injuries        - injury tracking per game
 *   season_crashes  - crash diagnostics for failed seasons
 */

export function up(knex) {
    return knex.schema
        .createTable("teams", (table) => {
            table.integer("id").primary();
            table.string("name").notNullable();
            table.string("city").notNullable();
            table.string("abbreviation").notNullable();
            table.string("conference").notNullable();
            table.string("division").notNullable();
        })

        .createTable("players", (table) => {
            table.integer("id").primary();
            table.integer("team_id").notNullable().references("id").inTable("teams");
            table.string("name").notNullable();
            table.string("position").notNullable();
            table.string("position_detail").notNullable();
            table.integer("jersey").notNullable();
            table.integer("face");

            table.integer("name_rom_offset");
            table.integer("ability_rom_offset");

            table.integer("rushing_power");
            table.integer("running_speed");
            table.integer("maximum_speed");
            table.integer("hitting_power");

            table.integer("passing_speed");
            table.integer("pass_control");
            table.integer("accuracy_of_passing");
            table.integer("avoid_pass_block");

            table.integer("ball_control");
            table.integer("receptions");

            table.integer("pass_interceptions");
            table.integer("quickness");

            table.integer("kicking_ability");
            table.integer("avoid_kick_block");

            table.index("team_id");
            table.index("position");
        })

        .createTable("seasons", (table) => {
            table.increments("id").primary();
            table.timestamp("started_at").defaultTo(knex.fn.now());
            table.timestamp("completed_at");
            table.integer("games_completed").defaultTo(0);
            table.integer("total_games").defaultTo(240);
            table.string("status").defaultTo("pending");
        })

        .createTable("team_season_stats", (table) => {
            table.increments("id").primary();
            table.integer("season_id").notNullable().references("id").inTable("seasons");
            table.integer("team_id").notNullable().references("id").inTable("teams");
            table.integer("wins").defaultTo(0);
            table.integer("losses").defaultTo(0);
            table.integer("ties").defaultTo(0);
            table.integer("points_for").defaultTo(0);
            table.integer("points_against").defaultTo(0);
            table.integer("home_wins").defaultTo(0);
            table.integer("home_losses").defaultTo(0);
            table.integer("away_wins").defaultTo(0);
            table.integer("away_losses").defaultTo(0);

            table.unique(["season_id", "team_id"]);
        })

        .createTable("games", (table) => {
            table.increments("id").primary();
            table.integer("season_id").notNullable().references("id").inTable("seasons");
            table.integer("week").notNullable();
            table.integer("home_team_id").notNullable().references("id").inTable("teams");
            table.integer("away_team_id").notNullable().references("id").inTable("teams");
            table.integer("home_score");
            table.integer("away_score");
            table.boolean("is_overtime").defaultTo(false);

            // Home team stats
            table.integer("home_rushing_attempts").defaultTo(0);
            table.integer("home_rushing_yards").defaultTo(0);
            table.integer("home_rushing_tds").defaultTo(0);
            table.integer("home_passing_attempts").defaultTo(0);
            table.integer("home_passing_completions").defaultTo(0);
            table.integer("home_passing_yards").defaultTo(0);
            table.integer("home_passing_tds").defaultTo(0);
            table.integer("home_interceptions_thrown").defaultTo(0);
            table.integer("home_receptions").defaultTo(0);
            table.integer("home_receiving_yards").defaultTo(0);
            table.integer("home_receiving_tds").defaultTo(0);
            table.integer("home_sacks").defaultTo(0);
            table.integer("home_interceptions").defaultTo(0);
            table.integer("home_interception_return_yards").defaultTo(0);
            table.integer("home_interception_return_tds").defaultTo(0);
            table.integer("home_kick_return_yards").defaultTo(0);
            table.integer("home_kick_return_tds").defaultTo(0);
            table.integer("home_punt_return_yards").defaultTo(0);
            table.integer("home_punt_return_tds").defaultTo(0);
            table.integer("home_punts").defaultTo(0);
            table.integer("home_punt_yards").defaultTo(0);
            table.integer("home_xp_attempts").defaultTo(0);
            table.integer("home_xp_made").defaultTo(0);
            table.integer("home_fg_attempts").defaultTo(0);
            table.integer("home_fg_made").defaultTo(0);
            table.integer("home_tracked_pts").defaultTo(0);
            table.integer("home_untracked_pts").defaultTo(0);

            // Away team stats
            table.integer("away_rushing_attempts").defaultTo(0);
            table.integer("away_rushing_yards").defaultTo(0);
            table.integer("away_rushing_tds").defaultTo(0);
            table.integer("away_passing_attempts").defaultTo(0);
            table.integer("away_passing_completions").defaultTo(0);
            table.integer("away_passing_yards").defaultTo(0);
            table.integer("away_passing_tds").defaultTo(0);
            table.integer("away_interceptions_thrown").defaultTo(0);
            table.integer("away_receptions").defaultTo(0);
            table.integer("away_receiving_yards").defaultTo(0);
            table.integer("away_receiving_tds").defaultTo(0);
            table.integer("away_sacks").defaultTo(0);
            table.integer("away_interceptions").defaultTo(0);
            table.integer("away_interception_return_yards").defaultTo(0);
            table.integer("away_interception_return_tds").defaultTo(0);
            table.integer("away_kick_return_yards").defaultTo(0);
            table.integer("away_kick_return_tds").defaultTo(0);
            table.integer("away_punt_return_yards").defaultTo(0);
            table.integer("away_punt_return_tds").defaultTo(0);
            table.integer("away_punts").defaultTo(0);
            table.integer("away_punt_yards").defaultTo(0);
            table.integer("away_xp_attempts").defaultTo(0);
            table.integer("away_xp_made").defaultTo(0);
            table.integer("away_fg_attempts").defaultTo(0);
            table.integer("away_fg_made").defaultTo(0);
            table.integer("away_tracked_pts").defaultTo(0);
            table.integer("away_untracked_pts").defaultTo(0);

            // Pre-game records
            table.integer("home_pre_wins").defaultTo(0);
            table.integer("home_pre_losses").defaultTo(0);
            table.integer("home_pre_ties").defaultTo(0);
            table.integer("home_pre_points_for").defaultTo(0);
            table.integer("home_pre_points_against").defaultTo(0);
            table.integer("away_pre_wins").defaultTo(0);
            table.integer("away_pre_losses").defaultTo(0);
            table.integer("away_pre_ties").defaultTo(0);
            table.integer("away_pre_points_for").defaultTo(0);
            table.integer("away_pre_points_against").defaultTo(0);

            table.index(["season_id", "week"]);
            table.index("home_team_id");
            table.index("away_team_id");
        })

        .createTable("player_game_stats", (table) => {
            table.increments("id").primary();
            table.integer("game_id").notNullable().references("id").inTable("games");
            table.integer("player_id").notNullable().references("id").inTable("players");

            table.integer("rushing_attempts").defaultTo(0);
            table.integer("rushing_yards").defaultTo(0);
            table.integer("rushing_tds").defaultTo(0);

            table.integer("receptions").defaultTo(0);
            table.integer("receiving_yards").defaultTo(0);
            table.integer("receiving_tds").defaultTo(0);

            table.integer("passing_attempts").defaultTo(0);
            table.integer("passing_completions").defaultTo(0);
            table.integer("passing_yards").defaultTo(0);
            table.integer("passing_tds").defaultTo(0);
            table.integer("interceptions_thrown").defaultTo(0);

            table.integer("kick_return_attempts").defaultTo(0);
            table.integer("kick_return_yards").defaultTo(0);
            table.integer("kick_return_tds").defaultTo(0);
            table.integer("punt_return_attempts").defaultTo(0);
            table.integer("punt_return_yards").defaultTo(0);
            table.integer("punt_return_tds").defaultTo(0);

            table.integer("tackles").defaultTo(0);
            table.integer("sacks").defaultTo(0);
            table.integer("interceptions").defaultTo(0);
            table.integer("interception_return_yards").defaultTo(0);
            table.integer("interception_return_tds").defaultTo(0);

            // Kicking
            table.integer("xp_attempts").defaultTo(0);
            table.integer("xp_made").defaultTo(0);
            table.integer("fg_attempts").defaultTo(0);
            table.integer("fg_made").defaultTo(0);

            // Punting
            table.integer("punts").defaultTo(0);
            table.integer("punt_yards").defaultTo(0);

            table.integer("fumbles").defaultTo(0);
            table.boolean("is_injured").defaultTo(false);

            table.index("game_id");
            table.index("player_id");
        })

        .createTable("injuries", (table) => {
            table.increments("id").primary();
            table.integer("season_id").notNullable().references("id").inTable("seasons");
            table.integer("game_id").notNullable().references("id").inTable("games");
            table.integer("player_id").notNullable().references("id").inTable("players");
            table.integer("week_injured").notNullable();
            table.integer("games_missed").defaultTo(0);

            table.index(["season_id", "player_id"]);
        })

        .createTable("season_crashes", (table) => {
            table.increments("id").primary();
            table.integer("season_id").notNullable().references("id").inTable("seasons");
            table.timestamp("crashed_at").defaultTo(knex.fn.now());
            table.integer("games_completed").defaultTo(0);
            table.integer("last_week");
            table.text("error_message");
            table.text("error_stack");
            table.text("emulator_stderr");
            table.string("error_source"); // 'emulator', 'database', 'node', 'unknown'

            table.index("season_id");
        });
}

export function down(knex) {
    return knex.schema
        .dropTableIfExists("season_crashes")
        .dropTableIfExists("injuries")
        .dropTableIfExists("player_game_stats")
        .dropTableIfExists("games")
        .dropTableIfExists("team_season_stats")
        .dropTableIfExists("seasons")
        .dropTableIfExists("players")
        .dropTableIfExists("teams");
}

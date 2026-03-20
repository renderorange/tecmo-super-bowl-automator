/**
 * Add performance indexes for query optimization.
 *
 * These indexes are being added after working on building out usage in
 * https://github.com/renderorange/tecmo-super-bowl-explorer
 *
 * Critical indexes:
 * - injuries(game_id): JOINs in get_clustering, get_team_impact, get_injuries
 * - injuries(season_id): GROUP BY and filtering in get_counts_by_week, get_team_impact
 * - team_season_stats(team_id): lookups in get_team_seasons, get_team_stats_by_season
 * - team_season_stats(season_id): lookups in get_standings, get_division_standings
 *
 * Compound indexes for common query patterns:
 * - games(season_id, home_team_id) and games(season_id, away_team_id): game lookups
 * - injuries(season_id, week_injured): weekly injury aggregation
 */

export async function up(knex) {
    await knex.raw("CREATE INDEX IF NOT EXISTS injuries_game_id_index ON injuries (game_id)");
    await knex.raw("CREATE INDEX IF NOT EXISTS injuries_season_id_index ON injuries (season_id)");
    await knex.raw("CREATE INDEX IF NOT EXISTS injuries_season_id_week_injured_index ON injuries (season_id, week_injured)");
    await knex.raw("CREATE INDEX IF NOT EXISTS team_season_stats_team_id_index ON team_season_stats (team_id)");
    await knex.raw("CREATE INDEX IF NOT EXISTS team_season_stats_season_id_index ON team_season_stats (season_id)");
    await knex.raw("CREATE INDEX IF NOT EXISTS games_season_id_home_team_id_index ON games (season_id, home_team_id)");
    await knex.raw("CREATE INDEX IF NOT EXISTS games_season_id_away_team_id_index ON games (season_id, away_team_id)");
}

export async function down(knex) {
    await knex.raw("DROP INDEX IF EXISTS injuries_game_id_index");
    await knex.raw("DROP INDEX IF EXISTS injuries_season_id_index");
    await knex.raw("DROP INDEX IF EXISTS injuries_season_id_week_injured_index");
    await knex.raw("DROP INDEX IF EXISTS team_season_stats_team_id_index");
    await knex.raw("DROP INDEX IF EXISTS team_season_stats_season_id_index");
    await knex.raw("DROP INDEX IF EXISTS games_season_id_home_team_id_index");
    await knex.raw("DROP INDEX IF EXISTS games_season_id_away_team_id_index");
}

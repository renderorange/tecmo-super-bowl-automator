/**
 * Create player_injury_stats materialized table for faster injury analysis queries.
 *
 * This table pre-aggregates player injury statistics to improve performance of
 * get_prone_players and get_immune_players queries in tecmo-super-bowl-explorer.
 *
 * The table should be refreshed after each season is completed using the
 * refresh_player_injury_stats() method in season-repository.js.
 *
 * Performance improvements:
 * - get_prone_players: ~5-6 seconds → <100ms
 * - get_immune_players: ~6-7 seconds → <100ms
 * - Overall test suite: ~22 seconds → ~5-8 seconds
 */

export async function up(knex) {
    // Create the materialized table with pre-aggregated stats
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS player_injury_stats (
            player_id INTEGER PRIMARY KEY,
            player_name TEXT NOT NULL,
            team_id INTEGER NOT NULL,
            team_name TEXT NOT NULL,
            position TEXT NOT NULL,
            total_injuries INTEGER NOT NULL DEFAULT 0,
            total_games_played INTEGER NOT NULL DEFAULT 0,
            injury_rate REAL NOT NULL DEFAULT 0.0,
            FOREIGN KEY (player_id) REFERENCES players(id),
            FOREIGN KEY (team_id) REFERENCES teams(id)
        )
    `);

    // Create indexes for common query patterns
    await knex.raw("CREATE INDEX IF NOT EXISTS pis_injuries_index ON player_injury_stats(total_injuries DESC)");
    await knex.raw("CREATE INDEX IF NOT EXISTS pis_games_index ON player_injury_stats(total_games_played DESC)");
    await knex.raw("CREATE INDEX IF NOT EXISTS pis_position_index ON player_injury_stats(position)");
    await knex.raw("CREATE INDEX IF NOT EXISTS pis_rate_index ON player_injury_stats(injury_rate DESC)");

    // Add composite index to player_game_stats for better COUNT(DISTINCT game_id) performance
    await knex.raw("CREATE INDEX IF NOT EXISTS pgs_player_game_index ON player_game_stats(player_id, game_id)");

    // Populate the table with initial data
    await knex.raw(`
        INSERT OR REPLACE INTO player_injury_stats
        SELECT 
            p.id as player_id,
            p.name as player_name,
            p.team_id,
            t.name as team_name,
            p.position,
            COUNT(DISTINCT i.id) as total_injuries,
            COUNT(DISTINCT pgs.game_id) as total_games_played,
            ROUND(CAST(COUNT(DISTINCT i.id) AS FLOAT) / NULLIF(COUNT(DISTINCT pgs.game_id), 0), 4) as injury_rate
        FROM players p
        JOIN teams t ON t.id = p.team_id
        JOIN player_game_stats pgs ON pgs.player_id = p.id
        LEFT JOIN injuries i ON i.player_id = p.id
        GROUP BY p.id, p.name, p.team_id, t.name, p.position
    `);
}

export async function down(knex) {
    await knex.raw("DROP INDEX IF EXISTS pis_injuries_index");
    await knex.raw("DROP INDEX IF EXISTS pis_games_index");
    await knex.raw("DROP INDEX IF EXISTS pis_position_index");
    await knex.raw("DROP INDEX IF EXISTS pis_rate_index");
    await knex.raw("DROP INDEX IF EXISTS pgs_player_game_index");
    await knex.raw("DROP TABLE IF EXISTS player_injury_stats");
}

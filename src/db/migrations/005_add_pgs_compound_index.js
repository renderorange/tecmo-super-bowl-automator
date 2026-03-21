export async function up(knex) {
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS player_game_stats_player_game_index 
        ON player_game_stats (player_id, game_id)
    `);
}

export async function down(knex) {
    await knex.raw("DROP INDEX IF EXISTS player_game_stats_player_game_index");
}

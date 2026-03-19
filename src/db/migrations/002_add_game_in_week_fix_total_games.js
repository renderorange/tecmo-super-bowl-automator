/**
 * Add game_in_week column to games table.
 *
 * The game_in_week field is already emitted by the Lua controller
 * (from SRAM.CURRENT_GAME) but was never persisted to the database.
 */

export function up(knex) {
    return knex.schema.alterTable("games", (table) => {
        table.integer("game_in_week").nullable();
    });
}

export function down(knex) {
    return knex.schema.alterTable("games", (table) => {
        table.dropColumn("game_in_week");
    });
}

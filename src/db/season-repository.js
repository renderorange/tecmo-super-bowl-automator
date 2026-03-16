/**
 * Season repository for saving game results to the database.
 *
 * Handles:
 *   - Creating season records
 *   - Inserting games and player stats
 *   - Mapping emulator position keys to player database IDs
 */

import db from "./index.js";

/**
 * Map of emulator position keys (from Lua controller output) to
 * position_detail values in the database.
 */
export const POSITION_KEY_MAP = {
    qb1: "QB1",
    qb2: "QB2",
    rb1: "RB1",
    rb2: "RB2",
    rb3: "RB3",
    rb4: "RB4",
    wr1: "WR1",
    wr2: "WR2",
    wr3: "WR3",
    wr4: "WR4",
    te1: "TE1",
    te2: "TE2",
    re: "RE",
    nt: "NT",
    le: "LE",
    rolb: "ROLB",
    rilb: "RILB",
    lilb: "LILB",
    lolb: "LOLB",
    rcb: "RCB",
    lcb: "LCB",
    fs: "FS",
    ss: "SS",
    k: "K",
    p: "P",
};

/**
 * Repository class for persisting season simulation results.
 */
export class SeasonRepository {
    /**
     * Create a new season record.
     *
     * @param {number} totalGames - Expected total games (default: 238)
     * @returns {Promise<number>} The season ID
     */
    async create_season(total_games = 238) {
        const [season_id] = await db("seasons")
            .insert({
                total_games: total_games,
                status: "running",
            })
            .returning("id");

        return typeof season_id === "object" ? season_id.id : season_id;
    }

    /**
     * Complete a season by updating its status and completed timestamp.
     *
     * @param {number} season_id
     * @param {number} games_completed
     * @returns {Promise<void>}
     */
    async complete_season(season_id, games_completed) {
        await db("seasons")
            .where("id", season_id)
            .update({
                completed_at: db.fn.now(),
                games_completed: games_completed,
                status: "completed",
            });
    }

    /**
     * Mark a season as failed.
     *
     * @param {number} season_id
     * @returns {Promise<void>}
     */
    async fail_season(season_id) {
        await db("seasons")
            .where("id", season_id)
            .update({
                status: "failed",
            });
    }

    /**
     * Log a crash for a season. Records diagnostics in the season_crashes
     * table and marks the season as failed. Partial game data is preserved
     * for debugging (filtered by season status in analysis queries).
     *
     * @param {object} args
     * @param {number} args.season_id - The season that crashed
     * @param {number} args.games_completed - Games successfully saved before crash
     * @param {number} args.last_week - Last week being processed (1-based)
     * @param {string} args.error_message - Error .message
     * @param {string} args.error_stack - Error .stack
     * @param {string} args.emulator_stderr - Raw stderr from nesl process
     * @param {string} args.error_source - Where the crash occurred: 'emulator', 'database', 'node', 'unknown'
     * @returns {Promise<number>} The crash record ID
     */
    async log_crash(args) {
        const required_keys = ["season_id"];
        for (const key of required_keys) {
            if (!args[key]) {
                throw new Error(`log_crash requires ${key}`);
            }
        }

        const [crash_id] = await db("season_crashes")
            .insert({
                season_id: args.season_id,
                games_completed: args.games_completed || 0,
                last_week: args.last_week || null,
                error_message: args.error_message || null,
                error_stack: args.error_stack || null,
                emulator_stderr: args.emulator_stderr || null,
                error_source: args.error_source || "unknown",
            })
            .returning("id");

        // Mark the season as failed
        await this.fail_season(args.season_id);

        return typeof crash_id === "object" ? crash_id.id : crash_id;
    }

    /**
     * Save a single game and its player stats.
     *
     * @param {number} season_id
     * @param {object} game_data - Game data from emulator JSONL output
     * @returns {Promise<number>} The game ID
     */
    async save_game(season_id, game_data) {
        const home_team_id = game_data.p1_team_id;
        const away_team_id = game_data.p2_team_id;
        const home_score = game_data.p1_score;
        const away_score = game_data.p2_score;

        const home_stats = game_data.p1_team_stats || {};
        const away_stats = game_data.p2_team_stats || {};
        const home_pre = game_data.p1_pregame_record || {};
        const away_pre = game_data.p2_pregame_record || {};

        // Insert the game record
        const [game_id] = await db("games")
            .insert({
                season_id: season_id,
                week: game_data.week + 1, // Convert 0-based to 1-based
                home_team_id: home_team_id,
                away_team_id: away_team_id,
                home_score: home_score,
                away_score: away_score,
                is_overtime: false, // Could be inferred from team_stats if needed

                // Home team stats
                home_rushing_attempts: home_stats.rushing_attempts || 0,
                home_rushing_yards: home_stats.rushing_yards || 0,
                home_rushing_tds: home_stats.rushing_tds || 0,
                home_passing_attempts: home_stats.passing_attempts || 0,
                home_passing_completions: home_stats.passing_completions || 0,
                home_passing_yards: home_stats.passing_yards || 0,
                home_passing_tds: home_stats.passing_tds || 0,
                home_interceptions_thrown: home_stats.interceptions_thrown || 0,
                home_receptions: home_stats.receptions || 0,
                home_receiving_yards: home_stats.receiving_yards || 0,
                home_receiving_tds: home_stats.receiving_tds || 0,
                home_sacks: home_stats.sacks || 0,
                home_interceptions: home_stats.interceptions || 0,
                home_interception_return_yards: home_stats.interception_return_yards || 0,
                home_interception_return_tds: home_stats.interception_return_tds || 0,
                home_kick_return_yards: home_stats.kick_return_yards || 0,
                home_kick_return_tds: home_stats.kick_return_tds || 0,
                home_punt_return_yards: home_stats.punt_return_yards || 0,
                home_punt_return_tds: home_stats.punt_return_tds || 0,
                home_punts: home_stats.punting?.punts || 0,
                home_punt_yards: home_stats.punting?.punt_yards || 0,
                home_xp_attempts: home_stats.k?.xp_attempts || 0,
                home_xp_made: home_stats.k?.xp_made || 0,
                home_fg_attempts: home_stats.k?.fg_attempts || 0,
                home_fg_made: home_stats.k?.fg_made || 0,
                home_tracked_pts: home_stats.tracked_pts || 0,
                home_untracked_pts: home_stats.untracked_pts || 0,

                // Away team stats
                away_rushing_attempts: away_stats.rushing_attempts || 0,
                away_rushing_yards: away_stats.rushing_yards || 0,
                away_rushing_tds: away_stats.rushing_tds || 0,
                away_passing_attempts: away_stats.passing_attempts || 0,
                away_passing_completions: away_stats.passing_completions || 0,
                away_passing_yards: away_stats.passing_yards || 0,
                away_passing_tds: away_stats.passing_tds || 0,
                away_interceptions_thrown: away_stats.interceptions_thrown || 0,
                away_receptions: away_stats.receptions || 0,
                away_receiving_yards: away_stats.receiving_yards || 0,
                away_receiving_tds: away_stats.receiving_tds || 0,
                away_sacks: away_stats.sacks || 0,
                away_interceptions: away_stats.interceptions || 0,
                away_interception_return_yards: away_stats.interception_return_yards || 0,
                away_interception_return_tds: away_stats.interception_return_tds || 0,
                away_kick_return_yards: away_stats.kick_return_yards || 0,
                away_kick_return_tds: away_stats.kick_return_tds || 0,
                away_punt_return_yards: away_stats.punt_return_yards || 0,
                away_punt_return_tds: away_stats.punt_return_tds || 0,
                away_punts: away_stats.punting?.punts || 0,
                away_punt_yards: away_stats.punting?.punt_yards || 0,
                away_xp_attempts: away_stats.k?.xp_attempts || 0,
                away_xp_made: away_stats.k?.xp_made || 0,
                away_fg_attempts: away_stats.k?.fg_attempts || 0,
                away_fg_made: away_stats.k?.fg_made || 0,
                away_tracked_pts: away_stats.tracked_pts || 0,
                away_untracked_pts: away_stats.untracked_pts || 0,

                // Pre-game records
                home_pre_wins: home_pre.wins || 0,
                home_pre_losses: home_pre.losses || 0,
                home_pre_ties: home_pre.ties || 0,
                home_pre_points_for: home_pre.points_for || 0,
                home_pre_points_against: home_pre.points_against || 0,
                away_pre_wins: away_pre.wins || 0,
                away_pre_losses: away_pre.losses || 0,
                away_pre_ties: away_pre.ties || 0,
                away_pre_points_for: away_pre.points_for || 0,
                away_pre_points_against: away_pre.points_against || 0,
            })
            .returning("id");

        const game_id_val = typeof game_id === "object" ? game_id.id : game_id;

        // Save player stats for both teams
        await this.save_player_stats(game_id_val, home_team_id, game_data.p1_players);
        await this.save_player_stats(game_id_val, away_team_id, game_data.p2_players);

        return game_id_val;
    }

    /**
     * Save player stats for one team.
     *
     * @param {number} game_id
     * @param {number} team_id
     * @param {object} players_data - Player stats from emulator output (p1_players or p2_players)
     * @returns {Promise<void>}
     */
    async save_player_stats(game_id, team_id, players_data) {
        const player_stats = [];

        for (const [position_key, stats] of Object.entries(players_data)) {
            const position_detail = POSITION_KEY_MAP[position_key];

            if (!position_detail) {
                continue;
            }

            // Look up the player ID
            const player = await db("players")
                .where({
                    team_id: team_id,
                    position_detail: position_detail,
                })
                .first();

            if (!player) {
                console.warn(
                    `Player not found for team ${team_id}, position ${position_detail}`,
                );
                continue;
            }

            // Build player stat record based on position type
            const stat_record = this.build_stat_record(
                game_id,
                player.id,
                position_key,
                stats,
            );

            if (stat_record) {
                player_stats.push(stat_record);
            }
        }

        if (player_stats.length > 0) {
            await db.batchInsert("player_game_stats", player_stats, 50);
        }
    }

    /**
     * Build a player_game_stats record from emulator output.
     *
     * @param {number} game_id
     * @param {number} player_id
     * @param {string} position_key - Emulator position key (e.g., 'qb1', 'rb1')
     * @param {object} stats - Stats from emulator
     * @returns {object|null} Stat record for database
     */
    build_stat_record(game_id, player_id, position_key, stats) {
        const base_record = {
            game_id: game_id,
            player_id: player_id,
        };

        if (position_key.startsWith("qb")) {
            return {
                ...base_record,
                passing_attempts: stats.passing_attempts || 0,
                passing_completions: stats.passing_completions || 0,
                passing_yards: stats.passing_yards || 0,
                passing_tds: stats.passing_tds || 0,
                interceptions_thrown: stats.interceptions_thrown || 0,
                rushing_attempts: stats.rushing_attempts || 0,
                rushing_yards: stats.rushing_yards || 0,
                rushing_tds: stats.rushing_tds || 0,
            };
        }

        if (
            position_key.startsWith("rb") ||
            position_key.startsWith("wr") ||
            position_key.startsWith("te")
        ) {
            return {
                ...base_record,
                receptions: stats.receptions || 0,
                receiving_yards: stats.receiving_yards || 0,
                receiving_tds: stats.receiving_tds || 0,
                rushing_attempts: stats.rushing_attempts || 0,
                rushing_yards: stats.rushing_yards || 0,
                rushing_tds: stats.rushing_tds || 0,
                kick_return_attempts: stats.kick_return_attempts || 0,
                kick_return_yards: stats.kick_return_yards || 0,
                kick_return_tds: stats.kick_return_tds || 0,
                punt_return_attempts: stats.punt_return_attempts || 0,
                punt_return_yards: stats.punt_return_yards || 0,
                punt_return_tds: stats.punt_return_tds || 0,
            };
        }

        if (
            [
                "re",
                "nt",
                "le",
                "rolb",
                "rilb",
                "lilb",
                "lolb",
                "rcb",
                "lcb",
                "fs",
                "ss",
            ].includes(position_key)
        ) {
            return {
                ...base_record,
                sacks: stats.sacks || 0,
                interceptions: stats.interceptions || 0,
                interception_return_yards: stats.interception_return_yards || 0,
                interception_return_tds: stats.interception_return_tds || 0,
            };
        }

        if (position_key === "k") {
            return {
                ...base_record,
                xp_attempts: stats.xp_attempts || 0,
                xp_made: stats.xp_made || 0,
                fg_attempts: stats.fg_attempts || 0,
                fg_made: stats.fg_made || 0,
            };
        }

        if (position_key === "p") {
            return {
                ...base_record,
                punts: stats.punts || 0,
                punt_yards: stats.punt_yards || 0,
            };
        }

        return base_record;
    }

    /**
     * Update team_season_stats aggregates for a completed game.
     * This should be called after all games are saved.
     *
     * @param {number} season_id
     * @returns {Promise<void>}
     */
    async update_team_season_stats(season_id) {
        // Get all games for this season
        const games = await db("games")
            .where("season_id", season_id)
            .select("home_team_id", "away_team_id", "home_score", "away_score");

        // Aggregate records per team
        const team_stats = {};

        for (const game of games) {
            const home_id = game.home_team_id;
            const away_id = game.away_team_id;

            if (!team_stats[home_id]) {
                team_stats[home_id] = {
                    team_id: home_id,
                    wins: 0,
                    losses: 0,
                    ties: 0,
                    points_for: 0,
                    points_against: 0,
                    home_wins: 0,
                    home_losses: 0,
                    away_wins: 0,
                    away_losses: 0,
                };
            }

            if (!team_stats[away_id]) {
                team_stats[away_id] = {
                    team_id: away_id,
                    wins: 0,
                    losses: 0,
                    ties: 0,
                    points_for: 0,
                    points_against: 0,
                    home_wins: 0,
                    home_losses: 0,
                    away_wins: 0,
                    away_losses: 0,
                };
            }

            const home_won = game.home_score > game.away_score;
            const away_won = game.away_score > game.home_score;
            const is_tie = game.home_score === game.away_score;

            // Update home team
            team_stats[home_id].points_for += game.home_score;
            team_stats[home_id].points_against += game.away_score;

            if (home_won) {
                team_stats[home_id].wins++;
                team_stats[home_id].home_wins++;
            } else if (is_tie) {
                team_stats[home_id].ties++;
            } else {
                team_stats[home_id].losses++;
                team_stats[home_id].home_losses++;
            }

            // Update away team
            team_stats[away_id].points_for += game.away_score;
            team_stats[away_id].points_against += game.home_score;

            if (away_won) {
                team_stats[away_id].wins++;
                team_stats[away_id].away_wins++;
            } else if (is_tie) {
                team_stats[away_id].ties++;
            } else {
                team_stats[away_id].losses++;
                team_stats[away_id].away_losses++;
            }
        }

        // Insert or update team_season_stats
        for (const stats of Object.values(team_stats)) {
            await db("team_season_stats")
                .insert({
                    season_id: season_id,
                    team_id: stats.team_id,
                    wins: stats.wins,
                    losses: stats.losses,
                    ties: stats.ties,
                    points_for: stats.points_for,
                    points_against: stats.points_against,
                    home_wins: stats.home_wins,
                    home_losses: stats.home_losses,
                    away_wins: stats.away_wins,
                    away_losses: stats.away_losses,
                })
                .onConflict(["season_id", "team_id"])
                .merge();
        }
    }

    /**
     * Get season summary with team standings.
     *
     * @param {number} season_id
     * @returns {Promise<object>} Season summary with standings
     */
    async get_season_summary(season_id) {
        const season = await db("seasons")
            .where("id", season_id)
            .first();

        if (!season) {
            return null;
        }

        const standings = await db("team_season_stats")
            .where("season_id", season_id)
            .join("teams", "team_season_stats.team_id", "teams.id")
            .select(
                "teams.abbreviation",
                "teams.city",
                "teams.name",
                "team_season_stats.*",
            )
            .orderBy([
                { column: "wins", order: "desc" },
                { column: "points_for", order: "desc" },
            ]);

        return {
            season: season,
            standings: standings,
        };
    }
}

export default SeasonRepository;

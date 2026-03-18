# Tecmo Super Bowl Season Simulator

Automated season simulator for Tecmo Super Bowl (NES). Uses the nesl headless emulator with Lua scripting to run COM-vs-COM games using the actual game engine, extract per-player stats from SRAM, and store results in SQLite.

## Quick Start

```bash
npm install
npm run db:migrate       # Create database schema
npm run extract-rom      # Extract team/player data from ROM
npm run db:seed          # Seed database with ROM data
npm test                 # Run tests (64 tests)
npm run simulate         # Run one 17-week season
npm run simulate:multi   # Run 10 seasons in parallel
```

## Running Seasons

```bash
# Single season with database persistence
node scripts/run-season.js --save-db

# Single season, JSONL only
node scripts/run-season.js -o runs/test.jsonl

# Multiple seasons in parallel (default: 10 seasons, CPU cores - 1 concurrency)
node scripts/run-multi-season.js --seasons 20 --concurrency 4

# Quiet mode (suppress per-game output)
node scripts/run-season.js --save-db --quiet

# Run the Lua controller directly (requires nesl in PATH)
nesl src/emulator/lua/controller.lua ~/roms/nes/Tecmo\ Super\ Bowl\ \(USA\).nes
```

Output is JSONL (one JSON object per game) written to `runs/season-{timestamp}.jsonl`.

## What's Captured Per Game

Every piece of data the game engine produces is extracted and stored:

### Per-player stats (25 positions per team, 50 players per game)

| Position                                                        | Stats                                                                                                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QB (x2)                                                         | passing_attempts, passing_completions, passing_yards, passing_tds, interceptions_thrown, rushing_attempts, rushing_yards, rushing_tds                                                                        |
| RB (x4), WR (x4), TE (x2)                                       | rushing_attempts, rushing_yards, rushing_tds, receptions, receiving_yards, receiving_tds, kick_return_attempts, kick_return_yards, kick_return_tds, punt_return_attempts, punt_return_yards, punt_return_tds |
| DEF (x11: RE, NT, LE, ROLB, RILB, LILB, LOLB, RCB, LCB, FS, SS) | sacks, interceptions, interception_return_yards, interception_return_tds                                                                                                                                     |
| K                                                               | xp_attempts, xp_made, fg_attempts, fg_made                                                                                                                                                                   |
| P                                                               | punts, punt_yards                                                                                                                                                                                            |

All yardage stats are 16-bit (low byte + high byte multiplier) from SRAM.

### Per-player metadata

| Field              | Values                                            | Description                                                                                                                                      |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `injury_status`    | 0=healthy, 1=probable, 2=questionable, 3=doubtful | Decoded from 2-bit packed SRAM bytes. Only skill players (QB, RB, WR, TE) can be injured.                                                        |
| `condition_status` | 0=bad, 1=average, 2=good, 3=excellent             | Decoded from 2-bit packed SRAM bytes. All 30 roster positions have conditions. Conditions affect sim performance via skill modifiers (-2 to +4). |

### Team-level stats (derived from player stats)

Rushing, passing, receiving yards and TDs; sacks; interceptions; kick/punt return attempts, yards, and TDs; first downs; XP/FG attempts and makes; punts and punt yards.

`tracked_pts` = (rushing*tds + receiving_tds + kick_return_tds + punt_return_tds + interception_return_tds) * 6 + xp*made + fg_made * 3

`untracked_pts` = final_score - tracked_pts (fumble recovery TDs, safeties, blocked kick TDs)

### Pre-game context

- Pre-game W-L-T record, points_for, points_against, pass/rush yards allowed (from SRAM season standings)
- Week and game-in-week index
- Overtime flag

### Game metadata (JSON-encoded)

| Field                             | Description                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `weekly_matchups`                 | 14 home/away team ID pairs for the current week's schedule                             |
| `home_playbook` / `away_playbook` | 8-byte playbook selection arrays                                                       |
| `cpu_boosts`                      | CPU difficulty boost values (def_ms, off_ms, def_int, pass_ctrl, reception, boost_idx) |

### What TSB does NOT track

- **Tackles**: No tackle counter exists anywhere in the game engine. The `TACKLER_ID` variable only determines sack credit.
- **Fumbles**: Not tracked as a per-player stat. Fumble recovery TDs appear as `untracked_pts`.
- **OL stats**: Offensive linemen have ROM attributes but no in-game stat tracking.

## Performance

- ~8 seconds wall-clock per game (~140x real-time)
- ~2 minutes per week (14 games)
- ~31 minutes per full season (224 games)
- Parallel seasons scale linearly with CPU cores

## Project Structure

```
src/
  db/
    index.js              Knex connection config
    season-repository.js  Game/player stat persistence
    migrations/           Schema (teams, players, seasons, games, player_game_stats, ...)
    seeds/                ROM-extracted JSON (28 teams, 840 players with attributes)
  emulator/
    index.js              Node.js wrapper (spawns nesl, parses JSONL output)
    lua/
      memory.lua          SRAM/RAM addresses, stat byte layouts, injury/condition decoders
      controller.lua      Season simulation: menu navigation, game loop, stat extraction

scripts/
  extract-rom-data.js     Extract names + abilities from ROM binary
  seed.js                 Load ROM data into database
  run-season.js           Run one 17-week season (--save-db for database persistence)
  run-multi-season.js     Run N seasons in parallel (--seasons N --concurrency C)
  test-emulator.js        Integration test (runs 1 game)

tests/
  db/
    schema.test.js            Schema and seed data validation (28 tests)
    season-repository.test.js Repository CRUD and aggregation (18 tests)
  emulator/
    index.test.js             Emulator wrapper tests (18 tests)

data/
  stats.db                SQLite database (created by migrations + seed)

runs/
  season-*.jsonl          Raw JSONL output from season runs
```

## Database Schema

SQLite database at `data/stats.db`:

| Table               | Rows           | Description                                                                    |
| ------------------- | -------------- | ------------------------------------------------------------------------------ |
| `teams`             | 28             | NFL teams (id, name, city, abbreviation, conference, division)                 |
| `players`           | 840            | Players with all ROM attributes (14 ability fields, jersey, face, ROM offsets) |
| `seasons`           | per run        | Season metadata (status, timestamps, game counts)                              |
| `games`             | ~224/season    | Game results with 94 columns: scores, team stats, pre-game records, metadata   |
| `player_game_stats` | ~11,200/season | Per-player per-game stat lines (32 columns including injury/condition)         |
| `team_season_stats` | 28/season      | Aggregated W-L-T, points for/against, home/away splits                         |
| `injuries`          | --             | Injury event tracking (reserved)                                               |
| `season_crashes`    | rare           | Crash diagnostics for failed seasons                                           |

### Player attributes (from ROM)

Every player has these attributes extracted from the ROM binary and stored in the `players` table:

| Attribute                                                          | Positions  | Description                                                     |
| ------------------------------------------------------------------ | ---------- | --------------------------------------------------------------- |
| rushing_power, running_speed, maximum_speed, hitting_power         | All        | Core physical attributes (nibble 0x0-0xF mapped to 6-100 scale) |
| passing_speed, pass_control, accuracy_of_passing, avoid_pass_block | QB only    | Passing attributes                                              |
| ball_control, receptions                                           | RB, WR, TE | Ball-handling attributes                                        |
| pass_interceptions, quickness                                      | DL, LB, DB | Defensive attributes                                            |
| kicking_ability, avoid_kick_block                                  | K, P       | Kicking attributes                                              |

## ROM Data Extraction

`scripts/extract-rom-data.js` reads directly from the NES ROM binary:

- **Name pointer table** at CPU `$8000` (file offset `0x10`): 28 team pointers, each pointing to 30 player name entries
- **Abilities data** at CPU `$B000` (file offset `0x3010`): 117 bytes per team (packed nibbles), 28 teams
- **Attribute scale**: Nibble values 0x0-0xF map to `[6, 13, 19, 25, 31, 38, 44, 50, 56, 63, 69, 75, 81, 88, 94, 100]`

Output: `src/db/seeds/teams_with_attributes.json`

## SRAM Memory Map

Stat extraction addresses verified against [bruddog's disassembly](https://github.com/bruddog/Tecmo_Super_Bowl_NES_Disassembly) (`sram_variables.asm`, `stat_indexes.asm`).

### RAM (CPU address space)

| Address         | Description                                         |
| --------------- | --------------------------------------------------- |
| `$2D`           | Game status flags (`$02`=season, `$40`=game active) |
| `$6C`/`$6D`     | P1/P2 team IDs (0x00-0x1B)                          |
| `$76`           | Quarter (0=Q1, 3=Q4, 4+=OT)                         |
| `$6A`/`$6B`     | Clock seconds/minutes                               |
| `$E1`           | Menu cursor index                                   |
| `$0399`/`$039E` | P1/P2 final score                                   |

### SRAM (`$6000`-`$7FFF`, battery-backed)

| Address  | Size     | Description                                                                                                                |
| -------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `$6406`  | 261      | P1 per-game block: player stats (242B) + playbook (4B) + starters (4B) + injuries (3B) + conditions (8B)                   |
| `$650B`  | 261      | P2 per-game block (same layout)                                                                                            |
| `$6610`  | 52       | P1 in-game starters (team_id + roster_id pairs for all positions, including KR/PR)                                         |
| `$6644`  | 52       | P2 in-game starters                                                                                                        |
| `$6678`  | 6        | CPU boost values (def_ms, off_ms, def_int, pass_ctrl, reception, boost_idx)                                                |
| `$667E`  | 16       | Playbook edits (8 bytes P1, 8 bytes P2)                                                                                    |
| `$668E`  | 12       | In-game team stats: first downs, rush attempts, rush yards (2B), pass yards (2B) per team                                  |
| `$669B`  | 28       | Team control types (0=MAN, 1=COA, 2=COM, 3=SKP)                                                                            |
| `$6758`  | 1        | Current week (0-based, 0-16 = weeks 1-17)                                                                                  |
| `$6759`  | 1        | Current game within week                                                                                                   |
| `$675A`  | 28       | Weekly matchup schedule (14 pairs of team IDs)                                                                             |
| `$67AE`+ | 208 each | Season info blocks (28 teams): player season stats, W-L-T, PF, PA, yards allowed, playbook, starters, injuries, conditions |

### Player stat byte layouts (within per-game block)

| Position | Bytes | Layout                                                                                                                                                     |
| -------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QB       | 10    | pass_att, pass_comp, pass_td, pass_int, pass_yds_lo, pass_yds_hi, rush_att, rush_yds_lo, rush_yds_hi, rush_td                                              |
| RB/WR/TE | 16    | rec, rec_yds_lo, rec_yds_hi, rec_td, kr_att, kr_yds_lo, kr_yds_hi, kr_td, pr_att, pr_yds_lo, pr_yds_hi, pr_td, rush_att, rush_yds_lo, rush_yds_hi, rush_td |
| DEF      | 5     | sacks, ints, int_yds_lo, int_yds_hi, int_td                                                                                                                |
| K        | 4     | xp_att, xp_made, fg_att, fg_made                                                                                                                           |
| P        | 3     | punts, punt_yds_lo, punt_yds_hi                                                                                                                            |

### Injury encoding (3 bytes per team, offset 250 within per-game block)

2-bit status per skill player, packed 4 per byte. Only roster IDs 0-11 (QB1, QB2, RB1-4, WR1-4, TE1-2) can be injured.

| Byte | Players                                         |
| ---- | ----------------------------------------------- |
| 0    | QB1 (bits 1-0), QB2 (3-2), RB1 (5-4), RB2 (7-6) |
| 1    | RB3 (1-0), RB4 (3-2), WR1 (5-4), WR2 (7-6)      |
| 2    | WR3 (1-0), WR4 (3-2), TE1 (5-4), TE2 (7-6)      |

Values: `0`=healthy, `1`=probable (returns next week), `2`=questionable (50% return/week), `3`=doubtful (25% return/week).

### Condition encoding (8 bytes per team, offset 253 within per-game block)

2-bit value per roster slot, packed 4 per byte. All 30 positions have conditions.

Values: `0`=bad (-1/-2 skill modifier), `1`=average (no modifier), `2`=good (+1/+2), `3`=excellent (+3/+4).

Conditions update with ~25% probability per quarter, biased toward regression to average.

## Emulator: nesl

[nesl](https://github.com/threecreepio/nesl) is a headless NES emulator with an FCEUX-compatible Lua API, built on QuickNES. No display required.

### Building nesl

```bash
sudo apt-get install cmake build-essential

cd ~/src
git clone https://github.com/threecreepio/nesl.git
cd nesl && mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)

# Add to PATH or set NESL_PATH:
export PATH="~/src/nesl/build:$PATH"
# or: export NESL_PATH="~/src/nesl/build/nesl"
```

### Lua API

| Function                           | Description                           |
| ---------------------------------- | ------------------------------------- |
| `emu.frameadvance()`               | Advance one frame                     |
| `emu.framecount()`                 | Current frame number                  |
| `emu.poweron()`                    | Hard reset                            |
| `emu.exit()`                       | Stop emulation                        |
| `memory.readbyte(addr)`            | Read byte from CPU address space      |
| `memory.writebyte(addr, val)`      | Write byte to CPU address space       |
| `joypad.write(port, table_or_int)` | Set controller buttons for next frame |

Button names: uppercase `A`, `B`; lowercase `start`, `select`, `up`, `down`, `left`, `right`.

## Data Sources

- **[bruddog's Tecmo Super Bowl NES Disassembly](https://github.com/bruddog/Tecmo_Super_Bowl_NES_Disassembly)** -- Complete 6502 disassembly with annotated SRAM layouts, stat indexes, and simulation engine
- **[Tecmo Geek](https://tecmogeek.com/)** -- Player attribute validation (839/840 exact match with ROM extraction)

## Requirements

- **Node.js** 18+ with ESM support
- **nesl** emulator (see build instructions above)
- **Tecmo Super Bowl (USA).nes** ROM file

# Tecmo Super Bowl Season Simulator

Automated season simulator for Tecmo Super Bowl (NES). Uses the nesl headless emulator with Lua scripting to run COM-vs-COM games using the actual game engine, extract per-player stats from SRAM, and output results as JSON.

## Status

**Full 17-week season working.** 225 games completed in ~31 minutes wall-clock. Standings, per-player stats, and scores all captured.

### Running a season

```bash
# Run a full 17-week season
npm run simulate

# Or with options:
node scripts/run-season.js --max-games 42 -o runs/test.jsonl --quiet

# Save results to database (SQLite):
node scripts/run-season.js --save-db

# Or run the Lua controller directly:
/tmp/nesl/build/nesl src/emulator/lua/controller.lua \
  ~/roms/nes/Tecmo\ Super\ Bowl\ \(USA\).nes
```

Output is JSONL (one JSON object per game) written to `runs/season-{timestamp}.jsonl`. The season runner also prints final standings to the console.

### What's captured per game

- Final score (authoritative total from RAM)
- **Pre-game records** for both teams: W-L-T, points_for, points_against (from SRAM season standings)
- Per-player stats for all 25 roster positions on both teams:
  - **QB**: passing_attempts/completions/yards/TDs, interceptions_thrown, rushing_attempts/yards/TDs
  - **RB/WR/TE**: rushing_attempts/yards/TDs, receptions/receiving_yards/receiving_tds, kick_return_attempts/yards/TDs, punt_return_attempts/yards/TDs
  - **DEF** (11 positions): sacks, interceptions, interception_return_yards/TDs
  - **K**: xp_attempts/made, fg_attempts/made
  - **P**: punts, punt_yards
- Team totals (derived from player stats): rushing/passing/receiving yards and TDs, sacks, interceptions, KR/PR TDs, tracked_pts, untracked_pts
- Week and game-in-week index

### Performance

- ~8 seconds wall-clock per game (~140x real-time)
- 14 games (1 week) in ~2 minutes
- 225 games (17-week season) in ~31 minutes

### Known limitations

- **Untracked scoring**: TSB does not attribute fumble recovery TDs, safeties, or blocked kick return TDs to individual players. These events still affect the final score, and the point gap is captured as `untracked_pts` in the JSON output. Typically 0-14 points per team per game.
- **Season PF/PA timing**: SRAM season standings (points for/against) are written after post-game screens are dismissed, so they reflect the state as of the previous game. W-L-T records are always current.

### Remaining work

1. Multi-season runs -- run N seasons for statistical analysis
2. Visualization -- charts comparing TSB engine output vs real 1991 NFL stats

## Emulator: nesl

[nesl](https://github.com/threecreepio/nesl) is a headless NES emulator with an FCEUX-compatible Lua API, built on QuickNES. No display required.

### Building nesl

**Dependencies:** `cmake`, `make`, `g++` (Lua and QuickNES are bundled -- no external libraries needed)

```bash
# Install build tools (Debian/Ubuntu)
sudo apt-get install cmake build-essential

# Clone and build
cd /tmp
git clone https://github.com/threecreepio/nesl.git
cd nesl
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)

# Binary at: /tmp/nesl/build/nesl
```

### Lua API

| Function | Description |
|----------|-------------|
| `emu.frameadvance()` | Advance one frame |
| `emu.framecount()` | Current frame number |
| `emu.poweron()` | Hard reset |
| `emu.exit()` | Stop emulation |
| `memory.readbyte(addr)` | Read byte from CPU address space |
| `memory.writebyte(addr, val)` | Write byte to CPU address space |
| `joypad.write(port, table_or_int)` | Set controller buttons for next frame |
| `gui.savescreenshotas(path)` | Save screenshot as PNG |

**Button names are case-sensitive:** uppercase `A`, `B`; lowercase `start`, `select`, `up`, `down`, `left`, `right`.

```lua
joypad.write(1, {start=true})       -- press START
joypad.write(1, {A=true, up=true})  -- press A + Up
joypad.write(1, 0)                  -- release all
```

## TSB Technical Details

### COM vs COM game flow

1. **Boot** -- press B to skip intro (~2 sec vs ~90 sec attract loop)
2. **Title** -- press START to reach mode select
3. **Mode select** -- DOWN to SEASON GAME, press A
4. **Set teams to COM** -- write `0x02` to all 28 bytes at SRAM `$669B` (requires MMC3 enable: `$A001 = $80`)
5. **Season menu** -- DOWN twice to GAME START, press A
6. **Game plays autonomously** -- no input needed during COM vs COM (including coin toss, OT)
7. **Detect end** -- wait for Q1 start (q==0, clock 1-5 min), then after Q4 (q>=3) count frames where clock minutes==0; 3000 stable frames = post-game
8. **Read stats** -- individual player stats from SRAM `$6406` (P1) / `$650B` (P2), scores from RAM `$0399` / `$039E`
9. **Advance** -- press A every 30 frames through post-game screens; stop when MENU_Y (`$E1`) = `$02` (back at GAME START)
10. **Repeat** from step 6; weeks auto-advance after all 14 games

### Game-over detection details

The hardest part of the implementation. Key considerations:
- Quarter/clock bytes retain stale values from the previous game during pre-game screens, so detection only starts after Q1 gameplay is confirmed (q==0 with clock 1-5 min)
- Tie games go to OT (q=4+), which resets the clock; the counter resets when mins > 0 (OT clock running) and resumes counting when mins returns to 0
- Post-game A presses also advance through OT coin toss and any additional OT periods
- Season end detected when SRAM week counter (`$6758`) reaches 17

### Memory map

**RAM (zero-page):**

| Address | Variable | Description |
|---------|----------|-------------|
| `$2D` | `GAME_STATUS` | Bit flags: `$02`=season, `$40`=game active |
| `$6C` | `P1_TEAM` | Team ID (0x00-0x1B) |
| `$6D` | `P2_TEAM` | Team ID |
| `$76` | `QUARTER` | 0-based (0=Q1, 3=Q4, 4+=OT) |
| `$6A` | `CLOCK_SECONDS` | Game clock seconds |
| `$6B` | `CLOCK_MINUTES` | Game clock minutes |
| `$E1` | `MENU_Y` | Menu cursor index |
| `$0399` | `P1_TOTAL_SCORE` | Final score (authoritative) |
| `$039E` | `P2_TOTAL_SCORE` | Final score (authoritative) |

**SRAM (`$6000`-`$7FFF`, battery-backed, requires MMC3 enable `$A001=$80`):**

| Address | Size | Description |
|---------|------|-------------|
| `$669B` | 28 | Team control types (0=MAN, 1=COA, 2=COM, 3=SKP) |
| `$6406` | 242 | P1 individual player stats (current game) |
| `$650B` | 242 | P2 individual player stats (current game) |
| `$6758` | 1 | Current week in season (0-based, 0-16 = weeks 1-17) |
| `$DF17` | 56 | Pointer table (CPU addr) mapping team ID to season info SRAM base |
| per-team | 208 | Season info block (28 blocks, `$67AE`-`$7F71`): player season stats, W-L-T, PF, PA, yards allowed |

**Season info block offsets** (within each team's 208-byte block):

| Offset | Size | Field |
|--------|------|-------|
| `$B2` | 1 | Wins |
| `$B3` | 1 | Losses |
| `$B4` | 1 | Ties |
| `$B5` | 2 | Points for (16-bit LE) |
| `$B7` | 2 | Points against (16-bit LE) |
| `$B9` | 2 | Pass yards allowed (16-bit LE) |
| `$BB` | 2 | Rush yards allowed (16-bit LE) |

### Player stat keys (Lua output → DB columns)

JSONL output keys match database columns 1:1:

| Position | Keys |
|----------|------|
| QB | passing_attempts, passing_completions, passing_yards, passing_tds, interceptions_thrown, rushing_attempts, rushing_yards, rushing_tds |
| RB/WR/TE | rushing_attempts, rushing_yards, rushing_tds, receptions, receiving_yards, receiving_tds, kick_return_attempts, kick_return_yards, kick_return_tds, punt_return_attempts, punt_return_yards, punt_return_tds |
| DEF | sacks, interceptions, interception_return_yards, interception_return_tds |
| K | xp_attempts, xp_made, fg_attempts, fg_made |
| P | punts, punt_yards |

All yardage stats are 16-bit little-endian (low byte, high byte).

## Data Sources

- **[bruddog's Tecmo Super Bowl NES Disassembly](https://github.com/bruddog/Tecmo_Super_Bowl_NES_Disassembly)** -- Complete 6502 disassembly. Used for:
  - ROM data layout (player names at `$8000`, abilities at `$B000`)
  - Zero-page and RAM variable maps
  - SRAM stat layout (`sram_variables.asm`, `stat_indexes.asm`)
  - Controller reading routine (`Bank31_fixed_bank.asm`)
  - Simulation engine (`Bank12_13_sim_update_stats.asm`)
- **[IIpepeII's NestopiaExtractor gist](https://gist.github.com/IIpepeII/fb09015e45a265bfe557cb608a9d8683)** -- Memory address reference
- **[Tecmo Geek](https://tecmogeek.com/)** -- Player attribute validation (839/840 exact match with ROM extraction)

## Requirements

- **Node.js** 18+ with ESM support
- **nesl** emulator (see build instructions above)
- **Tecmo Super Bowl (USA).nes** ROM file

## Setup

```bash
# Install dependencies
npm install

# Run database migrations (setup database)
npm run db:migrate

# Extract player/team data from ROM
npm run extract-rom

# Seed database
npm run db:seed

# Run tests
npm test

# Run a full season
npm run simulate
```

## Project Structure

```
src/
├── db/                   # Database layer (Knex + better-sqlite3)
│   ├── index.js          # Knex connection
│   ├── migrations/       # Schema migrations
│   └── seeds/            # ROM-extracted seed data (28 teams, 840 players)
└── emulator/
    ├── index.js          # Node.js emulator wrapper (spawns nesl, parses JSONL)
    └── lua/
        ├── memory.lua    # TSB memory/SRAM addresses and stat byte layouts
        └── controller.lua # Season simulation: navigation, game loop, stat extraction

scripts/
├── extract-rom-data.js   # ROM data extraction (names + attributes)
├── run-season.js         # Season runner (invokes emulator, prints standings)
├── seed.js               # Database seeding
└── test-emulator.js      # Emulator integration test (runs 1 game)

tests/
├── db/           # Database schema and data tests (28 tests)
└── emulator/     # Emulator wrapper tests (18 tests)
```

## Database

SQLite database at `data/stats.db`:

| Table | Description |
|-------|-------------|
| `teams` | 28 NFL teams (static, from ROM) |
| `players` | 840 players with full attributes (static, from ROM) |
| `seasons` | Simulation run metadata |
| `games` | Individual game results |
| `team_season_stats` | Aggregated team stats per season |
| `player_game_stats` | Individual player stats per game |
| `injuries` | Injury tracking |

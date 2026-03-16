# Tecmo Super Bowl Season Simulator

Automated season simulator for Tecmo Super Bowl (NES). Uses a headless NES emulator (nesl) with Lua scripting to run CPU-vs-CPU games, extract stats, and simulate full seasons.

## Status

Emulator integration working. nesl runs TSB headlessly with full input control -- all buttons verified, menu navigation confirmed via screenshots.

Next steps: complete the season simulation loop (start game -> play CPU vs CPU -> extract stats -> advance to next week).

## Emulator: nesl

[nesl](https://github.com/threecreepio/nesl) is a headless NES emulator with an FCEUX-compatible Lua API, built on QuickNES. It runs without a display, making it suitable for server-side automation.

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

### Running

```bash
/tmp/nesl/build/nesl script.lua "path/to/Tecmo Super Bowl (USA).nes"
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
| `joypad.get(port)` | Get current button state as table |
| `joypad.getraw(port)` | Get current button state as integer |
| `gui.savescreenshotas(path)` | Save screenshot as PNG |

**Button names are case-sensitive:** uppercase `A`, `B`; lowercase `start`, `select`, `up`, `down`, `left`, `right`.

```lua
joypad.write(1, {start=true})       -- press START
joypad.write(1, {A=true, up=true})  -- press A + Up
joypad.write(1, 0)                  -- release all
```

## TSB Technical Details

### Memory Map (from bruddog disassembly)

**Game state:**

| Address | Variable | Description |
|---------|----------|-------------|
| `$2D` | `GAME_STATUS` | Game mode (0x00=normal, 0x02=season, 0x40=attract) |
| `$30` | `FRAME_COUNTER` | Increments every frame |
| `$76` | `QUARTER` | Current quarter |
| `$77` | `DOWN` | Current down |
| `$6C` | `P1_TEAM` | Player 1 team ID |
| `$6D` | `P2_TEAM` | Player 2 team ID |
| `$75` | `TEAM_CONTROL_TYPES` | Control type per team (MAN/COA/COM) |

**Joypad state (written by NMI handler each frame):**

| Address | Variable | Description |
|---------|----------|-------------|
| `$35` | `JOY_RAW_1` | P1 buttons held this frame |
| `$36` | `JOY_RAW_2` | P2 buttons held |
| `$37` | `JOY_RAW_BOTH` | P1 \| P2 held |
| `$38` | `JOY_PRESS_1` | P1 newly pressed (edge-triggered) |
| `$39` | `JOY_PRESS_2` | P2 newly pressed |
| `$3A` | `JOY_PRESS_BOTH` | P1 \| P2 newly pressed |

**TSB internal button bit layout** (MSB-first, built via `ROL` in the NMI handler):

| Bit | Button | Value |
|-----|--------|-------|
| 7 | A | 0x80 |
| 6 | B | 0x40 |
| 5 | Select | 0x20 |
| 4 | Start | 0x10 |
| 3 | Up | 0x08 |
| 2 | Down | 0x04 |
| 1 | Left | 0x02 |
| 0 | Right | 0x01 |

Note: this is the TSB RAM format (reversed from the NES hardware bit order used by `joypad.write()`).

### Intro/Attract Sequence

TSB has a ~90-second intro loop before the title screen accepts START:

TECMO PRESENTS -> city skyline -> team previews (all 28 teams) -> "START GAME" title -> trademark/license screens -> repeat

Lua scripts must wait ~7200+ frames before pressing START. The controller code handles this automatically via `waitForTitleScreen()`.

### Controller Reading

TSB reads controllers in the NMI handler (`Bank31_fixed_bank.asm`) using a DPCM-safe double-read pattern:
1. Strobe `$4016` (write 1, then 0)
2. Read `$4016` 8 times, building a byte via `LSR` + `ROL`
3. Compare with previous read; if different, re-read (up to 4 attempts)

This results in 2-3 strobes per frame. QuickNES handles this correctly.

## Data Sources

- **[bruddog's Tecmo Super Bowl NES Disassembly](https://github.com/bruddog/Tecmo_Super_Bowl_NES_Disassembly)** -- Complete 6502 disassembly with every instruction labeled and commented. Used for:
  - ROM data layout (player names at `$8000`, abilities at `$B000`)
  - Zero-page variable map (`zero_page_variables.asm`, `ram_variables.asm`)
  - Controller reading routine (`Bank31_fixed_bank.asm`, `_F{_NMI_READ_JOYPAD`)
  - Game state machine and memory addresses
- **[IIpepeII's NestopiaExtractor gist](https://gist.github.com/IIpepeII/fb09015e45a265bfe557cb608a9d8683)** -- Memory address reference for in-game stats (scores, team stats, player stats)
- **[Tecmo Geek](https://tecmogeek.com/)** -- Player attribute validation (839/840 exact match with ROM extraction)

## Requirements

- **Node.js** 18+ with ESM support
- **nesl** emulator (see build instructions above)
- **Tecmo Super Bowl (USA).nes** ROM file

## Setup

```bash
# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Extract player/team data from ROM
npm run extract-rom

# Seed database
npm run db:seed

# Run tests
npm test
```

## Project Structure

```
src/
├── db/               # Database layer (Knex + better-sqlite3)
└── emulator/
    ├── index.js      # Node.js emulator wrapper
    └── lua/
        ├── memory.lua      # TSB memory addresses
        └── controller.lua  # Game navigation and input

scripts/
├── extract-rom-data.js   # ROM data extraction
├── seed.js               # Database seeding
└── test-emulator.js      # Emulator integration test

tests/
├── db/           # Database schema and data tests
└── emulator/     # Emulator wrapper tests
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

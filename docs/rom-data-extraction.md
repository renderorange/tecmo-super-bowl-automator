# ROM Data Extraction

This document describes how team and player data (names, jersey numbers, positions, and all gameplay attributes) are extracted directly from the Tecmo Super Bowl NES ROM binary.

## Background

Tecmo Super Bowl (1991, NES) stores 28 NFL teams with 30 players each (840 total). Each player has a name, jersey number, roster position, and a set of gameplay attributes that control in-game behavior (speed, passing accuracy, ball control, etc.).

Early attempts to extract this data relied on pattern-matching player name strings in the ROM and pulling attribute values from an external fan site (Tecmo Geek). This worked for names but the attribute locations in the ROM could not be found through brute-force searching alone. The attributes are stored in a packed nibble format that is not detectable without understanding the ROM's internal structure.

The breakthrough came from bruddog's complete 6502 disassembly of the game, which documents every byte of the ROM with labels and comments.

## Sources

### Primary: bruddog's NES Disassembly

- **Repository**: https://github.com/bruddog/Tecmo_Super_Bowl_NES_Disassembly
- **Key file**: `Bank1_2_team_data.asm`
- **Description**: A complete, commented, labeled 6502 disassembly of the Tecmo Super Bowl ROM. Every instruction and memory location has been reverse engineered. Created over several years by bruddog (with initial raw disassembly by jstout from tecmobowl.org).
- **Usage**: Provided the exact ROM layout for player names (pointer table at $8000) and player abilities (data block at $B000), including the nibble encoding scheme and per-position byte formats.

### Verification: Tecmo Geek

- **Website**: https://tecmogeek.com/
- **Repository**: https://github.com/ubuwaits/tecmogeek
- **Description**: A fan-maintained database of Tecmo Super Bowl player attributes, widely considered accurate by the community.
- **Usage**: Used strictly for cross-validation. After extracting attributes from the ROM, every player was compared against the Tecmo Geek dataset. Result: 839 of 840 players matched exactly. The single discrepancy (John Taylor WR1 Receptions: ROM=69, Tecmo Geek=63) indicates a minor error in the Tecmo Geek data, since the ROM is the ground truth.

### Reference: EdibleAntiPerspirant's Attribute Guide

- **Source**: https://gamefaqs.gamespot.com/nes/587686-tecmo-super-bowl/faqs/44195
- **Description**: Explains what each attribute does in gameplay terms, including the 16-notch scale, probability tables for catches/interceptions/fumbles, and which attributes are useless (Accuracy of Passing and Quickness have no effect on gameplay despite being stored in the ROM).
- **Usage**: Provided understanding of the attribute scale and gameplay mechanics. Confirmed that the 16-value nibble scale (6, 13, 19, 25, 31, 38, 44, 50, 56, 63, 69, 75, 81, 88, 94, 100) matches what the community has documented.

### Reference: NestopiaExtractor (IIpepeII)

- **Source**: https://gist.github.com/IIpepeII/fb09015e45a265bfe557cb608a9d8683
- **Description**: A PHP class that reads in-game stats from FCEUX/Nestopia save states. Provides memory addresses for score locations, team stats, and player stats during gameplay.
- **Usage**: Memory addresses for the Lua game controller (runtime stat extraction during automated season play). Not used for ROM data extraction.

## ROM Structure

### NES ROM Layout

The ROM file begins with a 16-byte iNES header:

```
Offset  Value   Meaning
0x00    "NES"   Magic number
0x03    0x1A    MS-DOS EOF marker
0x04    0x10    16 PRG ROM banks (16KB each = 256KB PRG)
0x05    0x10    16 CHR ROM banks (8KB each = 128KB CHR)
0x06    0x42    Mapper flags (MMC1, battery-backed)
0x07-0F 0x00    Unused
```

Total file size: 16 (header) + 262144 (PRG) + 131072 (CHR) = 393232 bytes.

### Bank 1/2: Player Names and Abilities

Banks 1 and 2 occupy the first 16KB of PRG ROM, mapped to CPU address range $8000-$BFFF (file offsets 0x0010-0x400F).

The data is organized into four sections:

| Section | CPU Address | File Offset | Content |
|---------|-------------|-------------|---------|
| Team Pointer Table | $8000 | 0x0010 | 28 WORD pointers to team player lists |
| Player Name Pointers | $8038+ | 0x0048+ | 30 WORD pointers per team to player entries |
| Player Names | ~$86C8+ | ~0x06D8+ | Jersey byte + ASCII name strings |
| Player Abilities | $B000 | 0x3010 | Packed nibble attribute data |

## Name Extraction

### Pointer Chain

1. **Team Pointer Table** (28 entries at $8000): Each entry is a 16-bit little-endian address pointing to a team's player list.

2. **Player List** (30 entries per team): Each entry is a 16-bit little-endian address pointing to an individual player's name data.

3. **Player Entry**: One byte for jersey number followed by an ASCII name string.

```
Team Ptr Table ($8000)
  |
  +--> Buffalo List ($8038)
  |      |
  |      +--> QB1 ($86C8): $00 "qbBILLS"
  |      +--> QB2 ($86D2): $14 "frankREICH"
  |      +--> RB1 ($86DD): $34 "thurmanTHOMAS"
  |      ...
  |
  +--> Indianapolis List ($8074)
  |      ...
  ...
```

### Name Format

Player names follow a consistent encoding:

- First name: lowercase ASCII (`joe`, `thurman`, `bo`)
- Last name: UPPERCASE ASCII (`MONTANA`, `THOMAS`, `JACKSON`)
- No null terminator between entries; boundaries are defined by the pointer table

Some names contain spaces or periods: `ivy joeHUNTER`, `john l.WILLIAMS`, `steve DE BERG`, `harper LE BEL`. These are handled by detecting the lowercase-to-uppercase transition to split first/last names.

### Jersey Numbers

Jersey numbers are stored as single bytes. Values map directly to the jersey number using hexadecimal notation that looks like decimal: `$16` = jersey 16 (Joe Montana), `$34` = jersey 34 (Thurman Thomas), `$80` = jersey 80 (James Lofton).

### Team Order in ROM

The team ordering in the ROM pointer table differs from other common orderings:

| Index | Team | Index | Team |
|-------|------|-------|------|
| 0 | Buffalo | 14 | Washington |
| 1 | Indianapolis | 15 | NY Giants |
| 2 | Miami | 16 | Philadelphia |
| 3 | New England | 17 | Phoenix |
| 4 | NY Jets | 18 | Dallas |
| 5 | Cincinnati | 19 | Chicago |
| 6 | Cleveland | 20 | Detroit |
| 7 | Houston | 21 | Green Bay |
| 8 | Pittsburgh | 22 | Minnesota |
| 9 | Denver | 23 | Tampa Bay |
| 10 | Kansas City | 24 | San Francisco |
| 11 | LA Raiders | 25 | LA Rams |
| 12 | San Diego | 26 | New Orleans |
| 13 | Seattle | 27 | Atlanta |

## Attribute Extraction

### Nibble Encoding

Attributes are stored as 4-bit nibble values (0x0 through 0xF). Two attributes are packed into each byte: the high nibble (bits 7-4) holds one attribute, the low nibble (bits 3-0) holds another.

The 16 nibble values map to these gameplay ratings:

| Nibble | 0x0 | 0x1 | 0x2 | 0x3 | 0x4 | 0x5 | 0x6 | 0x7 | 0x8 | 0x9 | 0xA | 0xB | 0xC | 0xD | 0xE | 0xF |
|--------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| Rating | 6 | 13 | 19 | 25 | 31 | 38 | 44 | 50 | 56 | 63 | 69 | 75 | 81 | 88 | 94 | 100 |

Each increment (one "notch") adds 6 or 7 to the value.

### Byte Layout by Position

All positions share the first 3 bytes. Positions 4 and 5 vary by role:

**Bytes 1-3 (all positions):**

| Byte | High Nibble | Low Nibble |
|------|-------------|------------|
| 1 | Rushing Power (RP) | Running Speed (RS) |
| 2 | Maximum Speed (MS) | Hitting Power (HP) |
| 3 | Face Identifier (full byte, not nibble-encoded) |

**Byte 4 (varies by position group):**

| Position Group | High Nibble | Low Nibble |
|----------------|-------------|------------|
| QB | Passing Speed (PS) | Pass Control (PC) |
| RB, WR, TE | Ball Control (BC) | Receptions (REC) |
| DL, LB, DB | Pass Interceptions (INT) | Quickness (QU) |
| K, P | Kicking Ability (KA) | Avoid Kick Block (AKB) |
| OL | (no byte 4) | |

**Byte 5 (QB only):**

| High Nibble | Low Nibble |
|-------------|------------|
| Accuracy of Passing (AP) | Avoid Pass Block (APB) |

### Bytes Per Position

| Position | Bytes | Total per team |
|----------|-------|----------------|
| QB1, QB2 | 5 each | 10 |
| RB1-RB4 | 4 each | 16 |
| WR1-WR4 | 4 each | 16 |
| TE1, TE2 | 4 each | 8 |
| C, LG, RG, LT, RT | 3 each | 15 |
| RE, NT, LE | 4 each | 12 |
| ROLB, RILB, LILB, LOLB | 4 each | 16 |
| RCB, LCB, FS, SS | 4 each | 16 |
| K, P | 4 each | 8 |
| **Team total** | | **117** |

28 teams at 117 bytes each = 3276 bytes, fitting within the $B000-$BFFF range.

### Worked Example: Joe Montana

ROM bytes at the San Francisco 49ers ability block (team index 24, offset 0x3010 + 24*117 = 0x3B08):

```
Byte 1: 0xA3  ->  RP = nibble 0xA = 69,  RS = nibble 0x3 = 25
Byte 2: 0x21  ->  MS = nibble 0x2 = 19,  HP = nibble 0x1 = 13
Byte 3: 0x01  ->  Face = 1
Byte 4: 0x8C  ->  PS = nibble 0x8 = 56,  PC = nibble 0xC = 81
Byte 5: 0xCB  ->  AP = nibble 0xC = 81,  APB = nibble 0xB = 75
```

These values match the Tecmo Geek reference exactly.

### Gameplay Notes on Attributes

Per the community research at GameFAQs attribute guide:

- **Accuracy of Passing (AP)** and **Quickness (QU)** are stored in the ROM but have no effect on gameplay. They are dead code.
- **Ball Control for QBs and Punt Returners** is hard-coded to a fixed value (equivalent to 44 BC) regardless of what's in the ROM.
- **Kick/Punt Returner Maximum Speed** is bugged: it uses the right tackle's MS (for kick returns) or strong safety's MS (for punt returns) instead of the returner's own MS.

## Extraction Script

The extraction is performed by `scripts/extract-rom-data.js`. It reads the ROM binary directly, follows the pointer tables for names, reads the contiguous ability block, and outputs `src/db/seeds/teams_with_attributes.json`.

```bash
node scripts/extract-rom-data.js [path-to-rom]
```

The script requires no network access, no external data files, and no emulator. It operates purely on the ROM binary.

## Validation

After extraction, every player's attributes were compared against the Tecmo Geek dataset:

- **840 players** extracted from ROM
- **840 players** found in Tecmo Geek
- **839 exact matches** across all attributes
- **1 discrepancy**: John Taylor (SF WR1) Receptions = 69 in ROM, 63 on Tecmo Geek

The ROM is the authoritative source. The Tecmo Geek discrepancy is a data entry error on their end.

#!/usr/bin/env node

/**
 * Extract all team and player data directly from the Tecmo Super Bowl NES ROM.
 *
 * Data layout discovered from bruddog's Tecmo_Super_Bowl_NES_Disassembly:
 * - Bank 1/2 ($8000-$BFFF) contains player names and abilities
 * - Name pointer table at $8000 (file offset: 0x10)
 * - Abilities data at $B000 (file offset: 0x3010)
 * - Attributes stored as packed nibbles (4-bit values, 0x0-0xF)
 * - 117 bytes per team, 28 teams
 *
 * Source: https://github.com/bruddog/Tecmo_Super_Bowl_NES_Disassembly
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = process.argv[2] || "/home/blaine/roms/nes/Tecmo Super Bowl (USA).nes";
const OUTPUT_PATH = path.join(__dirname, "..", "src", "db", "seeds", "teams_with_attributes.json");

// iNES header is 16 bytes; Bank 1 maps CPU $8000 to file offset 0x10
const INES_HEADER_SIZE = 0x10;
const BANK_CPU_BASE = 0x8000;
const ABILITIES_CPU_ADDR = 0xB000;
const ABILITIES_FILE_OFFSET = ABILITIES_CPU_ADDR - BANK_CPU_BASE + INES_HEADER_SIZE;

// 16 possible attribute notch values (nibble 0x0 through 0xF)
const ATTR_VALUES = [6, 13, 19, 25, 31, 38, 44, 50, 56, 63, 69, 75, 81, 88, 94, 100];

// Team order in ROM (matches disassembly pointer table order)
// NOTE: this differs from the extract-from-rom.js team ordering
const TEAMS = [
    { id: 0,  name: "Bills",       city: "Buffalo",        abbr: "BUF", conference: "AFC", division: "East" },
    { id: 1,  name: "Colts",       city: "Indianapolis",   abbr: "IND", conference: "AFC", division: "East" },
    { id: 2,  name: "Dolphins",    city: "Miami",          abbr: "MIA", conference: "AFC", division: "East" },
    { id: 3,  name: "Patriots",    city: "New England",    abbr: "NEP", conference: "AFC", division: "East" },
    { id: 4,  name: "Jets",        city: "New York",       abbr: "NYJ", conference: "AFC", division: "East" },
    { id: 5,  name: "Bengals",     city: "Cincinnati",     abbr: "CIN", conference: "AFC", division: "Central" },
    { id: 6,  name: "Browns",      city: "Cleveland",      abbr: "CLE", conference: "AFC", division: "Central" },
    { id: 7,  name: "Oilers",      city: "Houston",        abbr: "HOU", conference: "AFC", division: "Central" },
    { id: 8,  name: "Steelers",    city: "Pittsburgh",     abbr: "PIT", conference: "AFC", division: "Central" },
    { id: 9,  name: "Broncos",     city: "Denver",         abbr: "DEN", conference: "AFC", division: "West" },
    { id: 10, name: "Chiefs",      city: "Kansas City",    abbr: "KAN", conference: "AFC", division: "West" },
    { id: 11, name: "Raiders",     city: "Los Angeles",    abbr: "RAI", conference: "AFC", division: "West" },
    { id: 12, name: "Chargers",    city: "San Diego",      abbr: "LAC", conference: "AFC", division: "West" },
    { id: 13, name: "Seahawks",    city: "Seattle",        abbr: "SEA", conference: "AFC", division: "West" },
    { id: 14, name: "Redskins",    city: "Washington",     abbr: "WAS", conference: "NFC", division: "East" },
    { id: 15, name: "Giants",      city: "New York",       abbr: "NYG", conference: "NFC", division: "East" },
    { id: 16, name: "Eagles",      city: "Philadelphia",   abbr: "PHI", conference: "NFC", division: "East" },
    { id: 17, name: "Cardinals",   city: "Phoenix",        abbr: "PHO", conference: "NFC", division: "East" },
    { id: 18, name: "Cowboys",     city: "Dallas",         abbr: "DAL", conference: "NFC", division: "East" },
    { id: 19, name: "Bears",       city: "Chicago",        abbr: "CHI", conference: "NFC", division: "Central" },
    { id: 20, name: "Lions",       city: "Detroit",        abbr: "DET", conference: "NFC", division: "Central" },
    { id: 21, name: "Packers",     city: "Green Bay",      abbr: "GB",  conference: "NFC", division: "Central" },
    { id: 22, name: "Vikings",     city: "Minnesota",      abbr: "MIN", conference: "NFC", division: "Central" },
    { id: 23, name: "Buccaneers",  city: "Tampa Bay",      abbr: "TB",  conference: "NFC", division: "Central" },
    { id: 24, name: "49ers",       city: "San Francisco",  abbr: "SF",  conference: "NFC", division: "West" },
    { id: 25, name: "Rams",        city: "Los Angeles",    abbr: "LAR", conference: "NFC", division: "West" },
    { id: 26, name: "Saints",      city: "New Orleans",    abbr: "NO",  conference: "NFC", division: "West" },
    { id: 27, name: "Falcons",     city: "Atlanta",        abbr: "ATL", conference: "NFC", division: "West" },
];

// 30 roster positions per team in ROM order
const POSITIONS = [
    "QB1", "QB2",
    "RB1", "RB2", "RB3", "RB4",
    "WR1", "WR2", "WR3", "WR4",
    "TE1", "TE2",
    "C", "LG", "RG", "LT", "RT",
    "RE", "NT", "LE",
    "ROLB", "RILB", "LILB", "LOLB",
    "RCB", "LCB", "FS", "SS",
    "K", "P",
];

// Position group for simplified categorization
const POSITION_GROUP = {
    "QB1": "QB", "QB2": "QB",
    "RB1": "RB", "RB2": "RB", "RB3": "RB", "RB4": "RB",
    "WR1": "WR", "WR2": "WR", "WR3": "WR", "WR4": "WR",
    "TE1": "TE", "TE2": "TE",
    "C": "OL", "LG": "OL", "RG": "OL", "LT": "OL", "RT": "OL",
    "RE": "DL", "NT": "DL", "LE": "DL",
    "ROLB": "LB", "RILB": "LB", "LILB": "LB", "LOLB": "LB",
    "RCB": "DB", "LCB": "DB", "FS": "DB", "SS": "DB",
    "K": "K", "P": "P",
};

// Bytes per position in the abilities section
// QB: 5 bytes (RP/RS, MS/HP, Face, PS/PC, AP/APB)
// RB/WR/TE: 4 bytes (RP/RS, MS/HP, Face, BC/REC)
// OL: 3 bytes (RP/RS, MS/HP, Face)
// DL/LB/DB: 4 bytes (RP/RS, MS/HP, Face, INT/QU)
// K/P: 4 bytes (RP/RS, MS/HP, Face, KA/AKB)
const ABILITY_BYTES = {
    "QB1": 5, "QB2": 5,
    "RB1": 4, "RB2": 4, "RB3": 4, "RB4": 4,
    "WR1": 4, "WR2": 4, "WR3": 4, "WR4": 4,
    "TE1": 4, "TE2": 4,
    "C": 3, "LG": 3, "RG": 3, "LT": 3, "RT": 3,
    "RE": 4, "NT": 4, "LE": 4,
    "ROLB": 4, "RILB": 4, "LILB": 4, "LOLB": 4,
    "RCB": 4, "LCB": 4, "FS": 4, "SS": 4,
    "K": 4, "P": 4,
};

const TEAM_ABILITY_SIZE = Object.values(ABILITY_BYTES)
    .reduce((a, b) => a + b, 0); // 117

function cpuToFile (addr) {
    return addr - BANK_CPU_BASE + INES_HEADER_SIZE;
}

function nibbleHigh (byte) {
    return ATTR_VALUES[(byte >> 4) & 0x0F];
}

function nibbleLow (byte) {
    return ATTR_VALUES[byte & 0x0F];
}

function extractNames (rom) {
    // Read 28 team pointers from $8000
    const team_ptrs = [];
    for (let i = 0; i < 28; i++) {
        const fo = INES_HEADER_SIZE + i * 2;
        team_ptrs.push((rom[fo + 1] << 8) | rom[fo]);
    }

    // Build flat array of all player CPU addresses (28 teams * 30 players + 1 end sentinel)
    const all_ptrs = [];
    for (let t = 0; t < 28; t++) {
        const list_fo = cpuToFile(team_ptrs[t]);
        for (let p = 0; p < 30; p++) {
            const fo = list_fo + p * 2;
            all_ptrs.push((rom[fo + 1] << 8) | rom[fo]);
        }
    }

    // Read end sentinel pointer (after last team's 30th entry)
    const last_list_fo = cpuToFile(team_ptrs[27]);
    const end_fo = last_list_fo + 30 * 2;
    all_ptrs.push((rom[end_fo + 1] << 8) | rom[end_fo]);

    // Extract each player's jersey number and name
    const players = [];
    for (let i = 0; i < 28 * 30; i++) {
        const start = cpuToFile(all_ptrs[i]);
        const end = cpuToFile(all_ptrs[i + 1]);
        const team_idx = Math.floor(i / 30);
        const pos_idx = i % 30;

        const raw_jersey = rom[start];
        // Jersey numbers > 99 have the high bit set in the ROM encoding
        // but they are stored as-is in a single byte. Values like 0x80 = 128
        // actually represent jersey #80 (the $80 is just hex for 128, and the
        // display format in-game handles it). In the disassembly, jerseys are
        // stored as decimal-looking hex: $34 = jersey 34, $80 = jersey 80.
        // So we just use the raw byte value directly as the jersey number.
        const jersey = raw_jersey;

        // Read raw name bytes
        let raw_name = "";
        for (let j = start + 1; j < end; j++) {
            const b = rom[j];
            if (b >= 0x20 && b < 0x80) {
                raw_name += String.fromCharCode(b);
            }
        }

        // Parse into first/last: lowercase = first name, UPPERCASE = last name
        // Some names have spaces/periods in them (e.g. "ivy joeHUNTER", "john l.WILLIAMS")
        let first_end = 0;
        for (let c = 0; c < raw_name.length; c++) {
            if (raw_name[c] >= "A" && raw_name[c] <= "Z") {
                first_end = c;
                break;
            }
        }

        const first_raw = raw_name.slice(0, first_end);
        const last_raw = raw_name.slice(first_end);

        // Format: capitalize first letter of first name, title-case last name
        let first_name = first_raw;
        if (first_name.length > 0) {
            // Capitalize first letter, keep spaces/periods as-is
            const parts = first_name.split(" ");
            first_name = parts.map((p) => {
                if (p.length === 0) {
                    return p;
                }
                return p.charAt(0)
                    .toUpperCase() + p.slice(1);
            })
                .join(" ");
        }

        let last_name = last_raw;
        if (last_name.length > 0) {
            // Title case: first char stays uppercase, rest lowercase
            // But handle cases like "O.BRIEN" -> "O'Brien", "DE BERG" -> "De Berg"
            const parts = last_name.split(" ");
            last_name = parts.map((part) => {
                if (part.includes(".")) {
                    // e.g. "O.BRIEN" or "O.NEAL"
                    return part.split(".")
                        .map((seg) =>
                            seg.length > 0 ? seg.charAt(0) + seg.slice(1)
                                .toLowerCase() : "",
                        )
                        .join(".");
                }
                return part.charAt(0) + part.slice(1)
                    .toLowerCase();
            })
                .join(" ");
        }

        const full_name = (first_name + " " + last_name).trim();

        players.push({
            team_idx,
            pos_idx,
            position_detail: POSITIONS[pos_idx],
            position: POSITION_GROUP[POSITIONS[pos_idx]],
            jersey,
            raw_name,
            name: full_name,
            name_rom_offset: start,
        });
    }

    return players;
}

function extractAbilities (rom) {
    const abilities = [];

    for (let team_idx = 0; team_idx < 28; team_idx++) {
        let offset = ABILITIES_FILE_OFFSET + (team_idx * TEAM_ABILITY_SIZE);

        for (let pos_idx = 0; pos_idx < 30; pos_idx++) {
            const position = POSITIONS[pos_idx];
            const group = POSITION_GROUP[position];
            const num_bytes = ABILITY_BYTES[position];

            // Byte 1: RP (high nibble), RS (low nibble) -- all positions
            const byte1 = rom[offset];
            const rushing_power = nibbleHigh(byte1);
            const running_speed = nibbleLow(byte1);
            offset++;

            // Byte 2: MS (high nibble), HP (low nibble) -- all positions
            const byte2 = rom[offset];
            const maximum_speed = nibbleHigh(byte2);
            const hitting_power = nibbleLow(byte2);
            offset++;

            // Byte 3: Face identifier (full byte) -- all positions
            const face = rom[offset];
            offset++;

            let attrs = {
                rushing_power,
                running_speed,
                maximum_speed,
                hitting_power,
                face,
            };

            if (num_bytes >= 4) {
                const byte4 = rom[offset];
                offset++;

                if (group === "QB") {
                    // Byte 4: PS (high), PC (low)
                    attrs.passing_speed = nibbleHigh(byte4);
                    attrs.pass_control = nibbleLow(byte4);
                } else if (["RB", "WR", "TE"].includes(group)) {
                    // Byte 4: BC (high), REC (low)
                    attrs.ball_control = nibbleHigh(byte4);
                    attrs.receptions = nibbleLow(byte4);
                } else if (["DL", "LB", "DB"].includes(group)) {
                    // Byte 4: INT (high), QU (low)
                    attrs.pass_interceptions = nibbleHigh(byte4);
                    attrs.quickness = nibbleLow(byte4);
                } else if (group === "K" || group === "P") {
                    // Byte 4: KA (high), AKB (low)
                    attrs.kicking_ability = nibbleHigh(byte4);
                    attrs.avoid_kick_block = nibbleLow(byte4);
                }
            }

            if (num_bytes >= 5 && group === "QB") {
                // Byte 5: AP (high), APB (low)
                const byte5 = rom[offset];
                attrs.accuracy_of_passing = nibbleHigh(byte5);
                attrs.avoid_pass_block = nibbleLow(byte5);
                offset++;
            }

            abilities.push({
                team_idx,
                pos_idx,
                ability_rom_offset: offset - num_bytes,
                ...attrs,
            });
        }
    }

    return abilities;
}

function main () {
    if (!fs.existsSync(ROM_PATH)) {
        console.error("ROM not found:", ROM_PATH);
        process.exit(1);
    }

    const rom = fs.readFileSync(ROM_PATH);
    console.log("ROM: %d bytes", rom.length);

    const names = extractNames(rom);
    const abilities = extractAbilities(rom);

    console.log("Extracted %d player names", names.length);
    console.log("Extracted %d player abilities", abilities.length);

    // Merge names and abilities by (team_idx, pos_idx)
    const players = [];
    let player_id = 0;
    for (let i = 0; i < names.length; i++) {
        const n = names[i];
        const a = abilities[i];

        if (n.team_idx !== a.team_idx || n.pos_idx !== a.pos_idx) {
            console.error("Mismatch at index %d: name team=%d pos=%d, ability team=%d pos=%d",
                i, n.team_idx, n.pos_idx, a.team_idx, a.pos_idx);
            process.exit(1);
        }

        const { team_idx, pos_idx, ability_rom_offset, face, ...attr_values } = a;

        players.push({
            id: player_id++,
            team_id: TEAMS[n.team_idx].id,
            name: n.name,
            position: n.position,
            position_detail: n.position_detail,
            jersey: n.jersey,
            face,
            name_rom_offset: n.name_rom_offset,
            ability_rom_offset: ability_rom_offset,
            ...attr_values,
        });
    }

    const teams = TEAMS.map((t) => ({
        id: t.id,
        name: t.name,
        city: t.city,
        abbreviation: t.abbr,
        conference: t.conference,
        division: t.division,
    }));

    const output = {
        teams,
        players,
        _metadata: {
            source: "Direct ROM extraction (names + abilities)",
            rom_path: ROM_PATH,
            rom_size: rom.length,
            extracted_at: new Date()
                .toISOString(),
            total_teams: teams.length,
            total_players: players.length,
            abilities_rom_offset: "0x" + ABILITIES_FILE_OFFSET.toString(16),
            team_ability_size: TEAM_ABILITY_SIZE,
            disassembly_reference: "https://github.com/bruddog/Tecmo_Super_Bowl_NES_Disassembly",
            attribute_scale: "Nibble 0x0-0xF maps to: [6, 13, 19, 25, 31, 38, 44, 50, 56, 63, 69, 75, 81, 88, 94, 100]",
        },
    };

    // Print some verification
    const montana = players.find((p) => p.name === "Joe Montana");
    if (montana) {
        console.log("\nVerification - Joe Montana:");
        console.log(
            "  RP=%d, RS=%d, MS=%d, HP=%d",
            montana.rushing_power, montana.running_speed,
            montana.maximum_speed, montana.hitting_power,
        );
        console.log(
            "  PS=%d, PC=%d, AP=%d, APB=%d",
            montana.passing_speed, montana.pass_control,
            montana.accuracy_of_passing, montana.avoid_pass_block,
        );
    }

    const thurman = players.find((p) => p.name === "Thurman Thomas");
    if (thurman) {
        console.log("\nVerification - Thurman Thomas:");
        console.log("  RP=%d, RS=%d, MS=%d, HP=%d, BC=%d, REC=%d",
            thurman.rushing_power, thurman.running_speed, thurman.maximum_speed,
            thurman.hitting_power, thurman.ball_control, thurman.receptions);
    }

    const lt = players.find((p) => p.name === "Lawrence Taylor");
    if (lt) {
        console.log("\nVerification - Lawrence Taylor:");
        console.log("  RP=%d, RS=%d, MS=%d, HP=%d, INT=%d, QU=%d",
            lt.rushing_power, lt.running_speed, lt.maximum_speed,
            lt.hitting_power, lt.pass_interceptions, lt.quickness);
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log("\nSaved %d teams, %d players to %s", teams.length, players.length, OUTPUT_PATH);
}

main();

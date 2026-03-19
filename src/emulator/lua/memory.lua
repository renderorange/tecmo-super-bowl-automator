-- Memory addresses for Tecmo Super Bowl
-- Sources:
-- - https://github.com/bruddog/Tecmo_Super_Bowl_NES_Disassembly
--   (zero_page_variables.asm, ram_variables.asm, sram_variables.asm, stat_indexes.asm)

------------------------------------------------------------------------
-- RAM addresses (zero-page and general)
------------------------------------------------------------------------
local ADDR = {
    -- Game status
    GAME_STATUS = 0x2D, -- Bit flags: $02=season, $40=game in progress, etc.
    FRAME_COUNTER = 0x30,

    -- Joypad state (written by NMI handler each frame)
    -- TSB bit layout (MSB-first via ROL): A=0x80, B=0x40, Sel=0x20, Start=0x10,
    --   Up=0x08, Down=0x04, Left=0x02, Right=0x01
    JOY_RAW_1 = 0x35,
    JOY_PRESS_1 = 0x38,
    JOY_PRESS_BOTH = 0x3A,

    -- Team IDs (0x00-0x1B = 28 teams)
    P1_TEAM = 0x6C,
    P2_TEAM = 0x6D,
    TEAM_ON_OFFENSE = 0x6F, -- 0=P1, 1=P2

    -- Control type for current matchup
    TEAM_CONTROL_TYPES = 0x75, -- High nibble=P1, Low nibble=P2
    -- 0=MAN, 1=COA, 2=COM, 3=SKP

    -- Quarter/Down/Clock
    QUARTER = 0x76, -- 0-based (0=Q1, 3=Q4)
    DOWN = 0x77,
    CLOCK_SECONDS = 0x6A,
    CLOCK_MINUTES = 0x6B,

    -- Menu cursor
    MENU_Y = 0xE1, -- Current menu selection index

    -- Scores (RAM, not SRAM)
    -- 5 bytes per team at $0395: Q1, Q2, Q3, Q4, Total
    -- NOTE: Per-quarter bytes may not sum to total (OT, defensive scores).
    -- Use the total as the authoritative final score.
    P1_TOTAL_SCORE = 0x0399,
    P2_TOTAL_SCORE = 0x039E,
}

------------------------------------------------------------------------
-- SRAM addresses ($6000-$7FFF, battery-backed)
-- Writes require MMC3 enable: memory.writebyte(0xA001, 0x80)
------------------------------------------------------------------------
local SRAM = {
    -- CPU boosts ($6678, 6 bytes)
    CPU_BOOSTS = 0x6678, -- 6 bytes: def_ms, off_ms, def_int, pass_ctrl, reception, boost_idx

    -- Playbook edits ($667E, 16 bytes)
    P1_PLAYBOOK = 0x667E, -- 8 bytes
    P2_PLAYBOOK = 0x6686, -- 8 bytes

    -- In-game team stats (from sram_variables.asm)
    -- IN_GAME_TEAM_STATS[] starts at $668E (after CPU_BOOSTS $6678 + 6 = $667E,
    -- then playbooks $667E + 16 = $668E)
    -- NOTE: Only first_downs and rush_att are populated in COM vs COM mode.
    --       rush_yards and pass_yards are always 0 - use player-derived stats instead.
    P1_FIRST_DOWNS = 0x668E, -- Works in COM mode
    P2_FIRST_DOWNS = 0x668F, -- Works in COM mode
    P1_TEAM_RUSH_ATTEMPTS = 0x6690, -- Works in COM mode
    P2_TEAM_RUSH_ATTEMPTS = 0x6691, -- Works in COM mode
    P1_TEAM_RUSH_YARDS = 0x6692, -- Always 0 in COM mode (2 bytes)
    P2_TEAM_RUSH_YARDS = 0x6694, -- Always 0 in COM mode (2 bytes)
    P1_TEAM_PASS_YARDS = 0x6696, -- Always 0 in COM mode (2 bytes)
    P2_TEAM_PASS_YARDS = 0x6698, -- Always 0 in COM mode (2 bytes)

    -- Team control types (28 bytes, one per team: 0=MAN,1=COA,2=COM,3=SKP)
    TEAM_TYPE_SEASON = 0x669B,

    -- Season tracking
    CURRENT_WEEK = 0x6758, -- 0-based week index
    CURRENT_GAME = 0x6759, -- Current game within week
    WEEKLY_MATCHUPS = 0x675A, -- 28 bytes: pairs of team IDs

    -- Season standings pointer table (CPU $DF17, in fixed bank)
    -- 28 entries x 2 bytes, each pointing to a team's 208-byte ($D0) season info block
    TEAM_SEASON_PTR_TABLE = 0xDF17,

    -- Season info block offsets (within each team's $D0-byte block)
    SEASON_WINS_OFFSET = 0xB2,
    SEASON_LOSSES_OFFSET = 0xB3,
    SEASON_TIES_OFFSET = 0xB4,
    SEASON_PTS_FOR_OFFSET = 0xB5, -- 2 bytes little-endian
    SEASON_PTS_AGAINST_OFFSET = 0xB7, -- 2 bytes little-endian
    SEASON_PASS_YDS_ALLOWED_OFFSET = 0xB9, -- 2 bytes
    SEASON_RUSH_YDS_ALLOWED_OFFSET = 0xBB, -- 2 bytes

    -- In-game player stats
    -- Each team block: QB(10)*2 + RB(16)*4 + WR(16)*4 + TE(16)*2 + DEF(5)*11
    --   + K(4) + P(3) + playbook(4) + starters(4) + injuries(3) + conditions(8) = 261 bytes
    P1_STATS = 0x6406, -- Start of P1 player stats block
    P2_STATS = 0x650B, -- Start of P2 player stats block (P1 + 261 = $6406 + $105)

    -- Player stat block offsets (from team stats start)
    -- QB: 10 bytes each, 2 QBs
    QB1_OFFSET = 0,
    QB2_OFFSET = 10,
    -- RB: 16 bytes each, 4 RBs
    RB1_OFFSET = 20,
    RB2_OFFSET = 36,
    RB3_OFFSET = 52,
    RB4_OFFSET = 68,
    -- WR: 16 bytes each, 4 WRs
    WR1_OFFSET = 84,
    WR2_OFFSET = 100,
    WR3_OFFSET = 116,
    WR4_OFFSET = 132,
    -- TE: 16 bytes each, 2 TEs
    TE1_OFFSET = 148,
    TE2_OFFSET = 164,
    -- DEF: 5 bytes each, 11 defenders
    RE_OFFSET = 180,
    NT_OFFSET = 185,
    LE_OFFSET = 190,
    ROLB_OFFSET = 195,
    RILB_OFFSET = 200,
    LILB_OFFSET = 205,
    LOLB_OFFSET = 210,
    RCB_OFFSET = 215,
    LCB_OFFSET = 220,
    FS_OFFSET = 225,
    SS_OFFSET = 230,
    -- K: 4 bytes
    K_OFFSET = 235,
    -- P: 3 bytes
    P_OFFSET = 239,
    -- After player stats (242 bytes), the block continues:
    -- Playbook: 4 bytes at offset 242
    -- Starters: 4 bytes at offset 246
    -- Injuries: 3 bytes at offset 250 (2-bit status per skill player, 4 per byte)
    -- Conditions: 8 bytes at offset 253 (2-bit condition per roster slot, 4 per byte)
    PLAYBOOK_OFFSET = 242,
    STARTERS_OFFSET = 246,
    INJURIES_OFFSET = 250,
    CONDITIONS_OFFSET = 253,

    -- In-game starters ($6610 for P1, $6644 for P2)
    -- Contains team_id + roster_id pairs for each active position
    P1_STARTERS = 0x6610,
    P2_STARTERS = 0x6644,
    -- Starter block layout (offsets from starters base):
    -- Skill starters: 12 bytes (6 pairs: QB, RB, WR, TE targets)
    -- OL starters: 10 bytes (5 pairs)
    -- DEF starters: 22 bytes (11 pairs)
    -- K starter: 2 bytes, P starter: 2 bytes
    -- KR starter: 2 bytes, PR starter: 2 bytes
    -- Total: 52 bytes per team
    KR_STARTER_OFFSET = 48, -- Kick return specialist (2 bytes: team_id, roster_id)
    PR_STARTER_OFFSET = 50, -- Punt return specialist (2 bytes: team_id, roster_id)
}

------------------------------------------------------------------------
-- Stat byte indexes within each player's stat block
------------------------------------------------------------------------

-- QB (10 bytes)
local QB_STAT = {
    PASS_ATT = 0,
    PASS_COMP = 1,
    PASS_TD = 2,
    PASS_INT = 3,
    PASS_YDS_LO = 4, -- 16-bit little-endian with next byte
    PASS_YDS_HI = 5,
    RUSH_ATT = 6,
    RUSH_YDS_LO = 7,
    RUSH_YDS_HI = 8,
    RUSH_TD = 9,
}

-- Skill position: RB, WR, TE (16 bytes)
local SKILL_STAT = {
    REC = 0,
    REC_YDS_LO = 1,
    REC_YDS_HI = 2,
    REC_TD = 3,
    KR_ATT = 4,
    KR_YDS_LO = 5,
    KR_YDS_HI = 6,
    KR_TD = 7,
    PR_ATT = 8,
    PR_YDS_LO = 9,
    PR_YDS_HI = 10,
    PR_TD = 11,
    RUSH_ATT = 12,
    RUSH_YDS_LO = 13,
    RUSH_YDS_HI = 14,
    RUSH_TD = 15,
}

-- Defensive player (5 bytes)
local DEF_STAT = {
    SACKS = 0,
    INTS = 1,
    INT_YDS_LO = 2,
    INT_YDS_HI = 3,
    INT_TD = 4,
}

-- Kicker (4 bytes)
local K_STAT = {
    XP_ATT = 0,
    XP_MADE = 1,
    FG_ATT = 2,
    FG_MADE = 3,
}

-- Punter (3 bytes)
local P_STAT = {
    PUNTS = 0,
    PUNT_YDS_LO = 1,
    PUNT_YDS_HI = 2,
}

------------------------------------------------------------------------
-- Team ID mapping (0x00-0x1B)
-- Order matches the ROM's internal team index
------------------------------------------------------------------------
local TEAM_NAMES = {
    [0x00] = "BUF",
    [0x01] = "IND",
    [0x02] = "MIA",
    [0x03] = "NEP",
    [0x04] = "NYJ",
    [0x05] = "CIN",
    [0x06] = "CLE",
    [0x07] = "HOU",
    [0x08] = "PIT",
    [0x09] = "DEN",
    [0x0A] = "KAN",
    [0x0B] = "RAI",
    [0x0C] = "LAC",
    [0x0D] = "SEA",
    [0x0E] = "WAS",
    [0x0F] = "NYG",
    [0x10] = "PHI",
    [0x11] = "PHO",
    [0x12] = "DAL",
    [0x13] = "CHI",
    [0x14] = "DET",
    [0x15] = "GB",
    [0x16] = "MIN",
    [0x17] = "TB",
    [0x18] = "SF",
    [0x19] = "LAR",
    [0x1A] = "NO",
    [0x1B] = "ATL",
}

------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------

local function read16(addr)
    return memory.readbyte(addr) + memory.readbyte(addr + 1) * 256
end

local function read16_signed(addr)
    local val = read16(addr)
    if val >= 32768 then
        val = val - 65536
    end
    return val
end

local function readBytes(addr, len)
    local bytes = {}
    for i = 0, len - 1 do
        bytes[i] = memory.readbyte(addr + i)
    end
    return bytes
end

------------------------------------------------------------------------
-- Injury/condition helpers
------------------------------------------------------------------------

-- Injury status values (2-bit per player, packed 4 per byte)
local INJURY_STATUS = {
    [0] = "healthy",
    [1] = "probable",
    [2] = "questionable",
    [3] = "doubtful",
}

-- Condition values (2-bit per player, packed 4 per byte)
local CONDITION_STATUS = {
    [0] = "bad",
    [1] = "average",
    [2] = "good",
    [3] = "excellent",
}

-- Position names for injury bytes (only skill players can be injured)
local INJURY_POSITIONS = {
    [0] = "qb1",
    [1] = "qb2",
    [2] = "rb1",
    [3] = "rb2",
    [4] = "rb3",
    [5] = "rb4",
    [6] = "wr1",
    [7] = "wr2",
    [8] = "wr3",
    [9] = "wr4",
    [10] = "te1",
    [11] = "te2",
}

-- Position names for condition bytes (all 30 roster positions)
local CONDITION_POSITIONS = {
    [0] = "qb1",
    [1] = "qb2",
    [2] = "rb1",
    [3] = "rb2",
    [4] = "rb3",
    [5] = "rb4",
    [6] = "wr1",
    [7] = "wr2",
    [8] = "wr3",
    [9] = "wr4",
    [10] = "te1",
    [11] = "te2",
    [12] = "c",
    [13] = "lg",
    [14] = "rg",
    [15] = "lt",
    [16] = "rt",
    [17] = "re",
    [18] = "nt",
    [19] = "le",
    [20] = "rolb",
    [21] = "rilb",
    [22] = "lilb",
    [23] = "lolb",
    [24] = "rcb",
    [25] = "lcb",
    [26] = "fs",
    [27] = "ss",
    [28] = "k",
    [29] = "p",
}

-- Read injury statuses from 3 packed bytes at the given SRAM address.
-- Returns a table of {position_key = status_string} for injured players,
-- plus an "all" subtable with every player's raw status (0-3).
local function readInjuries(base_addr)
    local injured = {}
    local all = {}
    for byte_idx = 0, 2 do
        local b = memory.readbyte(base_addr + byte_idx)
        for slot = 0, 3 do
            local roster_id = byte_idx * 4 + slot
            local status = bit.band(bit.rshift(b, slot * 2), 0x03)
            local pos = INJURY_POSITIONS[roster_id]
            if pos then
                all[pos] = status
                if status > 0 then
                    injured[pos] = INJURY_STATUS[status]
                end
            end
        end
    end
    return injured, all
end

-- Read condition values from 8 packed bytes at the given SRAM address.
-- Returns a table of {position_key = status_string} for all 30 positions,
-- plus a raw table of {position_key = raw_value (0-3)}.
local function readConditions(base_addr)
    local conditions = {}
    local raw = {}
    for byte_idx = 0, 7 do
        local b = memory.readbyte(base_addr + byte_idx)
        for slot = 0, 3 do
            local roster_id = byte_idx * 4 + slot
            local status = bit.band(bit.rshift(b, slot * 2), 0x03)
            local pos = CONDITION_POSITIONS[roster_id]
            if pos then
                conditions[pos] = CONDITION_STATUS[status]
                raw[pos] = status
            end
        end
    end
    return conditions, raw
end

------------------------------------------------------------------------
-- Season standings helpers
------------------------------------------------------------------------

-- Get the SRAM base address for a team's season info block (208 bytes)
-- team_id: 0-27 (same as P1_TEAM / P2_TEAM values)
local function getTeamSeasonBase(team_id)
    local ptr_addr = SRAM.TEAM_SEASON_PTR_TABLE + team_id * 2
    return read16(ptr_addr)
end

-- Read a team's current season record from SRAM
-- Returns: {wins, losses, ties, points_for, points_against, passing_yards_allowed, rushing_yards_allowed}
local function readTeamRecord(team_id)
    local base = getTeamSeasonBase(team_id)
    return {
        wins = memory.readbyte(base + SRAM.SEASON_WINS_OFFSET),
        losses = memory.readbyte(base + SRAM.SEASON_LOSSES_OFFSET),
        ties = memory.readbyte(base + SRAM.SEASON_TIES_OFFSET),
        points_for = read16(base + SRAM.SEASON_PTS_FOR_OFFSET),
        points_against = read16(base + SRAM.SEASON_PTS_AGAINST_OFFSET),
        passing_yards_allowed = read16(base + SRAM.SEASON_PASS_YDS_ALLOWED_OFFSET),
        rushing_yards_allowed = read16(base + SRAM.SEASON_RUSH_YDS_ALLOWED_OFFSET),
    }
end

------------------------------------------------------------------------
-- Exports
------------------------------------------------------------------------
return {
    ADDR = ADDR,
    SRAM = SRAM,
    QB_STAT = QB_STAT,
    SKILL_STAT = SKILL_STAT,
    DEF_STAT = DEF_STAT,
    K_STAT = K_STAT,
    P_STAT = P_STAT,
    TEAM_NAMES = TEAM_NAMES,
    INJURY_STATUS = INJURY_STATUS,
    CONDITION_STATUS = CONDITION_STATUS,
    INJURY_POSITIONS = INJURY_POSITIONS,
    CONDITION_POSITIONS = CONDITION_POSITIONS,
    read16 = read16,
    read16_signed = read16_signed,
    readBytes = readBytes,
    readInjuries = readInjuries,
    readConditions = readConditions,
    getTeamSeasonBase = getTeamSeasonBase,
    readTeamRecord = readTeamRecord,
}

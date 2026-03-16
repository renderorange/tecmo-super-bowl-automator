-- Memory addresses for Tecmo Super Bowl
-- Sources:
-- - https://gist.github.com/IIpepeII/fb09015e45a265bfe557cb608a9d8683
-- - https://github.com/bruddog/Tecmo_Super_Bowl_NES_Disassembly

local ADDR = {
    -- Zero-page variables (from bruddog disassembly)
    -- Task system: $00-$2A
    TASK_BUSY_FLAG = 0x2A,      -- 0x80 = task switch in progress

    -- Game status
    GAME_STATUS = 0x2D,         -- Game mode (0x00=normal, 0x02=season, 0x40=attract)

    -- PPU/Bank/Frame
    SOFT_8000_BANK = 0x2E,
    FRAME_COUNTER = 0x30,       -- Increments every frame
    SOFT_PPU_CTRL = 0x31,

    -- Joypad state (stored by NMI handler)
    -- Button bit layout (MSB-first, built via ROL):
    --   bit 7=A, 6=B, 5=Select, 4=Start, 3=Up, 2=Down, 1=Left, 0=Right
    -- NOTE: This is the TSB internal format, reversed from the nesl
    --   joypad.write() hardware format (A=0x01, start=0x08, etc.)
    JOY_RAW_1 = 0x35,          -- P1 buttons held this frame
    JOY_RAW_2 = 0x36,          -- P2 buttons held
    JOY_RAW_BOTH = 0x37,       -- P1|P2 buttons held
    JOY_PRESS_1 = 0x38,        -- P1 newly pressed (edge-triggered)
    JOY_PRESS_2 = 0x39,        -- P2 newly pressed
    JOY_PRESS_BOTH = 0x3A,     -- P1|P2 newly pressed

    -- Random numbers
    RANDOM_1 = 0x3B,
    RANDOM_2 = 0x3C,
    RANDOM_3 = 0x3D,

    -- Team IDs
    P1_TEAM = 0x6C,
    P2_TEAM = 0x6D,
    TEAM_ON_OFFENSE = 0x6F,     -- 0=P1, 1=P2

    -- Gameplay status
    POSSESSION_STATUS = 0x70,
    PLAY_STATUS = 0x71,
    BALL_STATUS = 0x72,

    -- Team control type
    TEAM_CONTROL_TYPES = 0x75,  -- nibble1=P1, nibble2=P2 (0=MAN, 1=COA, 2=COM, 3=SKP)

    -- Quarter/Down
    QUARTER = 0x76,             -- Current quarter
    DOWN = 0x77,

    -- Clock
    CLOCK_RUN_TYPE = 0x69,
    CLOCK_SECONDS = 0x6A,
    CLOCK_MINUTES = 0x6B,

    -- Menu state (shared zero-page space)
    MENU_Y = 0xE1,             -- Menu cursor Y position
    MENU_X = 0xE2,             -- Menu cursor X position

    -- Score (0x3CD): 5 bytes per team (Q1, Q2, Q3, Q4, Total)
    SCORE_LOC = 0x3CD,

    -- Team abbreviations (4 bytes each)
    HOME_TEAM_ABBRV = 0xC0F,
    AWAY_TEAM_ABBRV = 0xC2F,

    -- Team stats - Home (at end of game)
    HOME_RUNS_ATMPT = 0xC14,   -- 3 bytes
    HOME_RUNS_YARDS = 0xC18,   -- 3 bytes
    HOME_PASS = 0xC1E,         -- 4 bytes
    HOME_FIRSTS = 0xC26,       -- 2 bytes

    -- Team stats - Away
    AWAY_RUNS_ATMPT = 0xC34,
    AWAY_RUNS_YARDS = 0xC38,
    AWAY_PASS = 0xC3E,
    AWAY_FIRSTS = 0xC46,

    -- RB stats (starts at 0xCF4)
    -- 17 bytes name, 2 bytes att, 4 bytes yards per RB
    HOME_RB_START = 0xCF4,
    AWAY_RB_START = 0xD14,

    -- QB stats
    -- 13 bytes name, 3 bytes %, 4 bytes yards, 3 bytes INT
    HOME_QB_START = 0xD54,
    AWAY_QB_START = 0xD74,

    -- WR stats
    -- 17 bytes name, 2 bytes catches, 4 bytes yards
    HOME_WR_START = 0xDB4,
    AWAY_WR_START = 0xDD4,

    -- Season state
    SEASON_WEEK = 0x0520,       -- Current week (1-17)
}

-- Game phases (derived from game state)
local PHASE = {
    TITLE = 0,
    MENU = 1,
    SEASON_SETUP = 2,
    PLAYING = 3,
    GAME_OVER = 4,
    STATS_SCREEN = 5,
    WEEK_SELECT = 6,
}

-- Team abbreviations to IDs
local TEAM_IDS = {
    BUF = 1, MIA = 2, NE = 3, NYJ = 4,
    IND = 5, JAC = 6, TEN = 7, CLE = 8,
    PIT = 9, CIN = 10, HOU = 11, JAX = 12,
    DAL = 13, PHI = 14, WAS = 15, NYG = 16,
    CHI = 17, DET = 18, GB = 19, MIN = 20,
    TB = 21, ATL = 22, CAR = 23, NO = 24,
    ARI = 25, SF = 26, SEA = 27, STL = 28,
}

-- Reverse lookup
local ID_TO_TEAM = {}
for abbr, id in pairs(TEAM_IDS) do
    ID_TO_TEAM[id] = abbr
end

local function readBytes(addr, len)
    local bytes = {}
    for i = 0, len - 1 do
        table.insert(bytes, memory.readbyte(addr + i))
    end
    return bytes
end

local function readString(addr, len)
    local chars = {}
    for i = 0, len - 1 do
        local b = memory.readbyte(addr + i)
        if b == 0 then break end
        table.insert(chars, string.char(b))
    end
    return table.concat(chars)
end

local function readBCD(addr)
    -- BCD (Binary Coded Decimal) to decimal
    local b = memory.readbyte(addr)
    return math.floor(b / 16) * 10 + (b % 16)
end

return {
    ADDR = ADDR,
    PHASE = PHASE,
    TEAM_IDS = TEAM_IDS,
    ID_TO_TEAM = ID_TO_TEAM,
    readBytes = readBytes,
    readString = readString,
    readBCD = readBCD,
}

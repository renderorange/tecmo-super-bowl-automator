-- Memory addresses for Tecmo Super Bowl
-- Sources:
-- - https://gist.github.com/IIpepeII/fb09015e45a265bfe557cb608a9d8683
-- - https://github.com/bruddog/Tecmo_Super_Bowl_NES_Disassembly

local ADDR = {
    -- Game state
    SCORE_LOC = 0x3CD,
    HOME_TEAM_ABBRV = 0xC0F,
    AWAY_TEAM_ABBRV = 0xC2F,
    
    -- Team stats (home)
    HOME_RUNS_ATMPT = 0xC14,
    HOME_RUNS_YARDS = 0xC18,
    HOME_PASS = 0xC1E,
    HOME_FIRSTS = 0xC26,
    
    -- Team stats (away)
    AWAY_RUNS_ATMPT = 0xC34,
    AWAY_RUNS_YARDS = 0xC38,
    AWAY_PASS = 0xC3E,
    AWAY_FIRSTS = 0xC46,
    
    -- Player stats
    HOME_RUNS = 0xCF4,
    AWAY_RUNS = 0xD14,
    HOME_PASSES = 0xD54,
    AWAY_PASSES = 0xD74,
    HOME_RECEIVES = 0xDB4,
    AWAY_RECEIVES = 0xDD4,
    
    -- Season state (needs research)
    SEASON_WEEK = 0x0000,
    SEASON_PHASE = 0x0000,
    
    -- Team/Player data in ROM (needs research)
    TEAM_DATA_PTR = 0x0000,
    PLAYER_DATA_PTR = 0x0000,
}

-- Game phases
local PHASE = {
    MENU = 0,
    SEASON_SELECT = 1,
    WEEK_SELECT = 2,
    PLAYING = 3,
    GAME_OVER = 4,
    STATS_SCREEN = 5
}

return ADDR

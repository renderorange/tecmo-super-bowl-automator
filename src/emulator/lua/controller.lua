-- Tecmo Super Bowl Controller
-- Handles: navigation, stats extraction, game simulation

local outputFile = os.getenv("LUA_OUTPUT_FILE") or "/tmp/lua-controller-output.txt"
local mem = require("memory")

local ADDR = mem.ADDR
local PHASE = mem.PHASE

-- Output file handle
local outFile = io.open(outputFile, "w")

local function log(msg)
    outFile:write(msg .. "\n")
    outFile:flush()
end

-- Input helper functions
-- nesl button names are case-sensitive:
--   Uppercase: A, B
--   Lowercase: select, start, up, down, left, right

local function pressButton(buttons, hold_frames, wait_frames)
    hold_frames = hold_frames or 2
    wait_frames = wait_frames or 15
    for i = 1, hold_frames do
        joypad.write(1, buttons)
        emu.frameadvance()
    end
    -- Release buttons
    for i = 1, wait_frames do
        joypad.write(1, 0)
        emu.frameadvance()
    end
end

local function pressStart(hold, wait)
    pressButton({start=true}, hold, wait)
end

local function pressA(hold, wait)
    pressButton({A=true}, hold, wait)
end

local function pressB(hold, wait)
    pressButton({B=true}, hold, wait)
end

local function pressDown(hold, wait)
    pressButton({down=true}, hold, wait)
end

local function pressUp(hold, wait)
    pressButton({up=true}, hold, wait)
end

local function delay(frames)
    for i = 1, frames do
        joypad.write(1, 0)
        emu.frameadvance()
    end
end

-- Detect current game status
local function getGameStatus()
    return memory.readbyte(ADDR.GAME_STATUS) or 0
end

-- Read team abbreviation
local function readTeamAbbr(addr)
    local bytes = {}
    for i = 0, 3 do
        local b = memory.readbyte(addr + i)
        if b >= 0x20 and b < 0x7F then
            table.insert(bytes, string.char(b))
        end
    end
    return table.concat(bytes)
end

-- Read score (BCD format)
local function readScore(addr)
    local bytes = mem.readBytes(addr, 5)
    return {
        q1 = bytes[1],
        q2 = bytes[2],
        q3 = bytes[3],
        q4 = bytes[4],
        total = bytes[5]
    }
end

-- Read team stats
local function readTeamStats(addr)
    local stats = {}
    stats.runs_att = tonumber(mem.readString(addr, 3)) or 0
    stats.runs_yards = tonumber(mem.readString(addr + 4, 3)) or 0
    stats.pass_yards = tonumber(mem.readString(addr + 10, 4)) or 0
    stats.firsts = tonumber(mem.readString(addr + 18, 2)) or 0
    return stats
end

-- Read player stats (RB/QB/WR)
local function readPlayerStats(addr, nameLen, statLen)
    local player = {}
    player.name = mem.readString(addr, nameLen)
    player.stat1 = tonumber(mem.readString(addr + nameLen, statLen)) or 0
    player.stat2 = tonumber(mem.readString(addr + nameLen + statLen, statLen + 1)) or 0
    return player
end

-- Extract full game stats
local function extractGameStats()
    local stats = {
        homeTeam = readTeamAbbr(ADDR.HOME_TEAM_ABBRV),
        awayTeam = readTeamAbbr(ADDR.AWAY_TEAM_ABBRV),
        homeScore = readScore(ADDR.SCORE_LOC),
        awayScore = readScore(ADDR.SCORE_LOC + 5),
        homeStats = readTeamStats(ADDR.HOME_RUNS_ATMPT),
        awayStats = readTeamStats(ADDR.AWAY_RUNS_ATMPT),
    }
    
    -- Read player stats (top performer each)
    stats.homeRB = readPlayerStats(ADDR.HOME_RB_START, 17, 6)
    stats.awayRB = readPlayerStats(ADDR.AWAY_RB_START, 17, 6)
    stats.homeQB = readPlayerStats(ADDR.HOME_QB_START, 13, 8)
    stats.awayQB = readPlayerStats(ADDR.AWAY_QB_START, 13, 8)
    stats.homeWR = readPlayerStats(ADDR.HOME_WR_START, 17, 6)
    stats.awayWR = readPlayerStats(ADDR.AWAY_WR_START, 17, 6)
    
    return stats
end

-- Wait through TSB's intro/attract sequence (~90 seconds)
-- The game cycles: splash -> city skyline -> team previews -> title -> trademarks
-- START is only accepted on the "START GAME" title screen
local function waitForTitleScreen()
    log("Waiting through intro sequence (up to 2.5 minutes)...")

    -- The intro/attract loop is ~90 seconds
    -- Wait up to 9000 frames (2.5 min) for it to cycle
    local max_frames = 9000
    for i = 1, max_frames do
        emu.frameadvance()
    end

    log("Intro wait complete at frame " .. emu.framecount())
end

-- Navigate to start new season (from boot)
local function navigateToSeason()
    log("Navigating to season mode...")

    -- Wait through the long intro sequence
    waitForTitleScreen()

    -- Press START repeatedly until we get past the title screen
    -- The title screen may appear at different points in the attract loop
    log("Pressing START to pass title screen...")
    for attempt = 1, 30 do
        pressStart(2, 30)
    end
    delay(60)

    -- We should now be at the mode select menu:
    --   1991 NFL
    --   > PRESEASON
    --   SEASON GAME
    --   PRO BOWL
    --   TEAM DATA
    -- Cursor starts on PRESEASON. Move down to SEASON GAME.
    log("Selecting SEASON GAME from mode menu...")
    pressDown(2, 15)  -- Move to SEASON GAME
    delay(10)
    pressA(2, 60)     -- Select SEASON GAME
    delay(60)

    -- Continue through season setup screens with A/START
    log("Navigating season setup...")
    for i = 1, 10 do
        pressA(2, 30)
        pressStart(2, 30)
    end

    log("Season navigation complete")
end

-- Navigate to play week
local function navigateToWeek(weekNum)
    log("Navigating to week " .. weekNum)
    
    -- Should be at week select
    -- Navigate to correct week
    local currentWeek = memory.readbyte(ADDR.SEASON_WEEK) or 1
    
    while currentWeek < weekNum do
        pressDown(20)
        currentWeek = currentWeek + 1
        delay(10)
    end
    
    pressA(60)
    delay(30)
    
    -- Select game
    pressA(60)
    delay(30)
end

-- Wait for game to end
local function waitForGameEnd()
    log("Waiting for game to end...")
    
    local lastTime = 0
    local stableCount = 0
    
    while true do
        local quarter = memory.readbyte(ADDR.QUARTER) or 0

        -- Check for stable game time (game likely over)
        local gameTime = memory.readbyte(ADDR.CLOCK_MINUTES) or 0
        if gameTime == lastTime and gameTime == 0 then
            stableCount = stableCount + 1
            if stableCount > 30 then
                log("Game time stable at 0")
                delay(60)
                return true
            end
        else
            stableCount = 0
        end
        lastTime = gameTime
        
        -- Safety: if game running too long, assume done
        emu.frameadvance()
    end
end

-- Fast forward through game (CPU vs CPU simulation)
local function simulateGame()
    log("Simulating game...")
    
    local frameCount = 0
    local maxFrames = 60 * 60 * 15  -- 15 minutes max
    
    while frameCount < maxFrames do
        -- Advance one frame
        emu.frameadvance()
        
        frameCount = frameCount + 1
        
        -- Progress log every 500 frames
        if frameCount % 500 == 0 then
            log("Simulating... frame " .. frameCount)
        end
    end
    
    log("Max frames reached, forcing game end")
    return false
end

-- Navigate through post-game screens
local function skipPostGame()
    log("Skipping post-game screens...")
    
    -- Press A to advance through stats
    for i = 1, 5 do
        pressA(30)
        delay(20)
    end
end

-- Main: run a single game
local function runGame()
    log("=== Starting game ===")
    
    -- Wait for game to load
    delay(60)
    
    -- Navigate season if needed
    local gs = getGameStatus()
    if gs == 0x40 or gs == 0x00 then
        navigateToSeason()
    end

    -- Wait for game to start playing (give it time)
    delay(120)
    
    log("Game is now playing")
    
    -- Simulate the game
    local completed = simulateGame()
    
    if completed then
        -- Extract stats
        local stats = extractGameStats()
        
        -- Output stats
        log("=== GAME STATS ===")
        log("HOME: " .. stats.homeTeam .. " " .. stats.homeScore.total)
        log("AWAY: " .. stats.awayTeam .. " " .. stats.awayScore.total)
        
        -- Write JSON to output
        local jsonStats = string.format(
            '{"home":"%s","away":"%s","homeScore":%d,"awayScore":%d}',
            stats.homeTeam, stats.awayTeam,
            stats.homeScore.total, stats.awayScore.total
        )
        log("STATS_JSON:" .. jsonStats)
    end
    
    -- Skip post-game
    skipPostGame()
    
    log("=== Game complete ===")
end

-- Export functions
return {
    runGame = runGame,
    extractGameStats = extractGameStats,
    getGameStatus = getGameStatus,
    waitForTitleScreen = waitForTitleScreen,
    navigateToSeason = navigateToSeason,
    navigateToWeek = navigateToWeek,
    pressA = pressA,
    pressStart = pressStart,
    pressDown = pressDown,
    pressUp = pressUp,
    pressB = pressB,
    delay = delay,
}

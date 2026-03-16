-- Tecmo Super Bowl Season Simulator - Game Controller
-- Runs COM vs COM season games via nesl, outputs JSON stats per game.
--
-- Usage: /tmp/nesl/build/nesl src/emulator/lua/controller.lua "path/to/rom.nes"
-- Output: writes JSON lines to the file specified by TSB_OUTPUT env var
--         (default: /tmp/tsb-results.jsonl), one JSON object per game.

-- Load memory.lua from same directory as this script.
-- Derive the directory from arg[0] (the script path passed to nesl).
local scriptPath = arg and arg[0] or ""
local scriptDir = scriptPath:match("(.*/)") or "./"
local mem = dofile(scriptDir .. "memory.lua")
local ADDR = mem.ADDR
local SRAM = mem.SRAM

------------------------------------------------------------------------
-- Configuration
------------------------------------------------------------------------
local OUTPUT_FILE = os.getenv("TSB_OUTPUT") or "/tmp/tsb-results.jsonl"
local MAX_GAMES = tonumber(os.getenv("TSB_MAX_GAMES")) or 238  -- 14 games/wk * 17 weeks
local MAX_FRAMES_PER_GAME = 300000  -- ~83 min at 60fps safety limit
local REGULAR_SEASON_WEEKS = 17     -- TSB 17-week regular season (weeks 0-16)

------------------------------------------------------------------------
-- Input helpers
------------------------------------------------------------------------
local function press(buttons, hold, wait)
    hold = hold or 2
    wait = wait or 20
    for i = 1, hold do joypad.write(1, buttons); emu.frameadvance() end
    for i = 1, wait do joypad.write(1, 0); emu.frameadvance() end
end

local function idle(n)
    for i = 1, n do joypad.write(1, 0); emu.frameadvance() end
end

------------------------------------------------------------------------
-- JSON encoding (minimal, Lua 5.1 compatible, no external deps)
------------------------------------------------------------------------
local function jsonEncode(val)
    if type(val) == "number" then
        return tostring(val)
    elseif type(val) == "string" then
        return '"' .. val:gsub('\\', '\\\\'):gsub('"', '\\"') .. '"'
    elseif type(val) == "boolean" then
        return val and "true" or "false"
    elseif type(val) == "nil" then
        return "null"
    elseif type(val) == "table" then
        -- Array if sequential integer keys starting at 1
        if #val > 0 then
            local parts = {}
            for i = 1, #val do
                parts[i] = jsonEncode(val[i])
            end
            return "[" .. table.concat(parts, ",") .. "]"
        else
            local parts = {}
            for k, v in pairs(val) do
                table.insert(parts, jsonEncode(tostring(k)) .. ":" .. jsonEncode(v))
            end
            return "{" .. table.concat(parts, ",") .. "}"
        end
    end
    return "null"
end

------------------------------------------------------------------------
-- Stats extraction from SRAM
------------------------------------------------------------------------

local function readQBStats(base)
    return {
        pass_att = memory.readbyte(base + mem.QB_STAT.PASS_ATT),
        pass_comp = memory.readbyte(base + mem.QB_STAT.PASS_COMP),
        pass_td = memory.readbyte(base + mem.QB_STAT.PASS_TD),
        pass_int = memory.readbyte(base + mem.QB_STAT.PASS_INT),
        pass_yds = mem.read16(base + mem.QB_STAT.PASS_YDS_LO),
        rush_att = memory.readbyte(base + mem.QB_STAT.RUSH_ATT),
        rush_yds = mem.read16(base + mem.QB_STAT.RUSH_YDS_LO),
        rush_td = memory.readbyte(base + mem.QB_STAT.RUSH_TD),
    }
end

local function readSkillStats(base)
    return {
        rec = memory.readbyte(base + mem.SKILL_STAT.REC),
        rec_yds = mem.read16(base + mem.SKILL_STAT.REC_YDS_LO),
        rec_td = memory.readbyte(base + mem.SKILL_STAT.REC_TD),
        rush_att = memory.readbyte(base + mem.SKILL_STAT.RUSH_ATT),
        rush_yds = mem.read16(base + mem.SKILL_STAT.RUSH_YDS_LO),
        rush_td = memory.readbyte(base + mem.SKILL_STAT.RUSH_TD),
        kr_att = memory.readbyte(base + mem.SKILL_STAT.KR_ATT),
        kr_yds = mem.read16(base + mem.SKILL_STAT.KR_YDS_LO),
        kr_td = memory.readbyte(base + mem.SKILL_STAT.KR_TD),
        pr_att = memory.readbyte(base + mem.SKILL_STAT.PR_ATT),
        pr_yds = mem.read16(base + mem.SKILL_STAT.PR_YDS_LO),
        pr_td = memory.readbyte(base + mem.SKILL_STAT.PR_TD),
    }
end

local function readDefStats(base)
    return {
        sacks = memory.readbyte(base + mem.DEF_STAT.SACKS),
        ints = memory.readbyte(base + mem.DEF_STAT.INTS),
        int_yds = mem.read16(base + mem.DEF_STAT.INT_YDS_LO),
        int_td = memory.readbyte(base + mem.DEF_STAT.INT_TD),
    }
end

local function readKStats(base)
    return {
        xp_att = memory.readbyte(base + mem.K_STAT.XP_ATT),
        xp_made = memory.readbyte(base + mem.K_STAT.XP_MADE),
        fg_att = memory.readbyte(base + mem.K_STAT.FG_ATT),
        fg_made = memory.readbyte(base + mem.K_STAT.FG_MADE),
    }
end

local function readPStats(base)
    return {
        punts = memory.readbyte(base + mem.P_STAT.PUNTS),
        punt_yds = mem.read16(base + mem.P_STAT.PUNT_YDS_LO),
    }
end

local function readTeamPlayerStats(teamBase)
    return {
        qb1 = readQBStats(teamBase + SRAM.QB1_OFFSET),
        qb2 = readQBStats(teamBase + SRAM.QB2_OFFSET),
        rb1 = readSkillStats(teamBase + SRAM.RB1_OFFSET),
        rb2 = readSkillStats(teamBase + SRAM.RB2_OFFSET),
        rb3 = readSkillStats(teamBase + SRAM.RB3_OFFSET),
        rb4 = readSkillStats(teamBase + SRAM.RB4_OFFSET),
        wr1 = readSkillStats(teamBase + SRAM.WR1_OFFSET),
        wr2 = readSkillStats(teamBase + SRAM.WR2_OFFSET),
        wr3 = readSkillStats(teamBase + SRAM.WR3_OFFSET),
        wr4 = readSkillStats(teamBase + SRAM.WR4_OFFSET),
        te1 = readSkillStats(teamBase + SRAM.TE1_OFFSET),
        te2 = readSkillStats(teamBase + SRAM.TE2_OFFSET),
        re  = readDefStats(teamBase + SRAM.RE_OFFSET),
        nt  = readDefStats(teamBase + SRAM.NT_OFFSET),
        le  = readDefStats(teamBase + SRAM.LE_OFFSET),
        rolb = readDefStats(teamBase + SRAM.ROLB_OFFSET),
        rilb = readDefStats(teamBase + SRAM.RILB_OFFSET),
        lilb = readDefStats(teamBase + SRAM.LILB_OFFSET),
        lolb = readDefStats(teamBase + SRAM.LOLB_OFFSET),
        rcb = readDefStats(teamBase + SRAM.RCB_OFFSET),
        lcb = readDefStats(teamBase + SRAM.LCB_OFFSET),
        fs  = readDefStats(teamBase + SRAM.FS_OFFSET),
        ss  = readDefStats(teamBase + SRAM.SS_OFFSET),
        k   = readKStats(teamBase + SRAM.K_OFFSET),
        p   = readPStats(teamBase + SRAM.P_OFFSET),
    }
end

local function readGameStats()
    local result = {}

    -- Team IDs
    result.p1_team_id = memory.readbyte(ADDR.P1_TEAM)
    result.p2_team_id = memory.readbyte(ADDR.P2_TEAM)
    result.p1_team = mem.TEAM_NAMES[result.p1_team_id] or "???"
    result.p2_team = mem.TEAM_NAMES[result.p2_team_id] or "???"

    -- Scores (total is authoritative; per-quarter may not sum to total
    -- due to OT/defensive scoring edge cases in the TSB engine)
    result.p1_score = memory.readbyte(ADDR.P1_TOTAL_SCORE)
    result.p2_score = memory.readbyte(ADDR.P2_TOTAL_SCORE)

    -- Team stats: derive from individual player stats (SRAM team stats
    -- block may not be populated in COM mode)
    -- These get computed after player stats are read (below)

    -- Individual player stats
    result.p1_players = readTeamPlayerStats(SRAM.P1_STATS)
    result.p2_players = readTeamPlayerStats(SRAM.P2_STATS)

    -- Derive team totals from player stats
    for _, side in ipairs({"p1", "p2"}) do
        local p = result[side .. "_players"]
        local rush_att, rush_yds, rush_td = 0, 0, 0
        local pass_att, pass_comp, pass_yds, pass_td, pass_int = 0, 0, 0, 0, 0
        local rec, rec_yds, rec_td = 0, 0, 0
        local sacks, ints, int_yds, int_td = 0, 0, 0, 0

        -- QBs
        for _, qb in ipairs({p.qb1, p.qb2}) do
            pass_att = pass_att + qb.pass_att
            pass_comp = pass_comp + qb.pass_comp
            pass_yds = pass_yds + qb.pass_yds
            pass_td = pass_td + qb.pass_td
            pass_int = pass_int + qb.pass_int
            rush_att = rush_att + qb.rush_att
            rush_yds = rush_yds + qb.rush_yds
            rush_td = rush_td + qb.rush_td
        end

        -- Skill positions (RB, WR, TE)
        for _, key in ipairs({"rb1","rb2","rb3","rb4","wr1","wr2","wr3","wr4","te1","te2"}) do
            local sk = p[key]
            rush_att = rush_att + sk.rush_att
            rush_yds = rush_yds + sk.rush_yds
            rush_td = rush_td + sk.rush_td
            rec = rec + sk.rec
            rec_yds = rec_yds + sk.rec_yds
            rec_td = rec_td + sk.rec_td
        end

        -- Defensive positions
        for _, key in ipairs({"re","nt","le","rolb","rilb","lilb","lolb","rcb","lcb","fs","ss"}) do
            local d = p[key]
            sacks = sacks + d.sacks
            ints = ints + d.ints
            int_yds = int_yds + d.int_yds
            int_td = int_td + d.int_td
        end

        result[side .. "_team_stats"] = {
            rush_att = rush_att,
            rush_yds = rush_yds,
            rush_td = rush_td,
            pass_att = pass_att,
            pass_comp = pass_comp,
            pass_yds = pass_yds,
            pass_td = pass_td,
            pass_int = pass_int,
            rec = rec,
            rec_yds = rec_yds,
            rec_td = rec_td,
            sacks = sacks,
            ints = ints,
            int_yds = int_yds,
            int_td = int_td,
            k = p.k,
            punting = p.p,
        }
    end

    -- Compute untracked points (fumble recovery TDs, safeties, blocked kick TDs)
    -- TSB doesn't store these as individual player stats, but we can infer
    -- them from the gap between the actual score and the sum of tracked scoring.
    for _, side in ipairs({"p1", "p2"}) do
        local ts = result[side .. "_team_stats"]
        local score = result[side .. "_score"]
        -- Total TDs from player stats
        local tracked_td = ts.rush_td + ts.rec_td + ts.int_td
        -- Add KR/PR TDs from skill players
        local p = result[side .. "_players"]
        local kr_td, pr_td = 0, 0
        for _, key in ipairs({"rb1","rb2","rb3","rb4","wr1","wr2","wr3","wr4","te1","te2"}) do
            kr_td = kr_td + p[key].kr_td
            pr_td = pr_td + p[key].pr_td
        end
        local total_tracked_td = tracked_td + kr_td + pr_td
        local tracked_pts = total_tracked_td * 6 + ts.k.xp_made + ts.k.fg_made * 3
        ts.kr_td = kr_td
        ts.pr_td = pr_td
        ts.total_td = total_tracked_td
        ts.tracked_pts = tracked_pts
        ts.untracked_pts = score - tracked_pts
    end

    -- Season context
    result.week = memory.readbyte(SRAM.CURRENT_WEEK)
    result.game_in_week = memory.readbyte(SRAM.CURRENT_GAME)

    return result
end

------------------------------------------------------------------------
-- Navigation: boot -> season mode -> GAME START cursor
------------------------------------------------------------------------
local function navigateToSeasonGameStart()
    -- Skip intro with B
    idle(120)
    press({B=true}, 2, 60)
    idle(120)

    -- Title screen -> START
    press({start=true}, 2, 60)
    for i = 1, 5 do press({start=true}, 2, 30) end
    idle(30)

    -- Mode select -> SEASON GAME (1 down from PRESEASON)
    press({down=true}, 2, 15)
    press({A=true}, 2, 60)
    idle(30)

    -- Set all 28 teams to COM via SRAM
    memory.writebyte(0xA001, 0x80)  -- MMC3: enable SRAM writes
    for i = 0, 27 do
        memory.writebyte(SRAM.TEAM_TYPE_SEASON + i, 0x02)
    end

    -- Season menu -> GAME START (2 down from TEAM CONTROL)
    press({down=true}, 2, 15)   -- SCHEDULE
    press({down=true}, 2, 15)   -- GAME START
end

------------------------------------------------------------------------
-- Run one COM vs COM game
-- Returns: stats table, or nil on timeout
------------------------------------------------------------------------
local function runOneGame()
    -- Read pre-game standings for both teams BEFORE starting the game.
    -- We peek at the upcoming matchup from SRAM: the game loads team IDs
    -- into P1_TEAM/P2_TEAM when GAME START is selected, but they may not
    -- be set yet. Instead, read from the weekly matchup schedule.
    -- After the game starts, we'll read P1_TEAM/P2_TEAM and look up records.

    -- Press A on GAME START to begin the game
    press({A=true}, 2, 10)

    -- Unified game loop: run frames until we're back at the season menu.
    -- During gameplay, don't press anything (COM handles it).
    -- During post-game screens (gs >= $C0), press A to advance.
    -- Detect season menu by MENU_Y == $02 (GAME START cursor position).
    --
    -- The game lifecycle: pre-game screens -> gameplay (Q1-Q4, possibly OT) ->
    -- post-game screens (stats, highlights) -> season menu.
    -- We read stats after gameplay ends but before advancing past the menu.

    local gameplay_started = false
    local stats_read = false
    local stats = nil
    local pregame_p1_record = nil
    local pregame_p2_record = nil

    for frame = 1, MAX_FRAMES_PER_GAME do
        local gs = memory.readbyte(ADDR.GAME_STATUS)
        local q = memory.readbyte(ADDR.QUARTER)
        local mins = memory.readbyte(ADDR.CLOCK_MINUTES)
        local my = memory.readbyte(ADDR.MENU_Y)

        -- Detect gameplay started (Q1 with clock running)
        if not gameplay_started and q == 0 and mins > 0 and mins <= 5 then
            gameplay_started = true
            -- Capture pre-game records now that team IDs are set
            local p1_id = memory.readbyte(ADDR.P1_TEAM)
            local p2_id = memory.readbyte(ADDR.P2_TEAM)
            pregame_p1_record = mem.readTeamRecord(p1_id)
            pregame_p2_record = mem.readTeamRecord(p2_id)
        end

        -- Read stats once after gameplay, when we first see a post-game screen
        -- (gs >= $C0 after gameplay started, with clock at 0 in Q4+)
        if gameplay_started and not stats_read and q >= 3 and mins == 0 and gs >= 0xC0 then
            stats = readGameStats()
            stats.p1_pregame_record = pregame_p1_record
            stats.p2_pregame_record = pregame_p2_record
            stats_read = true
        end

        -- Check for return to season menu
        if gameplay_started and my == 0x02 and stats_read then
            idle(10)
            return stats
        end

        -- During post-game screens, press A to advance.
        -- Post-game is indicated by gs >= $C0 after gameplay.
        -- Also press A during pre-game screens (coin toss etc.) which show gs >= $40.
        -- Do NOT press A during active gameplay (gs=$92 etc. with clock running).
        if gameplay_started and stats_read and frame % 30 == 0 then
            -- Safe to press A: we've read stats and are in post-game
            joypad.write(1, {A=true})
        elseif not gameplay_started and frame % 60 == 0 then
            -- Pre-game: press A for coin toss etc.
            -- (COM mode shouldn't need this, but just in case)
            joypad.write(1, {A=true})
        else
            joypad.write(1, 0)
        end

        emu.frameadvance()

        -- Safety log for very long games (5+ min wall-clock)
        if frame % 120000 == 0 then
            print(string.format("  [long game] f=%d q=%d mins=%d gs=$%02X",
                frame, q, mins, gs))
        end
    end

    -- Timed out
    if stats then return stats end
    return nil
end

------------------------------------------------------------------------
-- Main entry point
------------------------------------------------------------------------
local function main()
    local outFile = io.open(OUTPUT_FILE, "w")
    if not outFile then
        print("ERROR: cannot open output file: " .. OUTPUT_FILE)
        emu.exit()
        return
    end

    print("TSB Season Simulator")
    print("Output: " .. OUTPUT_FILE)
    print("Max games: " .. MAX_GAMES)

    navigateToSeasonGameStart()
    print("Ready: all teams COM, cursor on GAME START")

    local game_count = 0
    local last_week = -1
    while game_count < MAX_GAMES do
        -- Check if regular season is over before starting next game
        local current_week = memory.readbyte(SRAM.CURRENT_WEEK)
        if current_week >= REGULAR_SEASON_WEEKS then
            print(string.format("Regular season complete (week counter=%d)", current_week))
            break
        end

        -- Log week transitions
        if current_week ~= last_week then
            if last_week >= 0 then
                print(string.format("--- Week %d complete ---", last_week + 1))
            end
            print(string.format("Starting week %d", current_week + 1))
            last_week = current_week
        end

        game_count = game_count + 1

        local stats = runOneGame()
        if not stats then
            print(string.format("Game %d: TIMEOUT", game_count))
            break
        end

        outFile:write(jsonEncode(stats) .. "\n")
        outFile:flush()

        print(string.format("Game %d: %s %d - %s %d (wk %d, g %d)",
            game_count, stats.p1_team, stats.p1_score,
            stats.p2_team, stats.p2_score, stats.week + 1, stats.game_in_week + 1))
    end

    outFile:close()
    print(string.format("Done: %d games -> %s", game_count, OUTPUT_FILE))
    emu.exit()
end

main()

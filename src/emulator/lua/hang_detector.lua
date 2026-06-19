-- Tecmo Super Bowl Season Simulator - Hang Detector
--
-- Detects three in-game hang conditions in the TSB engine:
--   1. Postgame region frozen (q>=3, mins==0 for too long)
--   2. Engine state frozen with no progress (no field changes for too long)
--   3. Stats-read fallback trigger (postgame region stable long enough)
--
-- Module load contract: this file declares locals and returns a table.
-- It does NOT read `memory`, `joypad`, `emu`, `savestate`, or any other
-- global at require time. Tests can `require("hang_detector")` without
-- any host environment installed. If a future change requires a top-level
-- global call, that change must update this header.

local HangDetector = {}
HangDetector.__index = HangDetector

function HangDetector.new(opts)
    opts = opts or {}
    local self = setmetatable({}, HangDetector)
    self._postgame_frames_threshold = opts.postgame_frames or 1800
    self._noprogress_frames_threshold = opts.noprogress_frames or 1800
    self._stats_delay_frames = opts.stats_delay_frames or 60

    -- Internal state
    self._postgame_start_frame = nil
    self._postgame_frame_count = 0
    self._last_progress_frame = nil
    self._last_gs = -1
    self._last_q = -1
    self._last_mins = -1
    self._last_secs = -1
    self._last_my = -1
    self._saw_overtime = false
    self._initialized = false

    return self
end

local function _validate_state(state)
    if type(state) ~= "table" then
        error("HangDetector:tick requires a state table", 2)
    end
    local required = { "gs", "q", "mins", "secs", "my", "frame" }
    for _, key in ipairs(required) do
        if type(state[key]) ~= "number" then
            error("HangDetector:tick missing or non-numeric state." .. key, 2)
        end
    end
end

local function _in_postgame(state)
    return state.q >= 3 and state.mins == 0
end

function HangDetector:tick(state)
    _validate_state(state)
    local frame = state.frame

    if state.q >= 4 then
        self._saw_overtime = true
    end

    local postgame_frame_count = 0
    if _in_postgame(state) then
        if self._postgame_start_frame == nil then
            self._postgame_start_frame = frame
            self._postgame_frame_count = 1
            postgame_frame_count = 1
        else
            self._postgame_frame_count = self._postgame_frame_count + 1
            postgame_frame_count = self._postgame_frame_count
        end
    else
        self._postgame_start_frame = nil
        self._postgame_frame_count = 0
    end

    local action = "keep_going"
    if _in_postgame(state) and self._postgame_start_frame and (frame - self._postgame_start_frame) > self._postgame_frames_threshold then
        action = "stuck_postgame"
    end

    if not self._initialized then
        self._last_progress_frame = frame
        self._last_gs, self._last_q = state.gs, state.q
        self._last_mins, self._last_secs, self._last_my = state.mins, state.secs, state.my
        self._initialized = true
    elseif
        state.gs ~= self._last_gs
        or state.q ~= self._last_q
        or state.mins ~= self._last_mins
        or state.secs ~= self._last_secs
        or state.my ~= self._last_my
    then
        self._last_progress_frame = frame
        self._last_gs, self._last_q = state.gs, state.q
        self._last_mins, self._last_secs, self._last_my = state.mins, state.secs, state.my
    elseif action == "keep_going" and (frame - self._last_progress_frame) > self._noprogress_frames_threshold then
        action = "stuck_noprogress"
    end

    local stats_readable = false
    if _in_postgame(state) then
        if state.gs >= 0xC0 then
            stats_readable = true
        elseif frame > 1 and postgame_frame_count > self._stats_delay_frames then
            stats_readable = true
        end
    end

    return {
        action = action,
        stats_readable = stats_readable,
        saw_overtime = self._saw_overtime,
        postgame_frames = postgame_frame_count,
    }
end

function HangDetector:reset_progress()
    self._initialized = false
    self._last_progress_frame = nil
    self._last_gs = -1
    self._last_q = -1
    self._last_mins = -1
    self._last_secs = -1
    self._last_my = -1
end

return HangDetector

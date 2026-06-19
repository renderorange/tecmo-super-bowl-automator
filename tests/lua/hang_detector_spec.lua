-- Tests for the hang detector module.
-- See tmp/docs/superpowers/specs/2026-06-19-hang-detector-module-design.md

describe("HangDetector", function()
    local HangDetector = require("hang_detector")

    describe("default behavior", function()
        it("returns keep_going with expected verdict fields on first frame in postgame region", function()
            local det = HangDetector.new()
            local verdict = det:tick({
                gs = 0x9A,
                q = 3,
                mins = 0,
                secs = 0,
                my = 0x00,
                frame = 1,
            })
            assert.are.equal("keep_going", verdict.action)
            assert.is_false(verdict.stats_readable)
            assert.is_false(verdict.saw_overtime)
            assert.are.equal(1, verdict.postgame_frames)
        end)
    end)

    describe("stats_readable", function()
        it("is false during the first 60 frames in the postgame region", function()
            local det = HangDetector.new()
            for frame = 1, 60 do
                local v = det:tick({ gs = 0x9A, q = 3, mins = 0, secs = 0, my = 0x00, frame = frame })
                assert.is_false(v.stats_readable)
                assert.are.equal("keep_going", v.action)
            end
        end)

        it("becomes true on the 61st consecutive frame in the postgame region", function()
            local det = HangDetector.new()
            for frame = 1, 60 do
                det:tick({ gs = 0x9A, q = 3, mins = 0, secs = 0, my = 0x00, frame = frame })
            end
            local v = det:tick({ gs = 0x9A, q = 3, mins = 0, secs = 0, my = 0x00, frame = 61 })
            assert.is_true(v.stats_readable)
            assert.are.equal("keep_going", v.action)
        end)

        it("resets the delay counter when the postgame region is interrupted", function()
            local det = HangDetector.new()
            -- 30 frames in region
            for frame = 1, 30 do
                det:tick({ gs = 0x9A, q = 3, mins = 0, secs = 0, my = 0x00, frame = frame })
            end
            -- 1 frame out of region
            local v = det:tick({ gs = 0x40, q = 2, mins = 5, secs = 0, my = 0x00, frame = 31 })
            assert.are.equal(0, v.postgame_frames)
            assert.is_false(v.stats_readable)
            -- 60 more frames in region. Since `postgame_frames` is a tick
            -- count (not a wallclock frame delta), we must tick every frame
            -- for the threshold to elapse.
            for frame = 32, 91 do
                det:tick({ gs = 0x9A, q = 3, mins = 0, secs = 0, my = 0x00, frame = frame })
            end
            v = det:tick({ gs = 0x9A, q = 3, mins = 0, secs = 0, my = 0x00, frame = 92 })
            assert.is_true(v.stats_readable)
        end)
    end)

    describe("stuck_postgame", function()
        it("fires on the 1802nd frame of a frozen postgame region", function()
            local det = HangDetector.new()
            local last_action
            for frame = 1, 1802 do
                last_action = det:tick({ gs = 0x9A, q = 3, mins = 0, secs = 0, my = 0x00, frame = frame }).action
                if last_action == "stuck_postgame" then
                    break
                end
            end
            assert.are.equal("stuck_postgame", last_action)
        end)

        it("does not fire when q < 3 even with all fields frozen", function()
            local det = HangDetector.new()
            for frame = 1, 2000 do
                local v = det:tick({ gs = 0x9A, q = 2, mins = 0, secs = 0, my = 0x00, frame = frame })
                assert.are_not.equal("stuck_postgame", v.action)
            end
        end)
    end)

    describe("stuck_noprogress", function()
        it("fires on the 1802nd frame of a full state freeze", function()
            local det = HangDetector.new()
            local last_action
            for frame = 1, 1802 do
                last_action = det:tick({ gs = 0x9A, q = 0, mins = 5, secs = 0, my = 0x00, frame = frame }).action
                if last_action == "stuck_noprogress" or last_action == "stuck_postgame" then
                    break
                end
            end
            assert.are.equal("stuck_noprogress", last_action)
        end)

        it("does not fire across a 5000-frame run with each field varying in turn", function()
            local det = HangDetector.new()
            local fields = { "gs", "q", "mins", "secs", "my" }
            for frame = 1, 5000 do
                local state = { gs = 0x00, q = 0, mins = 5, secs = 0, my = 0x00, frame = frame }
                state[fields[((frame - 1) % 5) + 1]] = state[fields[((frame - 1) % 5) + 1]] + 1
                local v = det:tick(state)
                assert.are.equal("keep_going", v.action)
            end
        end)
    end)

    describe("priority and overtime", function()
        it("reports stuck_postgame when both postgame and no-progress thresholds are met", function()
            local det = HangDetector.new()
            local last_action
            for frame = 1, 2500 do
                last_action = det:tick({ gs = 0x9A, q = 3, mins = 0, secs = 0, my = 0x00, frame = frame }).action
                if last_action == "stuck_postgame" or last_action == "stuck_noprogress" then
                    break
                end
            end
            assert.are.equal("stuck_postgame", last_action)
        end)

        it("marks saw_overtime sticky once q >= 4 has been seen", function()
            local det = HangDetector.new()
            local v = det:tick({ gs = 0x9A, q = 3, mins = 0, secs = 0, my = 0x00, frame = 1 })
            assert.is_false(v.saw_overtime)
            v = det:tick({ gs = 0x9A, q = 4, mins = 5, secs = 0, my = 0x00, frame = 2 })
            assert.is_true(v.saw_overtime)
            -- Even after q drops back below 4, saw_overtime stays true
            v = det:tick({ gs = 0x9A, q = 3, mins = 0, secs = 0, my = 0x00, frame = 3 })
            assert.is_true(v.saw_overtime)
        end)
    end)

    describe("stats_readable gs path", function()
        it("is true on the first postgame-region frame with gs >= 0xC0, even within the delay window", function()
            local det = HangDetector.new()
            local v = det:tick({ gs = 0xC2, q = 3, mins = 0, secs = 0, my = 0x00, frame = 1 })
            assert.is_true(v.stats_readable)
            assert.are.equal("keep_going", v.action)
        end)
    end)

    describe("healthy game", function()
        it("never reports stuck_* across a Q1-Q4-postgame progression", function()
            local det = HangDetector.new()
            local frame = 1
            local function tick_gs_q_mins(gs, q, mins, secs, my, n)
                for _ = 1, n do
                    local v = det:tick({ gs = gs, q = q, mins = mins, secs = secs, my = my, frame = frame })
                    assert.are.equal("keep_going", v.action)
                    frame = frame + 1
                end
            end
            tick_gs_q_mins(0x92, 0, 5, 0, 0x00, 100)
            tick_gs_q_mins(0x92, 0, 4, 30, 0x00, 100)
            tick_gs_q_mins(0x92, 0, 3, 0, 0x00, 100)
            tick_gs_q_mins(0x92, 1, 5, 0, 0x00, 100)
            tick_gs_q_mins(0x92, 2, 5, 0, 0x00, 100)
            tick_gs_q_mins(0x92, 3, 5, 0, 0x00, 100)
            tick_gs_q_mins(0xC2, 3, 0, 0, 0x00, 100)
            -- The last frame should expose stats_readable via the gs >= 0xC0 path
            local v = det:tick({ gs = 0xC2, q = 3, mins = 0, secs = 0, my = 0x02, frame = frame })
            assert.are.equal("keep_going", v.action)
            assert.is_true(v.stats_readable)
        end)
    end)

    describe("regression: commit GH-33 hang", function()
        it("detects the postgame hang within 1802 frames starting from frame 1", function()
            local det = HangDetector.new()
            local triggered_at = nil
            for frame = 1, 2500 do
                local v = det:tick({ gs = 0x9A, q = 3, mins = 0, secs = 0, my = 0x00, frame = frame })
                if v.action == "stuck_postgame" then
                    triggered_at = frame
                    break
                end
            end
            assert.are.equal(1802, triggered_at)
        end)
    end)

    describe("reset_progress", function()
        it("clears the no-progress baseline so a single state change after a freeze avoids stuck_noprogress", function()
            local det = HangDetector.new()
            -- 2000 frames of frozen state
            for frame = 1, 2000 do
                det:tick({ gs = 0x9A, q = 0, mins = 5, secs = 0, my = 0x00, frame = frame })
            end
            det:reset_progress()
            -- One frame with a different state; the change alone is progress
            local v = det:tick({ gs = 0x9B, q = 0, mins = 5, secs = 0, my = 0x00, frame = 2001 })
            assert.are.equal("keep_going", v.action)
        end)
    end)

    describe("fresh detector on retry", function()
        it("two consecutive HangDetector.new() calls produce independent objects", function()
            local det1 = HangDetector.new()
            -- Drive det1 partway into the postgame region
            for frame = 1, 100 do
                det1:tick({ gs = 0x9A, q = 3, mins = 0, secs = 0, my = 0x00, frame = frame })
            end
            local det2 = HangDetector.new()
            -- det2's first frame is the same as det1's frame 1
            local v = det2:tick({ gs = 0x9A, q = 3, mins = 0, secs = 0, my = 0x00, frame = 1 })
            assert.are.equal(1, v.postgame_frames)
            assert.is_false(v.saw_overtime)
        end)
    end)
end)

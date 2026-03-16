/**
 * Tests for the FCEUX Emulator wrapper.
 */

import { Emulator } from "../../src/emulator/index.js";
import fs from "fs";
import path from "path";

const TEST_WORK_DIR = "/tmp/test-emu-workdir";

describe("Emulator", () => {
    let emulator;

    beforeEach(() => {
        emulator = new Emulator({
            workDir: TEST_WORK_DIR,
            romPath: "/fake/rom.nes",
            fceuxPath: "/bin/true"
        });
    });

    afterEach(() => {
        emulator.forceQuit();
        if (fs.existsSync(TEST_WORK_DIR)) {
            fs.rmSync(TEST_WORK_DIR, { recursive: true });
        }
    });

    describe("constructor", () => {
        test("creates work directory", () => {
            expect(fs.existsSync(TEST_WORK_DIR))
                .toBe(true);
        });

        test("creates state directory", () => {
            const stateDir = path.join(TEST_WORK_DIR, "states");
            expect(fs.existsSync(stateDir))
                .toBe(true);
        });

        test("uses default ROM path when not provided", () => {
            const emu = new Emulator();
            expect(emu.romPath)
                .toBe("/home/blaine/roms/nes/Tecmo Super Bowl (USA).nes");
        });

        test("accepts custom ROM path", () => {
            const customPath = "/custom/path/rom.nes";
            const emu = new Emulator({ romPath: customPath });
            expect(emu.romPath)
                .toBe(customPath);
        });

        test("accepts custom work directory", () => {
            const customDir = "/tmp/custom-work";
            const emu = new Emulator({ workDir: customDir });
            expect(emu.workDir)
                .toBe(customDir);
        });

        test("accepts custom fceux path", () => {
            const customPath = "/usr/games/custom-fceux";
            const emu = new Emulator({ fceuxPath: customPath });
            expect(emu.fceuxPath)
                .toBe(customPath);
        });

        test("defaults to fceux command", () => {
            const emu = new Emulator();
            expect(emu.fceuxPath)
                .toBe("fceux");
        });

        test("defaults worker id to 0", () => {
            expect(emulator.workerId)
                .toBe(0);
        });

        test("accepts custom worker id", () => {
            const emu = new Emulator({ workerId: 5 });
            expect(emu.workerId)
                .toBe(5);
        });
    });

    describe("state management", () => {
        test("getStatePath returns correct path for slot", () => {
            const statePath = emulator.getStatePath(0);
            expect(statePath)
                .toContain("state-0.fc0");
        });

        test("getStatePath returns correct path for different slots", () => {
            const statePath1 = emulator.getStatePath(5);
            const statePath2 = emulator.getStatePath(10);
            expect(statePath1)
                .toContain("state-5.fc0");
            expect(statePath2)
                .toContain("state-10.fc0");
        });

        test("loadState throws for non-existent state", async () => {
            await expect(emulator.loadState(999))
                .rejects.toThrow("State file not found");
        });
    });

    describe("status methods", () => {
        test("isRunning returns false initially", () => {
            expect(emulator.isRunning())
                .toBe(false);
        });

        test("started is false initially", () => {
            expect(emulator.started)
                .toBe(false);
        });

        test("getOutput returns empty buffer initially", () => {
            expect(emulator.getOutput())
                .toBe("");
        });
    });

    describe("quit methods", () => {
        test("quit does not throw when process is null", () => {
            expect(() => emulator.quit())
                .not.toThrow();
        });

        test("forceQuit does not throw when process is null", () => {
            expect(() => emulator.forceQuit())
                .not.toThrow();
        });
    });

    describe("sendCommand", () => {
        test("throws when emulator not running", async () => {
            await expect(emulator.sendCommand("test"))
                .rejects.toThrow("Emulator is not running");
        });
    });
});

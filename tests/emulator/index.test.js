/**
 * Tests for the nesl Emulator wrapper.
 */

import { Emulator } from "../../src/emulator/index.js";
import fs from "fs";
const TEST_OUTPUT_FILE = "/tmp/test-emu-output.jsonl";

describe("Emulator", () => {
    let emulator;

    afterEach(() => {
        if (emulator) {
            emulator.forceStop();
        }
        if (fs.existsSync(TEST_OUTPUT_FILE)) {
            fs.unlinkSync(TEST_OUTPUT_FILE);
        }
    });

    describe("constructor", () => {
        test("uses default ROM path when not provided", () => {
            emulator = new Emulator();
            expect(emulator.romPath).toContain("Tecmo Super Bowl (USA).nes");
        });

        test("accepts custom ROM path", () => {
            const customPath = "/custom/path/rom.nes";
            emulator = new Emulator({ romPath: customPath });
            expect(emulator.romPath).toBe(customPath);
        });

        test("accepts custom nesl path", () => {
            const customPath = "/usr/local/bin/nesl";
            emulator = new Emulator({ neslPath: customPath });
            expect(emulator.neslPath).toBe(customPath);
        });

        test("defaults nesl path to /tmp/nesl/build/nesl", () => {
            emulator = new Emulator();
            expect(emulator.neslPath).toBe("/tmp/nesl/build/nesl");
        });

        test("accepts custom output file", () => {
            emulator = new Emulator({ outputFile: "/tmp/custom-output.jsonl" });
            expect(emulator.outputFile).toBe("/tmp/custom-output.jsonl");
        });

        test("accepts custom max games", () => {
            emulator = new Emulator({ maxGames: 14 });
            expect(emulator.maxGames).toBe(14);
        });

        test("defaults lua script to controller.lua", () => {
            emulator = new Emulator();
            expect(emulator.luaScript).toContain("lua/controller.lua");
        });
    });

    describe("status methods", () => {
        test("isRunning returns false initially", () => {
            emulator = new Emulator();
            expect(emulator.isRunning()).toBe(false);
        });
    });

    describe("stop methods", () => {
        test("stop does not throw when process is null", () => {
            emulator = new Emulator();
            expect(() => emulator.stop()).not.toThrow();
        });

        test("forceStop does not throw when process is null", () => {
            emulator = new Emulator();
            expect(() => emulator.forceStop()).not.toThrow();
        });
    });

    describe("parseResults", () => {
        test("returns empty array when file does not exist", () => {
            emulator = new Emulator({ outputFile: "/tmp/nonexistent.jsonl" });
            expect(emulator.parseResults()).toEqual([]);
        });

        test("returns empty array for empty file", () => {
            fs.writeFileSync(TEST_OUTPUT_FILE, "");
            emulator = new Emulator({ outputFile: TEST_OUTPUT_FILE });
            expect(emulator.parseResults()).toEqual([]);
        });

        test("parses single JSON line", () => {
            const game = { p1_team: "PHI", p2_team: "GB", p1_score: 41, p2_score: 33 };
            fs.writeFileSync(TEST_OUTPUT_FILE, JSON.stringify(game) + "\n");
            emulator = new Emulator({ outputFile: TEST_OUTPUT_FILE });
            const results = emulator.parseResults();
            expect(results).toHaveLength(1);
            expect(results[0].p1_team).toBe("PHI");
            expect(results[0].p1_score).toBe(41);
        });

        test("parses multiple JSON lines", () => {
            const games = [
                { p1_team: "PHI", p2_team: "GB", p1_score: 41, p2_score: 33 },
                { p1_team: "PHX", p2_team: "NO", p1_score: 3, p2_score: 39 },
                { p1_team: "NE", p2_team: "TB", p1_score: 53, p2_score: 21 },
            ];
            fs.writeFileSync(TEST_OUTPUT_FILE, games.map((g) => JSON.stringify(g)).join("\n") + "\n");
            emulator = new Emulator({ outputFile: TEST_OUTPUT_FILE });
            const results = emulator.parseResults();
            expect(results).toHaveLength(3);
            expect(results[0].p1_team).toBe("PHI");
            expect(results[1].p1_team).toBe("PHX");
            expect(results[2].p1_team).toBe("NE");
        });

        test("skips malformed JSON lines", () => {
            const content = '{"p1_team":"PHI"}\nnot json\n{"p1_team":"GB"}\n';
            fs.writeFileSync(TEST_OUTPUT_FILE, content);
            emulator = new Emulator({ outputFile: TEST_OUTPUT_FILE });
            const results = emulator.parseResults();
            expect(results).toHaveLength(2);
            expect(results[0].p1_team).toBe("PHI");
            expect(results[1].p1_team).toBe("GB");
        });

        test("accepts custom file path argument", () => {
            const altFile = "/tmp/test-alt-output.jsonl";
            const game = { p1_team: "BUF", p1_score: 28 };
            fs.writeFileSync(altFile, JSON.stringify(game) + "\n");
            emulator = new Emulator();
            const results = emulator.parseResults(altFile);
            expect(results).toHaveLength(1);
            expect(results[0].p1_team).toBe("BUF");
            fs.unlinkSync(altFile);
        });
    });

    describe("run", () => {
        test("rejects when ROM not found", async () => {
            emulator = new Emulator({ romPath: "/nonexistent/rom.nes" });
            await expect(emulator.run()).rejects.toThrow("ROM not found");
        });

        test("rejects when nesl not found", async () => {
            emulator = new Emulator({ neslPath: "/nonexistent/nesl" });
            // Only test if the ROM actually exists (skip in CI)
            if (fs.existsSync(emulator.romPath)) {
                await expect(emulator.run()).rejects.toThrow("nesl not found");
            }
        });
    });
});

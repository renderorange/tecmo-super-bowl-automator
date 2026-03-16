import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_ROM = process.env.TECMO_ROM ||
    path.join(process.env.HOME, "roms/nes/Tecmo Super Bowl (USA).nes");

const DEFAULT_NESL = process.env.NESL_PATH || "/tmp/nesl/build/nesl";

const DEFAULT_LUA_SCRIPT = path.join(__dirname, "lua", "controller.lua");

export class Emulator {
    constructor(options = {}) {
        this.romPath = options.romPath || DEFAULT_ROM;
        this.neslPath = options.neslPath || DEFAULT_NESL;
        this.luaScript = options.luaScript || DEFAULT_LUA_SCRIPT;
        this.outputFile = options.outputFile || "/tmp/tsb-results.jsonl";
        this.maxGames = options.maxGames || 9999;

        this.process = null;
        this.running = false;
    }

    /**
     * Run the season simulator.
     * Spawns nesl with the controller Lua script, waits for it to finish,
     * and returns the parsed game results.
     *
     * @param {object} options - Override defaults for this run
     * @param {number} options.maxGames - Max games to simulate
     * @param {string} options.outputFile - Where to write JSONL results
     * @param {function} options.onGame - Callback for each game completion (receives parsed JSON)
     * @param {function} options.onProgress - Callback for progress messages (receives string)
     * @returns {Promise<object[]>} Array of game result objects
     */
    async run(options = {}) {
        const maxGames = options.maxGames || this.maxGames;
        const outputFile = options.outputFile || this.outputFile;
        const onGame = options.onGame || null;
        const onProgress = options.onProgress || null;

        if (!fs.existsSync(this.romPath)) {
            throw new Error(`ROM not found: ${this.romPath}`);
        }
        if (!fs.existsSync(this.neslPath)) {
            throw new Error(`nesl not found: ${this.neslPath}. Build it first (see README).`);
        }

        // Clean output file
        if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile);
        }

        const env = {
            ...process.env,
            TSB_OUTPUT: outputFile,
            TSB_MAX_GAMES: String(maxGames),
        };

        this.process = spawn(this.neslPath, [this.luaScript, this.romPath], {
            env,
            stdio: ["ignore", "pipe", "pipe"],
        });

        this.running = true;
        const games = [];

        return new Promise((resolve, reject) => {
            // Parse stdout line-by-line for progress reporting
            const rl = readline.createInterface({ input: this.process.stdout });
            rl.on("line", (line) => {
                if (onProgress) {
                    onProgress(line);
                }
                // When a game completes, the Lua script prints "Game N: ..."
                // and writes a JSON line to the output file.
                // We can parse the output file at the end, or stream it.
                if (line.startsWith("Game ") && onGame) {
                    // Read the latest line from the output file
                    try {
                        const content = fs.readFileSync(outputFile, "utf8").trim();
                        const lines = content.split("\n");
                        const lastLine = lines[lines.length - 1];
                        if (lastLine) {
                            const parsed = JSON.parse(lastLine);
                            games.push(parsed);
                            onGame(parsed, games.length);
                        }
                    } catch (e) {
                        // File may not be written yet, ignore
                    }
                }
            });

            // Capture stderr
            let stderrBuf = "";
            this.process.stderr.on("data", (data) => {
                stderrBuf += data.toString();
            });

            this.process.on("close", (code) => {
                this.running = false;
                this.process = null;

                if (code !== 0 && code !== null) {
                    reject(new Error(
                        `nesl exited with code ${code}${stderrBuf ? ": " + stderrBuf.trim() : ""}`,
                    ));
                    return;
                }

                // Parse all results from the output file
                const results = this.parseResults(outputFile);
                resolve(results);
            });

            this.process.on("error", (err) => {
                this.running = false;
                this.process = null;
                reject(new Error(`Failed to start nesl: ${err.message}`));
            });
        });
    }

    /**
     * Parse the JSONL output file into an array of game objects.
     */
    parseResults(filePath) {
        const outputFile = filePath || this.outputFile;
        if (!fs.existsSync(outputFile)) {
            return [];
        }

        const content = fs.readFileSync(outputFile, "utf8").trim();
        if (!content) {
            return [];
        }

        return content.split("\n").map((line, i) => {
            try {
                return JSON.parse(line);
            } catch (e) {
                console.error(`Failed to parse game ${i + 1}: ${e.message}`);
                return null;
            }
        }).filter(Boolean);
    }

    /**
     * Check if the emulator process is currently running.
     */
    isRunning() {
        return this.running;
    }

    /**
     * Stop the emulator process.
     */
    stop() {
        if (this.process) {
            this.process.kill("SIGTERM");
            this.running = false;
            this.process = null;
        }
    }

    /**
     * Force-kill the emulator process.
     */
    forceStop() {
        if (this.process) {
            this.process.kill("SIGKILL");
            this.running = false;
            this.process = null;
        }
    }
}

export default Emulator;

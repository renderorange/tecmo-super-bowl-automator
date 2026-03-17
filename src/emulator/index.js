import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_ROM = process.env.TECMO_ROM || path.join(process.env.HOME, "roms/nes/Tecmo Super Bowl (USA).nes");

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
        this.lastStderr = "";
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

        this.lastStderr = "";

        this.process = spawn(this.neslPath, [this.luaScript, this.romPath], {
            env,
            stdio: ["ignore", "pipe", "pipe"],
        });

        this.running = true;
        const games = [];
        const pendingCallbacks = [];
        let file_offset = 0;
        let partial_line_buffer = "";
        const parsed_line_queue = [];

        return new Promise((resolve, reject) => {
            // Parse stdout line-by-line for progress reporting
            const rl = readline.createInterface({ input: this.process.stdout });
            const refreshParsedLines = () => {
                if (!fs.existsSync(outputFile)) {
                    return;
                }

                const stats = fs.statSync(outputFile);
                if (stats.size < file_offset) {
                    file_offset = 0;
                    partial_line_buffer = "";
                    parsed_line_queue.length = 0;
                }

                if (stats.size === file_offset) {
                    return;
                }

                const fd = fs.openSync(outputFile, "r");
                try {
                    const bytes_to_read = stats.size - file_offset;
                    const chunk = Buffer.alloc(bytes_to_read);
                    fs.readSync(fd, chunk, 0, bytes_to_read, file_offset);
                    file_offset = stats.size;

                    const text = partial_line_buffer + chunk.toString("utf8");
                    const lines = text.split("\n");
                    partial_line_buffer = lines.pop() || "";

                    for (const parsed_line of lines) {
                        if (parsed_line.trim()) {
                            parsed_line_queue.push(parsed_line);
                        }
                    }
                } finally {
                    fs.closeSync(fd);
                }
            };

            const nextParsedGame = async () => {
                for (let i = 0; i < 5; i++) {
                    refreshParsedLines();
                    if (parsed_line_queue.length > 0) {
                        return parsed_line_queue.shift();
                    }
                    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
                }
                return null;
            };

            rl.on("line", (line) => {
                if (onProgress) {
                    onProgress(line);
                }
                if (line.startsWith("Game ") && onGame) {
                    rl.pause();
                    const callbackPromise = (async () => {
                        try {
                            const game_line = await nextParsedGame();
                            if (game_line) {
                                const parsed = JSON.parse(game_line);
                                games.push(parsed);
                                await onGame(parsed, games.length);
                            } else {
                                console.error("onGame callback warning: missing JSONL line for game event");
                            }
                        } catch (e) {
                            console.error("onGame callback error:", e.message);
                        } finally {
                            if (!rl.closed) {
                                rl.resume();
                            }
                        }
                    })();
                    pendingCallbacks.push(callbackPromise);
                }
            });

            // Capture stderr for crash diagnostics
            this.process.stderr.on("data", (data) => {
                this.lastStderr += data.toString();
            });

            this.process.on("close", async (code) => {
                this.running = false;
                this.process = null;

                // Wait for all pending onGame callbacks to complete
                await Promise.all(pendingCallbacks);

                if (code !== 0 && code !== null) {
                    const stderrTrimmed = this.lastStderr.trim();
                    reject(new Error(`nesl exited with code ${code}${stderrTrimmed ? ": " + stderrTrimmed : ""}`));
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

        return content
            .split("\n")
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
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

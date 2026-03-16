import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fileURLToPath as urlToPath } from "url";

const __filename = urlToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_ROM = process.env.TECMO_ROM ||
    "/home/blaine/roms/nes/Tecmo Super Bowl (USA).nes";

export class Emulator {
    constructor(options = {}) {
        this.romPath = options.romPath || DEFAULT_ROM;
        this.workDir = options.workDir || "./runs/worker-0";
        this.stateDir = path.join(this.workDir, "states");
        this.workerId = options.workerId || 0;
        this.fceuxPath = options.fceuxPath || "fceux";
        this.xvfb = options.xvfb !== false;

        this.process = null;
        this.running = false;
        this.started = false;
        this.outputBuffer = "";
        this.outputFile = path.join(this.workDir, "emu-output.txt");
        this.display = null;

        fs.mkdirSync(this.workDir, { recursive: true });
        fs.mkdirSync(this.stateDir, { recursive: true });
    }

    async startXvfb() {
        if (!this.xvfb) return;
        
        try {
            execSync("pkill -f 'Xvfb :99' 2>/dev/null", { stdio: "ignore" });
        } catch (e) {}
        
        await new Promise(r => setTimeout(r, 500));
        
        try {
            spawn("Xvfb", [":99", "-screen", "0", "1024x768x16"], {
                stdio: "ignore",
                detached: true
            });
            
            await new Promise(r => setTimeout(r, 2000));
            this.display = ":99";
        } catch (e) {
            console.error("Failed to start Xvfb:", e.message);
            this.display = null;
        }
    }

    stopXvfb() {
        if (this.display) {
            try {
                execSync("pkill -f 'Xvfb :99'", { stdio: "ignore" });
            } catch (e) {}
            this.display = null;
        }
    }

    async start(luaScript) {
        await this.startXvfb();
        
        const absLuaScript = path.isAbsolute(luaScript) 
            ? luaScript 
            : path.resolve(process.cwd(), luaScript);
        const absRomPath = path.isAbsolute(this.romPath) 
            ? this.romPath 
            : path.resolve(process.cwd(), this.romPath);

        const args = [
            "--loadlua", absLuaScript,
            "--no-config",
            "--nosound",
            "--noframe",
            this.romPath
        ];

        const env = {
            ...process.env,
            QT_QPA_PLATFORM: "offscreen",
            LUA_OUTPUT_FILE: this.outputFile
        };
        
        if (this.display) {
            env.DISPLAY = this.display;
        }

        this.process = spawn(this.fceuxPath, args, {
            env,
            stdio: ["ignore", "pipe", "pipe"]
        });

        this.running = true;

        this.process.stdout.on("data", (data) => {
            const text = data.toString();
            this.outputBuffer += text;
            console.log("[EMU stdout]:", text);
            if (text.includes("started")) {
                this.started = true;
            }
        });

        this.process.stderr.on("data", (data) => {
            const text = data.toString();
            console.error(`[EMU stderr]: ${text}`);
            if (text.includes("started")) {
                this.started = true;
            }
        });

        this.process.on("close", (code) => {
            this.running = false;
            this.started = false;
        });

        this.process.on("error", (err) => {
            console.error(`Emulator process error: ${err}`);
            this.running = false;
        });

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!this.started) {
                    reject(new Error("Emulator start timeout"));
                }
            }, 30000);

            const checkStarted = setInterval(() => {
                if (fs.existsSync(this.outputFile)) {
                    try {
                        const content = fs.readFileSync(this.outputFile, "utf8");
                        if (content.includes("LUA STARTED")) {
                            this.started = true;
                        }
                    } catch (e) {}
                }
                if (this.started) {
                    clearInterval(checkStarted);
                    clearTimeout(timeout);
                    resolve();
                }
            }, 100);

            this.process.on("error", (err) => {
                clearInterval(checkStarted);
                clearTimeout(timeout);
                reject(err);
            });
        });
    }

    getStatePath(slot = 0) {
        return path.join(this.stateDir, `state-${slot}.fc0`);
    }

    async saveState(slot = 0) {
        const stateFile = this.getStatePath(slot);
        await this.sendCommand(`save_state "${stateFile}"`);
        return stateFile;
    }

    async loadState(slot = 0) {
        const stateFile = this.getStatePath(slot);
        if (!fs.existsSync(stateFile)) {
            throw new Error(`State file not found: ${stateFile}`);
        }
        await this.sendCommand(`load_state "${stateFile}"`);
        return stateFile;
    }

    async sendCommand(command) {
        if (!this.process || !this.running) {
            throw new Error("Emulator is not running");
        }
        this.process.stdin.write(command + "\n");
    }

    getOutput() {
        if (fs.existsSync(this.outputFile)) {
            try {
                return fs.readFileSync(this.outputFile, "utf8");
            } catch (e) {
                return "";
            }
        }
        return "";
    }

    isRunning() {
        return this.running;
    }

    quit() {
        if (this.process) {
            this.process.kill("SIGTERM");
            this.running = false;
            this.started = false;
        }
        this.stopXvfb();
    }

    forceQuit() {
        if (this.process) {
            this.process.kill("SIGKILL");
            this.running = false;
            this.started = false;
        }
        this.stopXvfb();
    }
}

export default Emulator;

import { Emulator } from "../src/emulator/index.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const luaScript = path.join(projectRoot, "src/emulator/lua/test-controller.lua");

const emulator = new Emulator({
    workDir: "/tmp/test-emu-integration",
    xvfb: true
});

console.log("Starting emulator with test script...");

try {
    await emulator.start(luaScript);
    console.log("Emulator started successfully!");
    
    const output = emulator.getOutput();
    console.log("Output received:", output);
    
    emulator.quit();
    
    console.log("Test completed successfully!");
} catch (error) {
    console.error("Test failed:", error.message);
    emulator.forceQuit();
    process.exit(1);
}

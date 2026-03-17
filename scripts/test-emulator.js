import { Emulator } from "../src/emulator/index.js";
import fs from "fs";

const outputFile = "/tmp/test-emu-integration.jsonl";

const emulator = new Emulator({
    outputFile,
    maxGames: 1,
});

console.log("Starting emulator integration test (1 COM vs COM game)...");
console.log(`ROM: ${emulator.romPath}`);
console.log(`nesl: ${emulator.neslPath}`);

try {
    const results = await emulator.run({
        maxGames: 1,
        onProgress: (line) => console.log(`  [nesl] ${line}`),
    });

    if (results.length === 0) {
        console.error("ERROR: No game results returned");
        process.exit(1);
    }

    const game = results[0];
    console.log(`\nResult: ${game.p1_team} ${game.p1_score} - ${game.p2_team} ${game.p2_score}`);
    console.log(
        `QB1 passing: ${game.p1_players.qb1.passing_completions}` +
            `/${game.p1_players.qb1.passing_attempts} ${game.p1_players.qb1.passing_yards} yds`,
    );
    console.log("\nIntegration test passed!");

    // Clean up
    if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
    }
} catch (error) {
    console.error("Integration test failed:", error.message);
    emulator.forceStop();
    process.exit(1);
}

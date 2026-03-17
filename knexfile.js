import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
    client: "better-sqlite3",
    connection: {
        filename: path.join(__dirname, "data", "stats.db"),
    },
    useNullAsDefault: true,
    pool: {
        afterCreate: (conn, cb) => {
            conn.pragma("journal_mode = WAL");
            conn.pragma("busy_timeout = 10000");
            cb(null, conn);
        },
    },
    migrations: {
        directory: path.join(__dirname, "src", "db", "migrations"),
    },
    seeds: {
        directory: path.join(__dirname, "src", "db", "seeds"),
    },
};

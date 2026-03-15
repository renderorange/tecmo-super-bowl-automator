import knex_init from "knex";
import config from "../../knexfile.js";

const db = knex_init(config);

export default db;

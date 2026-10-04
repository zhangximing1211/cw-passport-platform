import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import seedSql from "../../seed/demo.sql?raw";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// scripts/generate-seed.mjs writes exactly one statement per line.
const statements = seedSql.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("--"));
await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));

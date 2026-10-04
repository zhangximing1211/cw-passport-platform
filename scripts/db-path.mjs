#!/usr/bin/env node
// Prints the path of the local D1 database file that `wrangler dev` uses (npm run db:path).
// Open it with any SQLite viewer; see README "查看数据库".

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve("./.wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const file = existsSync(dir) && readdirSync(dir).find((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
if (!file) {
  console.error("No local database yet. Run `npm run db:setup` first.");
  process.exit(1);
}
console.log(join(dir, file));

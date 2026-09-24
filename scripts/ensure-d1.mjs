// Makes sure the D1 database exists and wrangler.jsonc points at it.
// Runs before every deploy, so a fresh Cloudflare account needs no manual step.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const NAME = "rimjhim-cafe";
const CONFIG = new URL("../wrangler.jsonc", import.meta.url);
const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

function wrangler(args) {
  return execSync(`npx wrangler ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

const config = readFileSync(CONFIG, "utf8");
const current = /"database_id":\s*"([^"]+)"/.exec(config)[1];
if (current !== PLACEHOLDER) {
  console.log(`D1 database already configured (${current}).`);
  process.exit(0);
}

let list = [];
try { list = JSON.parse(wrangler("d1 list --json")); } catch (e) { list = []; }
let db = list.find((d) => d.name === NAME);
if (!db) {
  console.log(`Creating D1 database "${NAME}"...`);
  wrangler(`d1 create ${NAME}`);
  db = JSON.parse(wrangler("d1 list --json")).find((d) => d.name === NAME);
}
if (!db) throw new Error("Could not create or find the D1 database.");
const id = db.uuid || db.id || db.database_id;
writeFileSync(CONFIG, config.replace(PLACEHOLDER, id));
console.log(`Using D1 database ${NAME} (${id}).`);

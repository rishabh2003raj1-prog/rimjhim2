// Stamps a build id into the app before deploying, so phones running an older
// copy of the app can tell a newer one is live (Refresh then reloads it).
import { readFileSync, writeFileSync } from "node:fs";

const id = (process.env.GITHUB_SHA || "").slice(0, 12) || ("local-" + Date.now().toString(36));
const page = "public/index.html";
const html = readFileSync(page, "utf8");
const out = html.replace(/var APP_BUILD = "[^"]*";/, `var APP_BUILD = "${id}";`);
if (out === html && !html.includes(`var APP_BUILD = "${id}";`)) {
  console.error("stamp-build: APP_BUILD marker not found in " + page);
  process.exit(1);
}
writeFileSync(page, out);
writeFileSync("public/build.json", JSON.stringify({ build: id }) + "\n");
console.log("stamp-build: " + id);

// A new Cloudflare account has no workers.dev subdomain, and `wrangler deploy`
// refuses to publish until it has one. Register one through the API so nobody
// has to find the right dashboard page.
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) {
  console.log("No CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID - skipping subdomain check.");
  process.exit(0);
}
const url = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/subdomain`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const cur = await (await fetch(url, { headers })).json();
if (cur.success && cur.result && cur.result.subdomain) {
  console.log(`workers.dev subdomain: ${cur.result.subdomain}.workers.dev`);
  process.exit(0);
}

const base = process.env.WORKERS_SUBDOMAIN || "rimjhimcafe";
const tries = [base, `${base}-${account.slice(0, 6)}`, `${base}-${Math.random().toString(36).slice(2, 8)}`];
for (const name of tries) {
  const res = await (await fetch(url, { method: "PUT", headers, body: JSON.stringify({ subdomain: name }) })).json();
  if (res.success) {
    console.log(`Registered workers.dev subdomain: ${name}.workers.dev`);
    process.exit(0);
  }
  console.log(`Could not use "${name}": ${JSON.stringify(res.errors)}`);
}
console.error("Could not register a workers.dev subdomain. Set one in the Cloudflare dashboard (Workers & Pages).");
process.exit(1);

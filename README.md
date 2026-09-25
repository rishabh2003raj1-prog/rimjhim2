# Rimjhim Cafe

The cafe's books (sales, purchases, expenses, staff, stock, cash counter, reports) as a web app on Cloudflare.

All data is stored on the cafe's own Cloudflare server (a D1 database), not in the phone's browser. That removes the old ~5 MB limit ("storage full / entry NOT saved"), keeps bill and asset photos on the server, and lets both partners' phones share the same books. Each phone also keeps an offline copy, so entries made without internet upload when the phone reconnects.

## What's here

| Path | What it is |
|---|---|
| `public/index.html` | The app |
| `public/vendor/` | Chart.js and jsPDF, served from the app's own server |
| `public/sw.js`, `manifest.webmanifest`, icons | Offline start and "Add to Home screen" |
| `src/worker.js` | Backend: PIN sign-in, data storage, photos, AI note reading |
| `scripts/ensure-d1.mjs` | Creates the D1 database on first deploy |
| `.github/workflows/deploy.yml` | Deploys on every push to `main` |

## Deploy (one time, about 10 minutes)

You need a free Cloudflare account. No card is needed: D1 and Workers are on the free plan.

### Option A: from GitHub (recommended)

1. In Cloudflare, go to **My Profile → API Tokens → Create Token** and use the **Edit Cloudflare Workers** template. Add **Account → D1 → Edit** to the permissions. Copy the token.
2. Copy your **Account ID**. It's shown on the right side of the Workers & Pages overview page.
3. In this GitHub repo, go to **Settings → Secrets and variables → Actions** and add these secrets:
   - `CLOUDFLARE_API_TOKEN`: the token from step 1
   - `CLOUDFLARE_ACCOUNT_ID`: the ID from step 2
   - `APP_PIN`: the PIN both partners will type to open the app. Use 6 or more digits.
   - `ANTHROPIC_API_KEY` (optional): uses Claude to read notes in the Master tab. Without it, notes are read by Cloudflare Workers AI, which is free within Cloudflare's daily allowance. If that is unavailable too, the phone's own simpler reader is used.
4. Merge to `main`, or run the **Deploy to Cloudflare** workflow from the Actions tab.
5. The app is served at `https://rimjhim-cafe.<your-subdomain>.workers.dev`.

### Option B: from a computer

```bash
npm install
npx wrangler login
npm run deploy                       # creates the database the first time, then deploys
npx wrangler secret put APP_PIN      # choose the PIN
npx wrangler secret put ANTHROPIC_API_KEY   # optional
```

## First use

1. Open the app's address in **Chrome** on each phone and enter the PIN. Then use Chrome menu → **Add to Home screen**.
2. Move the existing records over: in the **old** app file, tap **Backup & restore → Download backup** (or **Copy backup text**). In the new app, tap **Backup & restore → Restore from backup file** (or **Restore from copied text**). Do this once, on one phone. Everything uploads, photos included, and the other phone gets it automatically.

To change the PIN, run `npx wrangler secret put APP_PIN` again (or update the GitHub secret and re-run the workflow). Every phone is signed out and has to enter the new PIN.

## Running locally

```bash
npm install
echo "APP_PIN=1234" > .dev.vars
npm run dev     # http://localhost:8787
```

## Outlets

Tap the outlet name at the top of the app to switch outlets, add a new one, or rename the current one. Each outlet keeps its own books: sales, purchases, expenses, stock, staff, cash and reports. The outlet list is shared, so both phones see the same outlets. The switcher also shows each outlet's figures for the current month, and a total across all outlets.

## Staff salary

Staff → **Salary** shows each person's salary for a month:
- **What they're owed:** days employed, leave taken against the paid leave allowance (2 days a month by default), deductions for extra leave, and allowances.
- **Unused leave:** paid leave days not taken are owed as extra pay.
- **Payments:** what's been paid and on which dates, compared with the due date (the 7th of the next month by default).

**Final settlement** closes a month. If the person chooses not to take the extra pay for unused leave, it's recorded as goodwill, which you can give back later with **Give bonus**. **Salary slip** shows the month's slip, which you can download as a PDF or send on WhatsApp.

## How saving works

- Each list (sales, purchases, …) is saved to the server a moment after every change. The top bar shows **Saved to cloud hh:mm**, **Saving…**, or **Offline — N changes will upload**.
- If both phones change the same list at the same time, the changes are merged record by record. Additions, edits and deletions from both phones are all kept.
- Changes from the other phone appear within a few seconds, or straight away when the app is reopened.
- **Backup & restore → Download backup** still produces a full JSON backup for safekeeping.

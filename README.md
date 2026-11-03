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

## Monthly bills

Records → **Bills** shows one month's rent, electricity, other monthly costs and each person's salary: the amount for that month, every payment made for it (tap one to edit it, 📅 to see that day on the calendar), and what is still to pay.
- **Edit amount** changes a bill for that month only (e.g. this month's electricity bill) or from that month onward (e.g. a new rent).
- **Edit salary** changes a salary for that month only or from that month onward (a raise), plus the joining and leaving dates. Earlier months keep their old salary. A salary changed in the staff profile applies from the current month.
- Rent, bills and salaries count in the month they are for, on every screen that shows profit (Dashboard, reports, outlet totals). August salary paid on 3 September counts as an August expense. Cash in the counter and bank still go by the day the money actually left.
- The Calendar and the Bills tab always show the same month. Under the calendar is a summary of that month's bills; purple dots mark days a bill or salary was paid. The Dashboard's fixed cost card has a button to open that month's bills.

## Bank balance

The bank balance in the Cash tab and on the Dashboard is the balance last noted in Cash → Opening balances, plus everything since that date:
- **In:** UPI and card sales, udhaar paid back by UPI/card/bank, partner investments not made in cash, handover cash deposited.
- **Out:** bills and purchases the cafe paid by UPI, card or bank (not udhaar purchases, a partner's own money, or handover cash), partner withdrawals not taken in cash, and partners repaid by UPI/bank.

When the cafe repays a partner (Expenses → Money owed to partners → Settle, or "Repay all"), pick how: UPI/bank (comes off the bank balance), cash from the counter (comes off that day's counter cash), cash another partner holds from handovers (comes off their Handover balance), or count it as their investment.

**+ Interest received** and **+ Bank charge** on the Cash tab's bank card record those too. Interest adds to the bank balance and counts as other income in profit (Dashboard, PDF report, outlet totals) on the day it was credited; a bank charge is saved as a "Bank charges" expense paid from the cafe account, so it lowers the bank balance and counts as a cost. Tap either in the list to edit it.

Compare the balance with the bank app now and then; if it still differs (a missed entry), note the real balance and the count starts again from that date.

### Bank tab

Records → **Bank** reviews the cafe bank / UPI account month by month, like the Handover tab:
- Balance at the start of the month, money in and out by type, and the balance at the end (worked forwards or backwards from the balance last noted).
- Where the account money was spent, by category.
- Every entry, newest first, with the running balance; tap one to open it (UPI sales open that day on the calendar).
- **Cash withdrawn** (into the counter, or kept by a partner, which shows in their Handover balance), **Adjustment** (add or take off, with a note, to match the bank statement; doesn't change profit), **+ Interest**, **+ Bank charge**.
- **Mark month as reviewed** once it matches the statement.
- **Download statement PDF**: an A4 statement for the month with the summary, every entry with money in / out and running balance, and spending by category. On a phone it opens the share sheet (WhatsApp, Drive, email).

## Partner money

Partner money is kept apart from the cafe's own sales and profit. Each entry (Records → Invest, or + Add money on the Partners tab) is one of:
- **Capital investment**, by category: Shop purchase, Shop renovation / interiors, Equipment / furniture, Rent / security deposit, Other capital.
- **Loan to the cafe (working capital)**: repaid by the cafe from profit over time.
- **Loan repaid by the cafe**: can't be more than what is outstanding.
- **Withdrawal**: profit share or personal use.

Each entry also says **where the money went**: *paid directly* to a seller, contractor or vendor (doesn't touch cafe cash or bank; the default for capital), into the cafe bank, into the counter, or kept by a person (handover cash). Withdrawals and loan repayments say where they were paid from. Older entries: "Working capital" became a loan; other capital entries count as paid directly; edit any that went through the cafe's bank or counter.

**Records → Partners** shows, per partner: capital by category and share, the working capital loan (lent, repaid, outstanding) with a **Repay loan** button, and withdrawals. At the top: total capital, loans outstanding, cafe profit so far, and profit still available to repay loans. A bill a partner paid from their own money can be settled as "count it as their loan to the cafe".

The monthly cash review shows partner money in its own section, separate from what the cafe earned and spent.

## Monthly cash review

Records → **Cash review** (also from the Cash tab) shows all the cafe's money for a month:
- **Where it is:** counter, cash with each person (handovers), and the bank / UPI account, at the start and end of the month (or now, for the current month), with the total.
- **What changed it:** cash sales, UPI / card sales, udhaar collected, partner investments, bank interest, purchases paid, bills & expenses paid, partner withdrawals, partners repaid, counter short / over at counts, and bank adjustments. These always add up to the change in the total.
- Money moved between places (handovers, deposits, cash withdrawn from the bank) is listed separately, since it doesn't change the total.
- Counter counts that didn't tally, with the incharge; tap one to open that day.
- What is owed to partners for bills they paid themselves (not in the totals, as no cafe money has moved yet).
- **Download cash review PDF** for the month.

## Cash handover

Records → **Handover** follows the counter cash handed to each partner (or staff member) at the daily count, month by month:
- **Received:** handovers from the counter, cash taken from the counter, cash received from another person.
- **Where it went:** bills and purchases paid from it (choose "*name* - from cafe cash they hold" as **Paid by**), deposits in the cafe bank, cash put back in the counter, cash given to someone else, and cash kept as a partner withdrawal (also shown on the Partners tab).
- **Still with them:** carried forward to the next month. A warning appears if more was used than was handed over.

**Download handover statement PDF** creates the month's statement for everyone (a table of who holds what, then each person's summary and entries with a running balance); **Statement PDF** on a person's card does the same for just them, with signature lines.

Cash put back in, or taken out of, the counter changes that day's expected counter cash. Tap any line to edit it.

## Staff salary

Staff → **Salary** shows each person's salary for a month:
- **What they're owed:** salary on a 30-day basis (daily rate = monthly salary ÷ 30; a full month is always the full salary; a part month is days worked × daily rate), days employed, leave taken against the paid leave allowance (2 days for each full month worked, none in a joining or leaving month), deductions for extra leave, and allowances.
- **Unused leave:** paid leave days not taken are owed as extra pay.
- **Payments:** what's been paid and on which dates, compared with the due date (the 7th of the next month by default).

**Salary advance** (in the staff profile or on the Salary card) records money given early against a month's salary, reducing that month's balance.

**Final settlement** closes a month. You can round off the total: to the nearest ₹1, down to the rupee, to the nearest ₹10, down to ₹10, or an amount you type (within ₹100), e.g. ₹13,332.40 settled as ₹13,330. The round off shows on the Salary card and the salary slip, and Bills and the Dashboard use the rounded amount. If the person chooses not to take the extra pay for unused leave, it's recorded as goodwill, which you can give back later with **Give bonus**. **Salary slip** shows the month's slip, which you can download as a PDF or send on WhatsApp.

## How saving works

- Each list (sales, purchases, …) is saved to the server a moment after every change. The top bar shows **Saved to cloud hh:mm**, **Saving…**, or **Offline — N changes will upload**.
- If both phones change the same list at the same time, the changes are merged record by record. Additions, edits and deletions from both phones are all kept.
- Changes from the other phone appear within a few seconds, or straight away when the app is reopened.
- **↻ Refresh** in the top bar pulls the latest data from the server and recalculates every screen. Screens also recalculate after every saved change, when the Dashboard is opened, and when the date changes.
- **Backup & restore → Download backup** still produces a full JSON backup for safekeeping.

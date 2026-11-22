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

1. Open the app's address in **Chrome** on each phone and sign in (owner: leave Login ID blank and enter the PIN). Then use Chrome menu → **Add to Home screen**.
2. Move the existing records over: in the **old** app file, tap **Backup & restore → Download backup** (or **Copy backup text**). In the new app, tap **Backup & restore → Restore from backup file** (or **Restore from copied text**). Do this once, on one phone. Everything uploads, photos included, and the other phone gets it automatically.

To change the PIN, run `npx wrangler secret put APP_PIN` again (or update the GitHub secret and re-run the workflow). Every phone is signed out and has to enter the new PIN.

## Running locally

```bash
npm install
echo "APP_PIN=1234" > .dev.vars
npm run dev     # http://localhost:8787
```

## Logins

- **Owner:** leave **Login ID** blank (or type `owner`) and enter the APP_PIN. The owner can open every store and manage logins.
- **Store logins:** Outlets (tap the outlet name) → **Store logins** → **+ Add login** for a store: a Login ID, the person's name and a password (6+ characters). A store login opens only its own store. The server refuses its requests for any other store's data, the outlet list and login management, and it can change its own password (tap the store name). Passwords are stored hashed (PBKDF2), never in plain text.
- Changing a login's password or store, or deleting it, signs that login out on every phone. Signing out removes every store's offline copy from the phone, and a store login signing in on a phone removes other stores' offline copies.
- Wrong attempts are limited to 10 per 15 minutes per connection.
- **Each phone signs in once a day** and stays signed in until **4 AM** (India time); switching apps, the phone sleeping or reopening the app don't ask again. The server enforces the 4 AM expiry, so a copied sign-in stops working too. Owner: Outlets → **Sign out all phones now** ends every session at once (e.g. a lost phone or someone leaving). After the day's sign-in has expired, the app asks before showing anything; without internet only the login last used on that phone can open it (a scrambled check of its password is kept on the phone, never the password).

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

### Daily bank balance

Like the counter count: on any calendar day, **Bank balance** shows what should be in the bank at the end of the day (from the last check plus that day's UPI / card sales, bank payments, deposits and other bank entries). Tap **Record bank balance** and type the balance from the bank app; the app shows whether it tallies or how much more / less there is. Each check becomes the starting point for the following days (like a counter count), and differences show as "found higher / lower at balance checks" in the Bank tab, the bank statement PDF and the cash review. Checked days get a blue dot on the calendar. Also from Records → Bank (**Record today's bank balance**) and the Cash tab.

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

**Download partner money statement PDF** (top of the Partners tab) gives every partner's capital, share, loan lent / repaid / owed and withdrawals, the cafe's profit position, then for each partner their capital by category, a loan ledger with the amount owed after each entry, and every entry with where the money went. **Statement PDF** on a partner's card does the same for one partner, with signature lines.

The monthly cash review shows partner money in its own section, separate from what the cafe earned and spent.

## Loans

Records → **Loans** (also from each calendar day) shows every loan in one place, month by month:
- **Loans the cafe owes:** working capital loans from partners (recorded on the Partners tab) and loans from anyone else - bank / NBFC, relative or friend, supplier, other - with borrowed, repaid and balance at month end, interest and repay-by date if given, and a **Repay** button for each.
- **Loans given by the cafe** (staff, suppliers, others), with received back and what is still to collect.
- **Loan entries** day by day (tap a day to open it on the calendar, tap an entry to edit), and staff **salary advances** for reference (they come off salary).
- **+ Loan taken / + Repay a loan / + Loan given / + Repayment received.** Each entry says where the money went or came from: the cafe bank, the counter (cash loans), cash a person holds, or - for a loan taken - paid directly by the lender (e.g. to a supplier). Bank, counter and handover balances follow it; repaying more than is owed is refused.
- **Download loan statement PDF** for the month.

The calendar shows a **Loans** card for each day and a brown dot on days with loan entries; the Loans tab and the calendar stay on the same month. Loans never count as cafe income or expense: the cash review shows them under "Partner money & loans", and the Dashboard shows loans owed and to collect.

## Undoing a settlement

Settled something by mistake (a wrong tap, or worked out wrongly)? **Review settlements** (Expenses → Money owed to partners → Review / undo settled items, Records → Partners, or Staff → Salary → Review settlements) lists every settled partner bill and staff salary month.
- **Partner bills:** **Undo** puts the item back to owed and reverses its effect (bank, counter or handover cash goes back up; a loan created by "count it as their loan" is removed). **Undo & settle again** opens the repay screen straight away.
- **Staff salary:** **Undo settlement** (also on the Salary card) removes the settlement - round off, the unused-leave choice and its goodwill - with an option to also delete the payment recorded at settlement (untick if it really was paid).

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

### How the cafe got by (monthly funding)
Reports → **Profit & loss + how the cafe got by (PDF)**, or tick *How the cafe got by, month by month* in the report list.
The profit & loss summary now has a **How the cafe met its needs** table: for each month, the profit or loss, loans (net),
partner money (net), udhaar & unpaid bills, and the resulting change in the cafe's own cash & bank. The detailed section
explains every month in words, lists each loan (by lender), partner capital, own-pocket bills, repayments, withdrawals,
customer udhaar and unpaid vendor bills, notes capital paid straight to a seller, and ends with the loans still open.

### One date for the whole app (day / month / year)
The calendar's selected day and month are shared by the whole app. Records → Sales, Purchases, Invest and Expenses
have a **Day / Month / Year** switch with ‹ › arrows: day and month views group entries by day with day totals
(tap a day to open it), the year view lists one row per month (tap to open that month). Each view starts with
totals for the period (payment modes, paid-how, by partner, by category). Bills, Handover, Bank, Cash review,
Loans and the Cash tab's counter log all show the same month — moving any of them (or the calendar) moves all of
them. Under the calendar, **Month at a glance** shows sales, purchases, expenses, profit and partner money, and
opens the matching Records view.
The **Cash** tab follows the same Day / Month / Year switch: Day shows that day's counter working (opening, cash
sales, paid from till, should-be, counted, difference, handover) with a button to record or update that day's count;
Month shows cash sales, paid from the till, short / extra, handovers by person and the counter log; Year shows one
row per month. The **Partners** tab shows what each partner put in or took out in the period (capital, loans,
repayments, withdrawals, own-pocket bills and paybacks) and every balance "as at" the end of the period.

### Staff: roster, flexible allowances, salary and payslips
- **Shifts:** two by default (Morning 8am–4pm, Evening 4pm–12am). Rename them, change timings or add/remove shifts
  under Staff → Roster → *Edit shifts* (renaming updates the roster and usual shifts).
- **Roster week grid:** staff × days; tap a box to cycle Morning → Evening → both → off. *Fill empty days with usual
  shifts*, *Copy last week*, *Clear this week*, and a cover row per shift (red when nobody is on). *One day* view too.
  A usual shift can be a shift, *Both shifts* or *Flexible*.
- **Allowances that change:** house rent (per month), food and travel (per month or **per day worked**). Change them
  for one month only or from a month onward (Staff → Salary → *Edit month*, or the staff form for "from this month").
- **One-off lines per month:** overtime, festival bonus (add) or damage, fine, canteen (deduct).
- **Unused paid leave is never paid or turned into goodwill automatically.** Each month choose *Pay extra*, *Don't pay*
  or *Goodwill*; final settlement asks if no choice was made. Salary rules can switch this to always / never pay.
- **Salary card:** earnings and deductions listed separately, total, payments, balance.
- **Payslip:** A4 PDF with employee details, earnings vs deductions, gross, total deductions, net pay in words,
  payments, balance and signature lines; the same layout on screen and as WhatsApp text.

### Bills: fixed vs variable
Every bill is either **Fixed** (same every month until changed — rent by default) or **Variable** (different every
month — electricity, wifi, mobile and new bills by default). Variable bills are never copied between months: a month
has an amount only once you **Enter bill** (amount, optional due date and a note such as units or bill number) or
record a payment. Until then the month shows *not entered*, with up to three earlier months for reference only —
they are not counted in "Still to pay". Fixed bills change from a month onward (or for one month only) and can have
a due day; unpaid bills past their due date are marked **overdue**. *Manage bills* sets each bill's kind and due day,
fixed amounts, and adds or removes bills. **Bill history** shows every bill for the last six months side by side.

### Staff meals (cost of feeding staff)
Staff → Meals. Set up once: **meal types** list what goes into each meal — quantities per person (2 eggs, 0.08 kg
rice) or for the whole cooking (1.5 kg chicken) — with rates taken from your last purchase of that item unless typed;
**oil, masala, gas** is an amount per plate; the **weekly menu** says what is cooked each day (2 meals by default,
1–3 possible). "Start with a typical menu" adds sabzi with rice / roti, aloo paratha, chicken, chicken biryani with
raita and egg days, to edit. The number eating comes from attendance (employed, not absent / on leave); any day can be
changed (another meal, a guest). The tab shows each day's cost, the month's cost, plates and cost per plate, by meal
and by person, and warns about items without a rate. The cost is part of purchases already, so it is not charged
again; it also appears in each person's "what they cost" and the dashboard's fixed cost card.
Staff meals can also be added from **Master → Quick add**, one per line: "staff dinner chicken biryani 6 people",
"staff lunch aloo paratha yesterday", "staff ate egg curry on 4 Nov", "no staff meal today". The note picks the
closest meal type, lunch / dinner (dinner if not said, the whole day for "no meal" or "both"), the date and the head
count (from attendance if not said). Undoing or editing the note puts the day back as it was.

### Master quick add: memory and more kinds of entries
- **Memory from your records:** every item you have bought (name, unit, category, last rate, usual vendor and
  quantity), vendors and how you usually pay them, udhaar customers, staff, loan parties, bills and meal types are
  given to the AI and used by the on-phone reader. A purchase without a price uses the last rate; without a vendor,
  the usual vendor and payment habit (e.g. Sharma Dairy on udhaar).
- **Hindi / Hinglish words:** doodh, cheeni, anda, pyaz, tamatar, chawal, dahi, murga, sabzi… are understood.
- **Learns from you:** renaming an item or vendor in a purchase the app filed teaches it that word. *What the app
  remembers* (link under Quick add) shows what it knows and lets you teach or forget words ("amul gold" → Milk).
- **One-tap chips:** your most-bought items with your usual quantity and vendor, sales, attendance and staff meal.
- **New kinds of lines:** attendance ("Ravi absent today", "Sita and Ravi half day yesterday"), salary advance
  ("Sita advance 2000 upi"), udhaar paid back ("Amit paid udhaar 500"), loans ("loan from Uncle 50000", "repaid
  loan to Uncle 5000", "gave loan to Ramesh 1000", a partner's loan goes to partner money), and bill amounts
  arriving ("electricity bill 4100 412 units due 15 Nov"). All can be undone or edited like other notes.
- Fixed: in the purchase bill form the first tap on Save after editing a field was lost; it now saves at once.

### Logins, roles and data security (Step 1)
Every person can have their own login with a **role** (Outlets → Logins & roles; owner only):

| Role | Sees and changes |
|---|---|
| Owner (PIN) | Everything, every store, logins, backups |
| Partner | Everything, for one store or **all stores**; activity log and backups; can't manage logins |
| Manager | Sales, purchases, expenses (salary payments shown without names), bills, customers, stock, menu, assets, vendors, cash count & handover, staff (no pay), roster, attendance, tasks, meals |
| Chef / kitchen | Menu & recipes, stock, purchases (adds), assets, vendors (view), staff names, roster, attendance, tasks, staff meals |
| Billing / counter | Adds sales, customers, udhaar payments; last two days only; **blind cash count** (expected amount not shown) |
| Full access | Older store logins, as before; pick a role to limit them |

How it is enforced (server, `src/worker.js`, `POLICY`): each list has a rule per role. The server only sends a
login what its rule allows (whole lists hidden, records filtered, pay fields and bank balance removed, salary
payments redacted). When a restricted login saves, the server merges: anything it can't see is kept exactly as it
is, billing can only add and correct its own entries, and pay details always come from the stored record — so a
staff phone can't read or wipe owner data even if someone tampers with the app. A role change, new password or
store change signs that login out everywhere. A phone used by a different login is cleared first, and lists a
login may not see are removed from the phone.

Also: **Activity** (owner / partner) lists who changed what and how many entries were added, changed or removed;
**daily server backups** of every store at 2:30 AM, kept 14 days, downloadable from Backup & restore (owner can
also "Back up now"); the old PIN-header import route is switched off (set `ALLOW_LEGACY_PUSH = "1"` to re-enable);
bill photos open only for their own store.

### Menu, recipes & SOPs (Step 5)
Records → **Menu**. Each dish has a **photo**, a **Hindi / local name**, a **veg / egg / non-veg** mark, category,
price, portion, prep time, holding / shelf life, notes, a **recipe** (ingredients per plate, costed from your
purchase prices; a new ingredient can be added right from the dish) and an **SOP** — numbered steps, each with an
optional photo, reorderable.
- The menu is a grid of photo tiles by category with a readiness bar ("12 of 20 dishes ready" = photo, price,
  recipe and SOP set) and what each dish still needs.
- Tap a dish for its **recipe card**: ingredients scaled to any number of plates, the SOP with photos, Edit, a
  one-dish PDF and WhatsApp share.
- **Recipe & SOP book (PDF)**: cover with the dish list, then one page per dish (photo, ingredients for 1 and 10
  plates, numbered steps with step photos); all dishes or one category; costs optional (off for the kitchen copy).
- **Today's prep list**: expected plates per dish (same weekday, last 4 weeks of dishes logged; else last 14 days),
  editable, with the ingredients and "prepare in advance" items needed vs stock and shortfalls; WhatsApp share.
- **Menu analysis** (owner / partner / manager): stars, plowhorses, puzzles and dogs from the last 30 days with
  what to do about each, and a **price check** of dishes above the target food cost (default 30%, editable) with a
  suggested price. The menu warns when dishes cost more than target + 5%.
- Chefs edit dishes but don't see costs or margins; billing can only view.
- Fixed: typing in the dish form no longer redraws it (which lost the next field being typed into).
- **🖨️ Printable menu (PDF)**: a ready-to-print menu of the dishes on the menu — title, a line for address /
  timings, phone for orders, a note at the bottom; **A4** (2 columns, wall / counter) or **A5** (table card); three
  looks (classic cream, dark & gold, clean white); Hindi names and veg / egg / non-veg marks optional; pick which
  sections; optional UPI QR. Half / Full portions share one line ("Hakka Noodles … ₹79 / 129"), and a section that
  runs onto the next column or page is labelled "(contd.)". Pages are drawn on the phone so Hindi prints correctly.
  Preview first, then Make PDF to share or save. Choices are remembered on that phone.
- **Paste a list of dishes** (add or update many at once): one dish per line as
  `Category | Name | Price | veg/egg/nonveg | Hindi name` (only Name and Price are required). A preview shows new
  dishes and price changes before importing. A dish whose name already exists gets the new price, category and mark
  but keeps its recipe, SOP and photo. Optionally hide every dish not in the list.
- **On the menu** switch per dish: hidden dishes move to an "Off the menu" group, keep their recipe and history,
  and stop appearing in quick tally and the dish count form.

### Smart stock, daily checks & asset checks (Step 3)
**Stock** (Records → Stock) now learns from what is actually used: dishes sold (counter bills and tallies) through
their recipes, cooking batches, cafe use and wastage over the last 14 days.
- Each item shows **use per day** and **days left**. An item is **running low** when it is finished, at or below its
  minimum, or won't last until a new delivery arrives (set "Days for a delivery to arrive" per item; default 1).
- **🛒 Order list**: everything running low, grouped by usual vendor, with a suggested quantity (enough for the
  delivery time plus 2 days of normal use; the number of days can be changed). Edit any quantity and send each
  vendor their list on WhatsApp.
- **🧠 Set minimums from what we actually use**: one tap sets each item's minimum to its daily use × (delivery
  days + 1).
- **Use first or throw**: cooked / prepared items past their "Keeps for (days)" since the last cooking batch.
- **Dishes you may not be able to make**: dishes whose recipe is short of an item, with **Mark sold out** — the
  Counter then shows the dish greyed out as "Sold out" for the rest of the day.

**Daily checks** (Records → Assets, and **✅ Checks** on the Counter): Opening, Closing and a Weekly deep clean, each
line ticked ✔ or ✖ with a note for what's wrong (e.g. "fridge at 9°C"). Owner / manager can edit the lists, the
"done by" time after which a list shows as missed, and how often weekly lists are due. Who did each check and when
is saved. Missed-check warnings start only after the first checklist is filed, so a cafe not using them isn't nagged.

**Asset checks**: set "Check its condition every N days" on an asset (e.g. 1 for the fridge); anyone on shift taps
**Check condition now** → Working / Needs repair / Broken, with a note. The asset list shows each one's condition.

**Needs attention today** (top of the Dashboard — or the Kitchen tab for the chef — with a red number on that tab): items running low, cooked
items to use first, missed or failed checks, broken / needs-repair equipment, checks and services due. Tap a line
to go there. Chef and billing logins can file checks but can't change or delete anyone else's; they only see the
last two days of checks.

### Purchase orders with approvals (Step 4)
Records → **Orders**. The order of hands: **staff request → manager approves (up to a limit) or sends it to the
owner → owner / partner approves → sent to the vendor → goods received and checked**.
- **+ New purchase request** (chef, counter, manager, owner): vendor, needed-by date and items. Picking a known item
  fills in its usual vendor and the last price paid (kg / g and litre / ml converted). **From low stock** and the
  Stock order list make a ready request per vendor with the suggested quantities.
- **Manager** approves requests up to the **manager approval limit** (default ₹2,000, set by the owner); bigger
  ones show only **Send to owner**. Managers can also reject (with a reason) or edit.
- **Owner / partners** approve anything; their own requests are approved when saved.
- **Approved** orders: **📲 Send to vendor on WhatsApp** (a numbered purchase order, e.g. PO-0007) or **Ordered by
  phone**.
- **📦 Goods arrived**: enter what actually came and the price on the bill. Short deliveries and prices more than 5%
  above the expected price are flagged. Choose pay later (vendor udhaar), cafe cash or cafe UPI. Each item becomes a
  purchase (so stock and costs update), linked to the order. Part deliveries keep the order open for the rest, or
  tick "nothing more is coming" to close it.
- Every order keeps a **history** (who requested, approved, sent, received, when) and "Needs your action" shows what
  each person has to do; the Dashboard's Needs attention card and the Records badge include orders.
- **Enforced on the server**: the server stamps who approved; a manager can't approve above the limit or change the
  limit; chef / counter logins can only create requests, edit or cancel their own pending ones, and receive goods for
  ordered items — they can't approve, reject or delete.

### Kitchen: picture screen for staff
The **Kitchen** tab (first tab for chef logins; also for manager and counter) does stock and buying the same way
the Counter does billing: big pictures (the item's photo, or a food picture), Hindi words, few choices, Big & simple
mode and voice.
- **🛒 मँगवाना है · Need to buy**: item pictures with low ones first ("कम है" / "खत्म"). Tap one, pick a quantity
  with + / − or quick buttons (½, 1, 2, 5 kg …; the suggested amount is filled in for low items), then **भेजें Send**
  and pick today / tomorrow. One purchase request is made per usual vendor, with last prices, and goes into the
  approval flow (Records → Orders).
- **📦 माल आया · Goods arrived**: orders waiting for delivery as cards. For each item tap **✔ पूरा आया (all came)**
  or **− कम आया (less)** and step the quantity; the expected price is shown with "different price" only if the
  bill differs; pay later / cash / UPI as pictures. Saved as purchases exactly like the Orders screen.
- **🗑️ खराब हुआ · Wasted**: tap the item, the quantity and a picture reason (खराब, जल गया, गिर गया, वापस आया, बच
  गया).
- **📋 गिनती · Count stock**: tap each item and enter what is really there. Staff never see the expected figure
  (a blind count); the difference shows to the owner / manager in Stock → Wastage.
- **✅ जाँच · Daily checks** and "your requests" (waiting for manager / owner / approved).
- Each ingredient now has a **Hindi name** and a **photo** (Records → Stock → tap the item).
- Counter logins only see Need to buy (and checks), because they can't record purchases, wastage or counts.

### Smart management (Step 7)
On the Dashboard (owner, partners, manager):
- **📲 Daily summary — send on WhatsApp**: today or yesterday in a few lines — sales vs a usual day like it, bills,
  Cash / UPI / Udhaar, discounts, cancelled bills, purchases, expenses, cash count (matched / short / over and who was
  in charge), wastage, absent staff, low stock, overdue and due-soon bills, checks not done and problems, broken
  equipment, orders waiting for approval, watch-outs and tomorrow's forecast. Send or copy it.
- **Tomorrow**: expected sales (same weekday, last 4 weeks) and the top dishes with plates, with a prep list button.
- **Watch out** (also in Needs attention): cash short 3+ times (or ₹500+) in 30 days with the same person in charge;
  a vendor's latest price 10%+ above what you usually pay; one login giving discounts above 5% of their sales
  (₹300+ in 30 days); 3+ bills cancelled by one person in a week; wastage this week more than double the usual;
  yesterday's sales 30%+ below a usual day like it.
- A cancelled Counter bill now leaves a record (bill number, items, amount, who, when), shown in Today's bills and
  the daily summary.

### Customer accounts (Step 2)
Customers get their own page at **/c** (e.g. `https://<your-site>/c`), completely separate from the staff app.
- **Sign-in**: phone number + a 6-digit code from the cafe (free — no SMS). Open a customer (Records → Customers),
  tap **Give app access**, and send the code on WhatsApp. **New code** replaces it (signing out the old phone);
  **Remove access** turns it off. Owner, partners, manager and counter can give codes; chef can't. The server keeps
  only a scrambled copy of the code; wrong codes are limited to 10 per 15 minutes.
- **What they see**: their udhaar due (with a UPI QR / pay button for the exact amount when a cafe UPI ID is set),
  their payments, visits and loyalty tier with how many visits to the next reward, offers, their bills (with items for
  Counter bills) and the menu with photos, veg marks and "sold out today".
- **What they can't**: customers have their own cookie that the staff API never accepts, and the server builds their
  page itself from the stored data — they receive nothing else (no other customers, sales totals, money or settings).
  Only menu photos of dishes on the menu can be opened by a customer.
- Matching is by the customer's name on bills (as in Customers & loyalty) and payments recorded against them.

### Counter: picture billing (Step 6)
The **Counter** tab (first in the bottom bar; the billing login opens on it) is made for staff who read little.
- Big photo tiles (or a food picture when a dish has no photo), the Hindi name, the veg / non-veg mark and the
  price. **⭐ Most sold** (last 30 days) comes first, then one button per menu section. Tap a picture to add it;
  the small − takes one off.
- **Bill ➜** shows the order with large + / − buttons and the total in big numbers, and can say the total aloud in
  Hindi (🔊 turns the voice on / off on that phone).
- Pay with pictures: **💵 Cash** (tap the notes the customer gave, it shows the change to give back), **📱 UPI**
  (a QR code with the amount filled in; owner / manager set the UPI ID under ⚙️ UPI) or **📒 Udhaar** (tap a known
  name or type a new one).
- Each bill is saved as one sale with its items and bill number, and its plates go straight into the dish counts,
  so stock and the forecast need no separate tally. Quick tally and typed counts now only add plates sold
  without a bill.
- **🏷️ Discount** on the bill: saved offers (e.g. "Hospital staff 15%"), quick 5% / 10% / ₹10 / ₹20, or any
  amount / % with a reason. The sale is saved at the discounted amount, with the original bill, the discount and
  its reason kept on it. A billing login can give at most the limit set under **⚙️ UPI & discounts** (default 10%)
  by itself; saved offers, which only owner / manager can create, have no limit.
- **Today's bills**: every bill with time, items and payment, totals by Cash / UPI / Udhaar, share on WhatsApp, and
  **Cancel bill** (also removes its plates), and the total discount given that day. In Sales lists, a day's counter bills show as one row; tap it to see them.
- **🔠 Big & simple** (per phone, for older staff): larger text and buttons everywhere, two big tiles per row,
  only the Hindi name when there is one, fewer buttons.

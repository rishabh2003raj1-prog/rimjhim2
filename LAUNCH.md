# Launch guide

Two launch steps need your own accounts, so they can't be done from the app: your own web address, and a
Play Store listing. Everything else (privacy policy, terms, app icon and listing details, error monitoring,
tests) is already in place.

## 1. Your own web address (e.g. rimjhimcafe.in)

The app runs today at `https://rimjhim-cafe.rishabh2003raj.workers.dev`. A short address of your own is
easier to give customers (`rimjhimcafe.in/c`) and looks more trustworthy.

1. **Buy a domain.** Easiest: in Cloudflare, go to **Domain Registration → Register Domains** and search
   (a `.in` domain costs roughly ₹600–900 a year). If you buy it elsewhere (GoDaddy, Hostinger…), add it
   to Cloudflare with **Add a domain** and change the name servers where you bought it, as Cloudflare shows.
2. **Point it at the app:** Cloudflare → **Workers & Pages → rimjhim-cafe → Settings → Domains & Routes →
   Add → Custom domain**, type `rimjhimcafe.in` (and/or `app.rimjhimcafe.in`) and save. Cloudflare sets up
   the HTTPS certificate itself; it takes a few minutes.
3. **Check:** open the new address, sign in, and open `/c` (customer page), `/privacy.html` and
   `/terms.html`.
4. Everyone signs in again once on the new address (sign-ins belong to an address). The old
   `workers.dev` address keeps working.
5. Reprint the menu / QR cards with the new address if they show one.

## 2. Play Store listing (Android app)

The app is a web app (PWA) that phones can already install from Chrome (**⋮ → Add to Home screen /
Install app**). For a Play Store listing it is wrapped as a "Trusted Web Activity" — the same app inside an
Android shell.

1. **Google Play developer account:** <https://play.google.com/console> — a one-time US$25 fee and identity
   verification. Personal accounts must currently run a closed test with at least 12 testers for 14 days
   before the app can go public; a business (organisation) account with a D-U-N-S number skips that.
2. **Build the Android package:** go to <https://www.pwabuilder.com>, enter your app's address (your own
   domain from step 1 is best — the package is tied to it), choose **Android → Generate package**. Keep the
   download safe: it has the signing key (`signing.keystore` + passwords) needed for every future update.
3. **Digital Asset Links:** the download includes `assetlinks.json`. It must be served at
   `https://<your-domain>/.well-known/assetlinks.json` so the app opens without a browser bar. Send the file
   and it will be added to the app (`public/.well-known/assetlinks.json`) and checked.
4. **Store listing** (Play Console → your app):
   - Name: *Rimjhim Cafe*; short description: *Cafe billing, kitchen orders, stock and accounts.*
   - Category: Business. Target audience: 18+. Contains ads: No.
   - Screenshots: 2–8 phone screenshots (Counter, Kitchen, Dashboard, Menu).
   - **Privacy policy URL:** `https://<your-domain>/privacy.html`
   - **Data safety form:** collects name, phone number, address (delivery), purchase history and financial
     records (udhaar, staff pay); used for app functionality and account management; not shared with third
     parties; data is encrypted in transit; users can ask for deletion (via the cafe).
   - Content rating questionnaire: a business / utility app with no objectionable content.
   - App access: give reviewers a test login (a "billing" role login with no real data is enough).
5. Upload the `.aab` file from PWABuilder to a closed testing track, add testers, then promote to
   production after review.

If the listing is mainly for staff phones, you can skip the Play Store: staff install it from Chrome
(Add to Home screen) and it behaves like an app, including offline use.

## 3. Before the first busy day

- Finish the **🚀 Get your cafe ready** checklist on the Dashboard (menu, photos, recipes, stock, staff,
  logins with roles, tables, UPI, opening cash, bills, PIN, printed menu).
- Change the owner PIN (`APP_PIN` secret in Cloudflare) from the one used during setup.
- Check **Activity → ⚠️ App errors on phones** after the first few days.
- The **Tests** workflow in GitHub runs all test suites on work branches; check it before merging to main.

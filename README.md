# Benjoji Business Suite

Benjoji Business Suite is a local-first business management platform for retailers, supermarkets, wholesalers, salons, service counters, and multi-branch businesses that need one workspace for checkout, inventory, debt tracking, reporting, account control, and backup recovery.

## What It Includes

- Branded landing page, intro, login, and business workspace setup
- Desktop-friendly POS flow with basket-first checkout and popup payment finalization
- Split payments across cash, M-Pesa, Airtel Money, card, bank transfer, Buy Goods, Paybill, and gift card
- Inventory management with product creation, stock-in, stock-out, low-stock visibility, and stock records
- Invoice desk, receipts, debt tracking, debt repayment, and payment ledger
- Daily, weekly, monthly, and annual reports with calendar drill-down
- Owner control center for business branding, payment routing, receipt rules, security policy, compliance notes, backups, and restore
- Local backup snapshots plus restore workflow for recovery

## Stack

- Node.js built-in HTTP server
- Local SQLite database via `node:sqlite`
- Vanilla JavaScript frontend
- Local-first storage under the user app-data directory

## Local Data

The suite uses this persistent local database by default on Windows:

```text
C:\Users\<YourUser>\AppData\Local\BENJOJI Payment Handling\benjoji.sqlite
```

Backups are stored beside it in:

```text
C:\Users\<YourUser>\AppData\Local\BENJOJI Payment Handling\backups
```

## Run

```powershell
npm start
```

or:

```powershell
.\start-app.ps1
```

Then open:

```text
http://127.0.0.1:3000
```

## Verification

Run the non-destructive smoke test against an isolated test database:

```powershell
npm run smoke
```

Run the full local verification bundle:

```powershell
npm run verify
```

## Project Structure

```text
lib/         backend business logic, auth, control, storage
public/      landing page, app shell, POS, reports, styling, assets
scripts/     local verification scripts
server.js    HTTP server and API routes
```

## Operational Notes

- Payment provider approvals are currently simulated workflow approvals inside the suite. Live provider integrations still need real business credentials and provider APIs.
- Receipt printing is browser-based today. Dedicated thermal/POS printer integration can be added later per client hardware.
- The legacy Java console MVP remains in `src/` as an earlier foundation and is not the primary runtime for the current suite.

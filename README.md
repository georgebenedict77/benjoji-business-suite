# Benjoji Business Suite

Benjoji Business Suite is a local-first business management platform for retailers, supermarkets, wholesalers, salons, service counters, and multi-branch businesses. Each business gets its own independent workspace, database, owner account, branding, payment routing, backups, and staff accounts.

## What It Includes

- Branded landing page, intro, login, and independent business workspace setup
- Desktop-friendly POS flow with basket-first checkout and popup payment finalization
- Split payments across cash, M-Pesa, Airtel Money, card, bank transfer, Buy Goods, Paybill, and gift card
- Inventory management with product creation, stock-in, stock-out, low-stock visibility, and stock records
- Invoice desk, receipts, debt tracking, debt repayment, and payment ledger
- Daily, weekly, monthly, and annual reports with calendar drill-down
- Owner control center for business branding, payment routing, receipt rules, security policy, compliance notes, backups, and restore
- Local backup snapshots plus restore workflow for recovery
- Workspace isolation so one client business never depends on another client business account

## Stack

- Node.js built-in HTTP server
- Local SQLite database via `node:sqlite`
- Vanilla JavaScript frontend
- Local-first storage under the user app-data directory

## Local Data

The suite uses a persistent local app-data directory on Windows. New installs prefer:

```text
C:\Users\<YourUser>\AppData\Local\Benjoji Business Suite\
```

If an older installation already exists under the previous folder name, the suite keeps using that legacy location automatically so existing data is not lost.

Inside the active data directory, each business workspace has its own isolated database and backups:

```text
workspaces\<workspace-id>\benjoji.sqlite
workspaces\<workspace-id>\backups\
```

## Account Model

- Benjoji Business Suite is the system brand, not a locked business workspace.
- The public landing page and intro use the suite identity.
- No client company account is bundled inside the product by default.
- Each new business creates its own independent workspace with its own owner login, branding, payment routing, backups, and staff users.
- Additional staff accounts are created by the owner inside that specific workspace only.

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

Run the HTTP workspace smoke test against a temporary isolated server:

```powershell
npm run smoke:http
```

Run the full local verification bundle:

```powershell
npm run verify
```

## Project Structure

```text
lib/         backend business logic, workspace auth, workspace control, storage
public/      landing page, app shell, POS, reports, styling, assets
scripts/     local verification scripts
server.js    HTTP server and API routes
```

## Operational Notes

- Payment provider approvals are currently simulated workflow approvals inside the suite. Live provider integrations still need real business credentials and provider APIs.
- Receipt printing is browser-based today. Dedicated thermal/POS printer integration can be added later per client hardware.
- The legacy Java console MVP remains in `src/` as an earlier foundation and is not the primary runtime for the current suite.

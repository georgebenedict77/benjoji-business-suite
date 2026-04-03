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

## Public Site

The GitHub Pages landing site for the suite is published at:

```text
https://georgebenedict77.github.io/benjoji-business-suite/
```

## Full App Deployment

The repository is prepared for real operation beyond the public landing site too.

- Docker runtime: [Dockerfile](./Dockerfile)
- deployment guide: [DEPLOYMENT.md](./DEPLOYMENT.md)

## Installing The App

### Windows

- Run the full suite locally with `npm start` or `.\start-app.ps1`
- Open `http://127.0.0.1:3000` in Microsoft Edge or Google Chrome
- Use the browser install option or the in-app `Install App` button when it appears

### Windows Portable Download

- The repository now includes a portable Windows packaging script: `npm run build:windows-portable`
- The output ZIP is created under `dist\`
- GitHub Actions can publish the same ZIP as a release asset when a version tag such as `v1.0.0` is pushed
- Releases page: `https://github.com/georgebenedict77/benjoji-business-suite/releases`

### Android

- The full operational app should be deployed to a secure public URL first
- Open the hosted app in Chrome
- Use `Install App` or `Add to Home screen`

### iPhone

- The full operational app should be opened from its hosted public URL in Safari
- Tap `Share`
- Choose `Add to Home Screen`

GitHub Pages currently hosts the public landing site only. The full business runtime still needs Node hosting for real checkout, stock, reporting, and workspace operations.

## Local Network Preview

To preview the suite from another device on the same Wi-Fi network:

```powershell
.\start-lan.ps1
```

This exposes the app on your local network and prints the phone/tablet URL. It is useful for preview and testing, but a proper public HTTPS deployment is still the right path for full mobile installability.

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

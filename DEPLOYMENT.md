# Deployment Guide

Benjoji Business Suite can be deployed as a full hosted app for browser, Windows install, and phone access.

## Recommended: Render

The repository includes [render.yaml](./render.yaml) so the suite can be deployed as a Node web service with a persistent disk for SQLite workspace data.

### What the Render setup does

- runs the Node server as a web service
- mounts a persistent disk at `/var/data/benjoji`
- stores all workspace databases and backups on that disk
- enables production-safe host binding and secure cookies
- exposes the built-in health check at `/api/health`

### Deploy steps

1. Create a Render account.
2. Choose `New +` then `Blueprint`.
3. Connect the GitHub repository: `georgebenedict77/benjoji-business-suite`
4. Render will read `render.yaml` automatically.
5. Deploy the service.
6. After deployment, open the public service URL and create workspaces normally.

### Why a persistent disk matters

The suite uses SQLite and local backup snapshots. Without a persistent disk, business data would be lost on redeploy or instance replacement.

## Docker

The repository also includes a [Dockerfile](./Dockerfile) for container-based hosting.

### Example

```powershell
docker build -t benjoji-business-suite .
docker run -p 3000:3000 -e BENJOJI_DATA_DIR=/app/data -v benjoji-data:/app/data benjoji-business-suite
```

## Windows Local Install

1. Run the suite locally with `npm start` or `.\start-app.ps1`
2. Open `http://127.0.0.1:3000`
3. Use the browser install option or the in-app `Install App` button

## Phone Access

### Best option

Deploy the full app to a secure public host first. Then:

- Android: open the hosted URL in Chrome and use `Install App` or `Add to Home screen`
- iPhone: open the hosted URL in Safari, tap `Share`, then `Add to Home Screen`

### Local network preview

Use [start-lan.ps1](./start-lan.ps1) to expose the suite on your local Wi-Fi so another device can open it in a browser. This is useful for preview, but a proper public HTTPS deployment is still the right path for full phone installability.

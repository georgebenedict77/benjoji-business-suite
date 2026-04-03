# Deployment Guide

Benjoji Business Suite is best approached in three layers:

1. public product site
2. Windows portable app
3. optional private hosting later

## Public Product Site

The public product site is already live on GitHub Pages and is ideal for:

- marketing the suite
- sharing the product publicly
- directing people to downloads and setup guides

## Windows Portable App

The fastest practical rollout today is the Windows portable package published in GitHub Releases.

### What it gives you

- the full suite code
- a bundled Node runtime
- local data saved under the Windows app-data folder
- no paid hosting required
- a clean download path for clients

### Best use cases

- owner-operated businesses
- in-shop desktop usage
- demos for potential clients
- local-first rollout before cloud hosting

### Release assets

Download from:

```text
https://github.com/georgebenedict77/benjoji-business-suite/releases
```

## Docker

The repository also includes a [Dockerfile](./Dockerfile) for container-based hosting.

### Example

```powershell
docker build -t benjoji-business-suite .
docker run -p 3000:3000 -e BENJOJI_DATA_DIR=/app/data -v benjoji-data:/app/data benjoji-business-suite
```

Docker is useful if you later decide to run the suite on a VPS, office server, or private cloud setup.

## Windows Local Install

1. Run the suite locally with `npm start` or `.\start-app.ps1`
2. Open `http://127.0.0.1:3000`
3. Use the browser install option or the in-app `Install App` button

## Phone Access

### Best option

Run the suite from its local desktop setup or a private hosted setup first. Then:

- Android: open the hosted URL in Chrome and use `Install App` or `Add to Home screen`
- iPhone: open the hosted URL in Safari, tap `Share`, then `Add to Home Screen`

### Local network preview

Use [start-lan.ps1](./start-lan.ps1) to expose the suite on your local Wi-Fi so another device can open it in a browser. This is useful for preview, but a proper public HTTPS deployment is still the right path for full phone installability.

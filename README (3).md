# Kill Switch System

Remotely enable/disable client websites (WordPress or Shopify) from a desktop
app on your machine, with one click.

## How it fits together

```
[Electron App on your PC]  --admin token-->  [Node.js Status Server]  <--polls status-->  [Client Site: WP plugin / Shopify snippet]
```

1. **server/** — a small Node/Express API that stores each site's on/off status.
   You run this on your own hosting/VPS (or even locally with a tunnel, though a
   small VPS is more reliable).
2. **wordpress-plugin/** — a must-use WordPress plugin you install on each
   WordPress client site. It polls the server and shows a maintenance page
   when disabled.
3. **shopify/** — a theme snippet for Shopify stores. It polls the server and
   shows a blocking overlay when disabled (see its README for the platform
   limitation vs. WordPress).
4. **electron-app/** — the desktop app you open in VS Code / run locally.
   It's your "remote control": add sites, and flip each one on/off with a button.

## Setup order

### 1. Deploy the server
```bash
cd server
cp .env.example .env
# edit .env and set a strong ADMIN_TOKEN
npm install
npm start
```
Deploy this to any Node-friendly host (a small VPS, Railway, Render, etc.) so
it's reachable over HTTPS from both your client sites and your Electron app.
Put it behind HTTPS (e.g. via Caddy/Nginx + Let's Encrypt, or your host's
built-in TLS) since the admin token travels in the Authorization header.

### 2. Run the Electron control panel
```bash
cd electron-app
npm install
npm start
```
On first launch, click the ⚙ icon and enter your server's URL and the
`ADMIN_TOKEN` you set in step 1.

### 3. Add each client site from the Electron app
Fill in name, URL, and platform, click "Add site". Note the `id`/`key` this
generates for that site (visible via the server's `/api/admin/sites` endpoint
or your own logs) — you need both for step 4.

### 4. Wire up the client site
- WordPress → follow `wordpress-plugin/README.md`
- Shopify → follow `shopify/README.md`

### 5. Test
Toggle a site off from the Electron panel and confirm it goes into maintenance
mode within about a minute; toggle back on and confirm it recovers.

## A note on using this responsibly
This is effectively a licensing/enforcement mechanism for sites you built and
maintain for clients (e.g. to enforce a hosting/maintenance contract). To keep
things clean and avoid disputes:
- Disclose this capability in your contract/terms with the client up front.
- Keep the admin token private — anyone with it can disable any site you've registered.
- Consider logging toggle events (who/when) if you have multiple team members using the panel.

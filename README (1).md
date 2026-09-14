# Static HTML/CSS/JS Kill Switch — Setup

For plain sites with no backend (no WordPress, no PHP). This will NOT work
by pasting into a WordPress site — use `wordpress-plugin/` for those instead.

## 1. Register the site on your server
```bash
curl -X POST https://killer-in8z.onrender.com/api/admin/sites \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Client Static Site","url":"https://clientsite.com","platform":"static"}'
```
Save the returned `id` and `key`. (Or just add the site from the Electron app.)

## 2. Add the script to the site
Two options:

**Option A — separate file (recommended):**
1. Copy `kill-switch.js` into the site's root folder (next to `index.html`).
2. Edit the 3 config values at the top of the file (`KS_SITE_ID`, `KS_SITE_KEY`; `KS_API_URL` is already set to your server).
3. Add this line to every HTML page, right before `</body>`:
   ```html
   <script src="/kill-switch.js"></script>
   ```
   If the site has a shared footer/include file, add it there once instead of
   editing every page by hand.

**Option B — inline (if you can't add a separate file):**
Paste the entire contents of `kill-switch.js` inside a `<script>...</script>`
tag before `</body>` on every page.

## 3. Test
- Toggle the site "off" in the Electron app.
- Reload the site — the overlay should appear within about a minute.
- Toggle back "on" and confirm it clears.

## Limitation (same as Shopify)
This blocks visitors client-side; it does not stop your web host from
serving the files. If you want a true server-level block for a specific
static site, tell me what it's hosted on (e.g. plain Apache/Nginx, Netlify,
Vercel, cPanel) and I can add a server-config-based version for that host.

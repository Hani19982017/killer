# Shopify Kill Switch — Setup

## Important
Shopify is a closed hosted platform, so this is a **client-side (front-end) block**,
not a true server-level shutdown. It shows a full-screen overlay to every visitor
and stops them interacting with the store. It's effective for "the customer can't
browse or buy," but it is not equivalent to the WordPress version, which stops the
server from rendering the page at all.

If you need a true platform-level lock, the options are:
- Manually toggle **Online Store > Preferences > Password protection** from Shopify Admin.
- Build a private custom app with Admin API access to automate that toggle — ask me if you want this built too.

## 1. Register the site on your server
```bash
curl -X POST https://your-server.example.com/api/admin/sites \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Client Shop","url":"https://clientshop.myshopify.com","platform":"shopify"}'
```
Save the returned `id` and `key`.

## 2. Add the snippet to the theme
1. Shopify Admin → Online Store → Themes → **Edit code**.
2. Open `layout/theme.liquid`.
3. Paste the contents of `kill-switch.liquid` right before `</body>`.
4. Replace `KS_API_URL`, `KS_SITE_ID`, and `KS_SITE_KEY` with your real values.
5. Save.

## 3. Test
- Toggle the site "off" in your Electron app.
- Reload the storefront — the overlay should appear within ~1 minute.
- Toggle back "on" and confirm it clears.

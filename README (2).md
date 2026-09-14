# WordPress Kill Switch — Setup

## 1. Add the site on your server first
Use the Electron app (or curl) to register the site — this gives you a `siteId` and `key`:

```bash
curl -X POST https://your-server.example.com/api/admin/sites \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Client XYZ","url":"https://clientsite.com","platform":"wordpress"}'
```

The response includes `id` and `key`. Save both.

## 2. Install the plugin as a Must-Use plugin
Must-use plugins (`mu-plugins`) load automatically and don't show up in the normal
Plugins list, so the client can't accidentally (or deliberately) deactivate it.

1. Connect to the site via FTP/SFTP or hosting file manager.
2. Create the folder if it doesn't exist: `wp-content/mu-plugins/`
3. Upload `kill-switch.php` into that folder.

## 3. Configure the 3 constants at the top of the file
```php
define('KS_API_URL', 'https://your-server.example.com/api/status');
define('KS_SITE_ID', 'the-id-you-got-in-step-1');
define('KS_SITE_KEY', 'the-key-you-got-in-step-1');
```

## 4. Test it
- Toggle the site to "off" from your Electron app.
- Wait up to 60 seconds (cache TTL) or clear the `ks_status_cache` transient.
- Visit the site — you should see the maintenance page with a 503 status.
- Toggle back "on" and confirm the site returns.

## Notes
- `/wp-admin`, REST requests, and cron are never blocked, so you always retain access.
- If your server goes down, the site **fails open** (stays online) by default —
  change `KS_FAIL_OPEN` to `false` if you'd rather it fail closed.
- Because the check is cached for 60 seconds, disabling a site isn't instant —
  it takes effect within that window. Lower `KS_CACHE_TTL` for faster response
  at the cost of more requests to your server.

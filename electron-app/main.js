const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 760,
    resizable: true,
    title: 'Kill Switch Panel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');
  return win;
}

// ---------------- File templates ----------------
// Same content as the ready-made files in wordpress-plugin/, shopify/, and
// static-site/, but with the site's real id/key/server URL already filled in.

function wordpressTemplate({ serverUrl, id, key }) {
  return `<?php
/**
 * Plugin Name: Remote Kill Switch
 * Description: Checks a central status API and takes the site offline (maintenance screen) when disabled remotely.
 * Version: 1.0
 * Author: mtdm
 *
 * INSTALL: Upload this file to wp-content/mu-plugins/kill-switch.php
 * (mu-plugins load automatically and can't be deactivated from the WP admin plugin list.)
 */

define('KS_API_URL', '${serverUrl}/api/status');
define('KS_SITE_ID', '${id}');
define('KS_SITE_KEY', '${key}');

// How often to re-check the API (seconds). Cached in a transient so we don't
// call the API on every page load.
define('KS_CACHE_TTL', 60);

// If the API is unreachable: true = keep site ON (fail-open, recommended), false = take it OFF.
define('KS_FAIL_OPEN', true);

add_action('init', function () {
    if (is_admin() || (defined('DOING_CRON') && DOING_CRON) || (defined('REST_REQUEST') && REST_REQUEST)) {
        return;
    }

    $status = ks_get_status();

    if ($status === 'off') {
        ks_render_maintenance_page();
        exit;
    }
}, 0);

function ks_get_status() {
    $cache_key = 'ks_status_cache';
    $cached = get_transient($cache_key);
    if ($cached !== false) {
        return $cached;
    }

    $url = KS_API_URL . '/' . rawurlencode(KS_SITE_ID) . '?key=' . rawurlencode(KS_SITE_KEY);

    $response = wp_remote_get($url, ['timeout' => 5]);

    if (is_wp_error($response)) {
        return KS_FAIL_OPEN ? 'on' : 'off';
    }

    $code = wp_remote_retrieve_response_code($response);
    $body = json_decode(wp_remote_retrieve_body($response), true);

    if ($code !== 200 || !is_array($body) || empty($body['status'])) {
        return KS_FAIL_OPEN ? 'on' : 'off';
    }

    $status = ($body['status'] === 'off') ? 'off' : 'on';

    if (!empty($body['message'])) {
        set_transient('ks_status_message', sanitize_text_field($body['message']), KS_CACHE_TTL);
    }

    set_transient($cache_key, $status, KS_CACHE_TTL);

    return $status;
}

function ks_render_maintenance_page() {
    $message = get_transient('ks_status_message');
    if (!$message) {
        $message = 'This site is temporarily unavailable. Please check back soon.';
    }

    header('HTTP/1.1 503 Service Temporarily Unavailable');
    header('Retry-After: 3600');
    header('Content-Type: text/html; charset=utf-8');

    echo '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">';
    echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<title>Site Unavailable</title>';
    echo '<style>
        body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0f1115;color:#eee;
             display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px;box-sizing:border-box;}
        .box{max-width:480px;}
        h1{font-size:22px;margin-bottom:10px;}
        p{color:#aaa;line-height:1.5;}
    </style></head><body>';
    echo '<div class="box"><h1>We\\'ll be right back</h1><p>' . esc_html($message) . '</p></div>';

    // Auto-recover: if a visitor is sitting on this maintenance page when the
    // site gets re-enabled, reload automatically — no manual refresh needed.
    $status_url = KS_API_URL . '/' . rawurlencode(KS_SITE_ID) . '?key=' . rawurlencode(KS_SITE_KEY);
    echo '<script>
    (function () {
      var KS_STATUS_URL = ' . json_encode($status_url) . ';
      var KS_CHECK_INTERVAL_SECONDS = 5;
      function check() {
        fetch(KS_STATUS_URL, { cache: "no-store" })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data && data.status === "on") {
              location.reload();
            }
          })
          .catch(function () {});
      }
      setInterval(check, KS_CHECK_INTERVAL_SECONDS * 1000);
    })();
    </script>';

    echo '</body></html>';
}
`;
}

function jsOverlaySnippet({ serverUrl, id, key }, headerComment) {
  return `${headerComment}
(function () {
  var KS_API_URL = '${serverUrl}/api/status';
  var KS_SITE_ID = '${id}';
  var KS_SITE_KEY = '${key}';
  var KS_CHECK_INTERVAL_SECONDS = 5;

  function showOverlay(message) {
    if (document.getElementById('ks-overlay')) return;

    var overlay = document.createElement('div');
    overlay.id = 'ks-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'background:#0f1115', 'color:#eee',
      'display:flex', 'align-items:center', 'justify-content:center',
      'text-align:center', 'padding:20px',
      'font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif'
    ].join(';');

    overlay.innerHTML =
      '<div style="max-width:480px">' +
        '<h1 style="font-size:22px;margin-bottom:10px;">We\\'ll be right back</h1>' +
        '<p style="color:#aaa;line-height:1.5;">' + (message || 'This site is temporarily unavailable.') + '</p>' +
      '</div>';

    document.documentElement.style.overflow = 'hidden';
    (document.body || document.documentElement).appendChild(overlay);
  }

  function removeOverlay() {
    var el = document.getElementById('ks-overlay');
    if (el) el.remove();
    document.documentElement.style.overflow = '';
  }

  function checkStatus() {
    var url = KS_API_URL + '/' + encodeURIComponent(KS_SITE_ID) + '?key=' + encodeURIComponent(KS_SITE_KEY);

    fetch(url, { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.status === 'off') {
          showOverlay(data.message);
          sessionStorage.setItem('ks_status', 'off');
        } else {
          removeOverlay();
          sessionStorage.setItem('ks_status', 'on');
        }
      })
      .catch(function () {
        removeOverlay();
      });
  }

  if (sessionStorage.getItem('ks_status') === 'off') {
    showOverlay();
  }

  checkStatus();
  setInterval(checkStatus, KS_CHECK_INTERVAL_SECONDS * 1000);
})();
`;
}

function shopifyTemplate(vars) {
  const comment = `{% comment %}
  Remote Kill Switch — Shopify
  Paste this whole snippet right before </body> in theme.liquid
  (Online Store > Themes > Edit code > layout/theme.liquid)

  LIMITATION: this blocks visitors client-side with an overlay; it does not
  take the store offline at the platform level. For that, use Shopify Admin
  password protection or a custom app with Admin API access.
{% endcomment %}

<script>`;
  return comment + '\n' + jsOverlaySnippet(vars, '').trimStart() + '</script>\n';
}

function staticTemplate(vars) {
  const comment = `/**
 * Remote Kill Switch — Static HTML/CSS/JS site
 * Include on every page, right before </body>:
 *   <script src="/kill-switch.js"></script>
 *
 * LIMITATION: this blocks visitors client-side; it does not stop your web
 * host from serving the files.
 */`;
  return jsOverlaySnippet(vars, comment);
}

function buildFile(platform, vars) {
  switch (platform) {
    case 'wordpress':
      return { filename: 'kill-switch.php', content: wordpressTemplate(vars) };
    case 'shopify':
      return { filename: 'kill-switch.liquid', content: shopifyTemplate(vars) };
    case 'static':
    default:
      return { filename: 'kill-switch.js', content: staticTemplate(vars) };
  }
}

ipcMain.handle('generate-file', async (event, { platform, serverUrl, id, key, siteName }) => {
  const { filename, content } = buildFile(platform, { serverUrl, id, key });

  const safeName = (siteName || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const suggestedName = `${base}-${safeName}${ext}`;

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save kill switch file',
    defaultPath: path.join(app.getPath('downloads'), suggestedName),
    filters: [{ name: 'File', extensions: [ext.replace('.', '')] }],
  });

  if (canceled || !filePath) {
    return { success: false, canceled: true };
  }

  fs.writeFileSync(filePath, content, 'utf8');
  return { success: true, filePath };
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

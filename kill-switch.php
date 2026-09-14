<?php
/**
 * Plugin Name: Remote Kill Switch
 * Description: Checks a central status API and takes the site offline (maintenance screen) when disabled remotely.
 * Version: 1.0
 * Author: mtdm
 *
 * INSTALL:
 *   Upload this file to: wp-content/mu-plugins/kill-switch.php
 *   (mu-plugins load automatically and the client cannot disable them from the WP admin plugin list,
 *    unlike a normal plugin which they could just deactivate.)
 *
 * CONFIGURE the 3 constants below for each client site.
 */

// ---------------- CONFIG: change these per site ----------------
define('KS_API_URL', 'https://your-server.example.com/api/status'); // your server's base URL (no trailing slash)
define('KS_SITE_ID', 'REPLACE_WITH_SITE_ID');   // the "id" the server generated for this site
define('KS_SITE_KEY', 'REPLACE_WITH_SITE_KEY'); // the "key" the server generated for this site
// -----------------------------------------------------------------

// How often to re-check the API (seconds). Result is cached in a transient
// so we do NOT call the API on every single page load.
define('KS_CACHE_TTL', 60);

// If the API is unreachable, should the site stay ON (fail-open, recommended)
// or go OFF (fail-closed)? Fail-open avoids accidental downtime from a server hiccup.
define('KS_FAIL_OPEN', true);

add_action('init', function () {
    // Don't block wp-admin/login or REST/cron requests — you always want a way back in.
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

    $response = wp_remote_get($url, [
        'timeout' => 5,
    ]);

    if (is_wp_error($response)) {
        return KS_FAIL_OPEN ? 'on' : 'off';
    }

    $code = wp_remote_retrieve_response_code($response);
    $body = json_decode(wp_remote_retrieve_body($response), true);

    if ($code !== 200 || !is_array($body) || empty($body['status'])) {
        return KS_FAIL_OPEN ? 'on' : 'off';
    }

    $status = ($body['status'] === 'off') ? 'off' : 'on';

    // Cache the maintenance message too, so we can show it without a second request
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
    echo '<div class="box"><h1>We\'ll be right back</h1><p>' . esc_html($message) . '</p></div>';

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

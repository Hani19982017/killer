/**
 * Remote Kill Switch — Static HTML/CSS/JS sites
 * -----------------------------------------------
 * Include this file on EVERY page of the site you want to control, right
 * before the closing </body> tag:
 *
 *   <script src="/kill-switch.js"></script>
 *
 * (Or paste its contents inline in a <script> tag if you prefer one less file.)
 *
 * Like the Shopify version, this is a CLIENT-SIDE block: it shows a
 * full-screen "unavailable" overlay to visitors when the site is switched
 * off. It does not stop your web host from serving the files — for a true
 * server-level block you'd need control over the host/server config
 * (e.g. an .htaccess rule, an Nginx config, or a small server-side script),
 * which is possible if you tell me what hosting each static site uses.
 */

(function () {
  // ---------------- CONFIG: change these per site ----------------
  var KS_API_URL = 'https://killer-in8z.onrender.com/api/status';
  var KS_SITE_ID = 'REPLACE_WITH_SITE_ID';
  var KS_SITE_KEY = 'REPLACE_WITH_SITE_KEY';
  var KS_CHECK_INTERVAL_MINUTES = 1;
  // ------------------------------------------------------------------

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
        '<h1 style="font-size:22px;margin-bottom:10px;">We\'ll be right back</h1>' +
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
        // Network/API issue: fail open (don't block real visitors over a hiccup)
        removeOverlay();
      });
  }

  // Show overlay immediately from cache so there's no flash of content
  // while the fresh check is in flight.
  if (sessionStorage.getItem('ks_status') === 'off') {
    showOverlay();
  }

  checkStatus();
  setInterval(checkStatus, KS_CHECK_INTERVAL_MINUTES * 60 * 1000);
})();

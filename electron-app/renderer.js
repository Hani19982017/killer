const settingsPanel = document.getElementById('settingsPanel');
const serverUrlInput = document.getElementById('serverUrl');
const adminTokenInput = document.getElementById('adminToken');
const sitesList = document.getElementById('sitesList');
const toast = document.getElementById('toast');

function getSettings() {
  return {
    serverUrl: (localStorage.getItem('ks_server_url') || '').replace(/\/$/, ''),
    adminToken: localStorage.getItem('ks_admin_token') || '',
  };
}

function saveSettings(serverUrl, adminToken) {
  localStorage.setItem('ks_server_url', serverUrl);
  localStorage.setItem('ks_admin_token', adminToken);
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2200);
}

async function api(pathname, options = {}) {
  const { serverUrl, adminToken } = getSettings();
  if (!serverUrl || !adminToken) {
    showToast('Set your server URL and admin token first (⚙)');
    settingsPanel.classList.remove('hidden');
    throw new Error('missing settings');
  }

  const res = await fetch(serverUrl + pathname, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + adminToken,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || ('Request failed: ' + res.status));
  }

  if (res.status === 204) return null;
  return res.json();
}

let currentSites = [];

function renderSites(sites) {
  currentSites = sites;
  sitesList.innerHTML = '';

  if (!sites.length) {
    sitesList.innerHTML = '<p style="color:#666;font-size:13px;">No sites yet — add one above.</p>';
    return;
  }

  sites.forEach((site) => {
    const card = document.createElement('div');
    card.className = 'site-card';
    card.innerHTML = `
      <div class="site-card-top">
        <div>
          <div class="site-name">${escapeHtml(site.name)}</div>
          <div class="site-url">${escapeHtml(site.url)}</div>
          <span class="site-platform">${escapeHtml(site.platform)}</span>
        </div>
        <span class="status-badge ${site.status === 'on' ? 'status-on' : 'status-off'}">
          ${site.status === 'on' ? 'ONLINE' : 'DISABLED'}
        </span>
      </div>
      <div class="site-actions">
        ${
          site.status === 'on'
            ? `<button class="btn-toggle-off" data-action="off" data-id="${site.id}">Disable site</button>`
            : `<button class="btn-toggle-on" data-action="on" data-id="${site.id}">Enable site</button>`
        }
        <button data-action="download" data-id="${site.id}">Download config file</button>
        <button class="btn-danger" data-action="delete" data-id="${site.id}">Remove</button>
      </div>
    `;
    sitesList.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadSites() {
  try {
    const sites = await api('/api/admin/sites');
    renderSites(sites);
  } catch (err) {
    // settings prompt already shown by api() if that was the cause
  }
}

sitesList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;

  try {
    if (action === 'on' || action === 'off') {
      await api(`/api/admin/sites/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: action }),
      });
      showToast(action === 'on' ? 'Site enabled' : 'Site disabled');
    } else if (action === 'delete') {
      if (!confirm('Remove this site from the panel? (This does not delete the site itself.)')) return;
      await api(`/api/admin/sites/${id}`, { method: 'DELETE' });
      showToast('Site removed');
    } else if (action === 'download') {
      const site = currentSites.find((s) => s.id === id);
      if (!site) return;
      const { serverUrl } = getSettings();

      const result = await window.electronAPI.generateFile({
        platform: site.platform,
        serverUrl,
        id: site.id,
        key: site.key,
        siteName: site.name,
      });

      if (result.success) {
        showToast('Saved: ' + result.filePath);
      } else if (!result.canceled) {
        showToast('Could not save the file');
      }
      return; // no need to reload sites after a download
    }
    loadSites();
  } catch (err) {
    showToast('Error: ' + err.message);
  }
});

document.getElementById('addSiteBtn').addEventListener('click', async () => {
  const name = document.getElementById('newName').value.trim();
  const url = document.getElementById('newUrl').value.trim();
  const platform = document.getElementById('newPlatform').value;

  if (!name || !url) {
    showToast('Enter a name and URL');
    return;
  }

  try {
    const site = await api('/api/admin/sites', {
      method: 'POST',
      body: JSON.stringify({ name, url, platform }),
    });
    document.getElementById('newName').value = '';
    document.getElementById('newUrl').value = '';
    showToast(`Added. Site ID: ${site.id}`);
    loadSites();
  } catch (err) {
    showToast('Error: ' + err.message);
  }
});

document.getElementById('settingsBtn').addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

document.getElementById('saveSettings').addEventListener('click', () => {
  saveSettings(serverUrlInput.value.trim(), adminTokenInput.value.trim());
  showToast('Settings saved');
  settingsPanel.classList.add('hidden');
  loadSites();
});

// init
const s = getSettings();
serverUrlInput.value = s.serverUrl;
adminTokenInput.value = s.adminToken;
if (!s.serverUrl || !s.adminToken) settingsPanel.classList.remove('hidden');
loadSites();
setInterval(loadSites, 15000); // keep statuses fresh

/**
 * Kill-Switch Status Server
 * -------------------------
 * A tiny central API that stores an on/off status for each client website
 * you manage. WordPress sites and Shopify/static storefronts poll this API
 * periodically and react (show a maintenance screen / block interaction)
 * when a site is switched "off".
 *
 * STORAGE: the sites list is persisted as a JSON file INSIDE YOUR GITHUB
 * REPO (via the GitHub Contents API), not on Render's local disk. Render's
 * free-tier disk is ephemeral — it gets wiped on every redeploy or when the
 * container restarts after sleeping — so storing state there loses data.
 * GitHub is free, persists forever, and you already have an account.
 *
 * A local copy is still kept as `data.json` purely as an in-memory-backed
 * cache for fast reads; GitHub is the source of truth for every write.
 *
 * Two kinds of endpoints:
 *  - PUBLIC  (used by the websites themselves): GET /api/status/:siteId
 *  - ADMIN   (used only by your Electron control panel): everything under /api/admin/*
 *
 * Admin endpoints require: Authorization: Bearer <ADMIN_TOKEN>
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 4000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // e.g. "Hani19982017/killer"
const GITHUB_FILE_PATH = process.env.GITHUB_FILE_PATH || 'data.json';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

const LOCAL_CACHE_FILE = path.join(__dirname, 'data.json');
const GITHUB_ENABLED = Boolean(GITHUB_TOKEN && GITHUB_REPO);

if (!ADMIN_TOKEN || ADMIN_TOKEN === 'change-me-to-a-long-random-string') {
  console.warn(
    '\n[WARNING] ADMIN_TOKEN is not set (or still the default placeholder).\n' +
    'Set a strong random ADMIN_TOKEN in your environment before exposing this server publicly.\n'
  );
}

if (!GITHUB_ENABLED) {
  console.warn(
    '\n[WARNING] GITHUB_TOKEN / GITHUB_REPO not set — falling back to LOCAL DISK storage.\n' +
    'On Render\'s free tier this will be WIPED on every redeploy or container restart.\n' +
    'Set GITHUB_TOKEN and GITHUB_REPO env vars to persist data in your GitHub repo instead.\n'
  );
}

// in-memory cache, kept in sync with GitHub (or local file if GitHub isn't configured)
let cache = { sites: [] };
let githubFileSha = null; // required by GitHub's API to update an existing file

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- GitHub-backed storage ----------------

async function githubApiRequest(method, body) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${encodeURIComponent(GITHUB_FILE_PATH)}`;
  const res = await fetch(url + (method === 'GET' ? `?ref=${GITHUB_BRANCH}` : ''), {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'kill-switch-server',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function loadFromGitHub() {
  const res = await githubApiRequest('GET');

  if (res.status === 404) {
    // File doesn't exist yet in the repo — start fresh, it'll be created on first write.
    cache = { sites: [] };
    githubFileSha = null;
    return;
  }

  if (!res.ok) {
    throw new Error(`GitHub read failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  githubFileSha = json.sha;
  const content = Buffer.from(json.content, 'base64').toString('utf8');
  cache = JSON.parse(content);
}

async function saveToGitHub() {
  const content = Buffer.from(JSON.stringify(cache, null, 2), 'utf8').toString('base64');

  const res = await githubApiRequest('PUT', {
    message: `Update kill-switch data (${new Date().toISOString()})`,
    content,
    branch: GITHUB_BRANCH,
    sha: githubFileSha || undefined, // omit on first-ever creation
  });

  if (!res.ok) {
    throw new Error(`GitHub write failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  githubFileSha = json.content.sha;
}

// ---------------- Local-disk fallback (only used if GitHub isn't configured) ----------------

function loadFromLocalDisk() {
  try {
    cache = JSON.parse(fs.readFileSync(LOCAL_CACHE_FILE, 'utf8'));
  } catch (err) {
    cache = { sites: [] };
  }
}

function saveToLocalDisk() {
  fs.writeFileSync(LOCAL_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

// ---------------- Unified storage interface ----------------

async function loadData() {
  if (GITHUB_ENABLED) {
    await loadFromGitHub();
  } else {
    loadFromLocalDisk();
  }
}

async function persist() {
  // Always mirror to local disk too, so reads stay fast (cache) even if GitHub is slow.
  try { saveToLocalDisk(); } catch (err) { /* non-fatal */ }

  if (GITHUB_ENABLED) {
    await saveToGitHub();
  }
}

function findSite(id) {
  return cache.sites.find((s) => s.id === id);
}

// ---------------- admin auth middleware ----------------

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ================= PUBLIC ENDPOINT (called by WordPress/Shopify/static sites) =================

// GET /api/status/:siteId?key=SITE_KEY
app.get('/api/status/:siteId', (req, res) => {
  const site = findSite(req.params.siteId);

  if (!site) {
    return res.status(404).json({ status: 'on', error: 'unknown site (failing open)' });
  }

  if (!req.query.key || req.query.key !== site.key) {
    return res.status(403).json({ status: 'on', error: 'invalid key (failing open)' });
  }

  return res.json({
    status: site.status, // "on" | "off"
    message: site.maintenanceMessage || 'This site is temporarily unavailable. Please check back soon.',
  });
});

// ================= ADMIN ENDPOINTS (called only by your Electron app) =================

app.get('/api/admin/sites', requireAdmin, (req, res) => {
  res.json(cache.sites);
});

app.post('/api/admin/sites', requireAdmin, async (req, res) => {
  const { name, url, platform } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: 'name and url are required' });
  }

  const site = {
    id: crypto.randomBytes(6).toString('hex'),
    key: crypto.randomBytes(16).toString('hex'),
    name,
    url,
    platform: platform || 'wordpress',
    status: 'on',
    maintenanceMessage: 'This site is temporarily unavailable. Please check back soon.',
    createdAt: new Date().toISOString(),
  };

  cache.sites.push(site);

  try {
    await persist();
  } catch (err) {
    cache.sites.pop(); // roll back the in-memory change since the save failed
    return res.status(502).json({ error: 'Failed to save to GitHub: ' + err.message });
  }

  res.status(201).json(site);
});

app.patch('/api/admin/sites/:id', requireAdmin, async (req, res) => {
  const site = findSite(req.params.id);
  if (!site) return res.status(404).json({ error: 'not found' });

  const before = { ...site };

  if (req.body.status && ['on', 'off'].includes(req.body.status)) {
    site.status = req.body.status;
  }
  if (typeof req.body.maintenanceMessage === 'string') {
    site.maintenanceMessage = req.body.maintenanceMessage;
  }
  if (typeof req.body.name === 'string') {
    site.name = req.body.name;
  }
  if (typeof req.body.url === 'string') {
    site.url = req.body.url;
  }

  try {
    await persist();
  } catch (err) {
    Object.assign(site, before); // roll back
    return res.status(502).json({ error: 'Failed to save to GitHub: ' + err.message });
  }

  res.json(site);
});

app.delete('/api/admin/sites/:id', requireAdmin, async (req, res) => {
  const before = cache.sites;
  const site = findSite(req.params.id);
  if (!site) return res.status(404).json({ error: 'not found' });

  cache.sites = cache.sites.filter((s) => s.id !== req.params.id);

  try {
    await persist();
  } catch (err) {
    cache.sites = before; // roll back
    return res.status(502).json({ error: 'Failed to save to GitHub: ' + err.message });
  }

  res.status(204).end();
});

app.post('/api/admin/sites/:id/regenerate-key', requireAdmin, async (req, res) => {
  const site = findSite(req.params.id);
  if (!site) return res.status(404).json({ error: 'not found' });

  const oldKey = site.key;
  site.key = crypto.randomBytes(16).toString('hex');

  try {
    await persist();
  } catch (err) {
    site.key = oldKey; // roll back
    return res.status(502).json({ error: 'Failed to save to GitHub: ' + err.message });
  }

  res.json(site);
});

app.get('/', (req, res) => {
  res.send(`Kill-switch status server is running. Storage: ${GITHUB_ENABLED ? 'GitHub (' + GITHUB_REPO + ')' : 'local disk (NOT persistent on Render free tier)'}`);
});

// ---------------- startup ----------------

loadData()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Kill-switch server listening on http://localhost:${PORT}`);
      console.log(`Storage backend: ${GITHUB_ENABLED ? `GitHub (${GITHUB_REPO}, file: ${GITHUB_FILE_PATH})` : 'local disk'}`);
      console.log(`Loaded ${cache.sites.length} site(s).`);
    });
  })
  .catch((err) => {
    console.error('Failed to load initial data:', err);
    process.exit(1);
  });

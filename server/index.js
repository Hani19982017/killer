/**
 * Kill-Switch Status Server
 * -------------------------
 * A tiny central API that stores an on/off status for each client website
 * you manage. WordPress sites and Shopify storefronts poll this API
 * periodically and react (show a maintenance screen / block checkout)
 * when a site is switched "off".
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

const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 4000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!ADMIN_TOKEN || ADMIN_TOKEN === 'change-me-to-a-long-random-string') {
  console.warn(
    '\n[WARNING] ADMIN_TOKEN is not set (or still the default placeholder).\n' +
    'Set a strong random ADMIN_TOKEN in your .env file before exposing this server publicly.\n'
  );
}

const app = express();
app.use(cors());
app.use(express.json());

// ---------- storage helpers ----------

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { sites: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function findSite(data, id) {
  return data.sites.find((s) => s.id === id);
}

// ---------- admin auth middleware ----------

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ================= PUBLIC ENDPOINT (called by WordPress/Shopify) =================

// GET /api/status/:siteId?key=SITE_KEY
app.get('/api/status/:siteId', (req, res) => {
  const data = readData();
  const site = findSite(data, req.params.siteId);

  if (!site) {
    return res.status(404).json({ status: 'on', error: 'unknown site (failing open)' });
  }

  // Require the per-site secret key so random people can't probe/toggle by guessing IDs
  if (!req.query.key || req.query.key !== site.key) {
    return res.status(403).json({ status: 'on', error: 'invalid key (failing open)' });
  }

  return res.json({
    status: site.status, // "on" | "off"
    message: site.maintenanceMessage || 'This site is temporarily unavailable. Please check back soon.',
  });
});

// ================= ADMIN ENDPOINTS (called only by your Electron app) =================

// List all sites (key is included since it's your own control panel)
app.get('/api/admin/sites', requireAdmin, (req, res) => {
  const data = readData();
  res.json(data.sites);
});

// Add a new site
app.post('/api/admin/sites', requireAdmin, (req, res) => {
  const { name, url, platform } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: 'name and url are required' });
  }

  const data = readData();
  const site = {
    id: crypto.randomBytes(6).toString('hex'),
    key: crypto.randomBytes(16).toString('hex'),
    name,
    url,
    platform: platform || 'wordpress', // "wordpress" | "shopify"
    status: 'on',
    maintenanceMessage: 'This site is temporarily unavailable. Please check back soon.',
    createdAt: new Date().toISOString(),
  };

  data.sites.push(site);
  writeData(data);
  res.status(201).json(site);
});

// Toggle / update a site's status or message
app.patch('/api/admin/sites/:id', requireAdmin, (req, res) => {
  const data = readData();
  const site = findSite(data, req.params.id);
  if (!site) return res.status(404).json({ error: 'not found' });

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

  writeData(data);
  res.json(site);
});

// Delete a site
app.delete('/api/admin/sites/:id', requireAdmin, (req, res) => {
  const data = readData();
  const before = data.sites.length;
  data.sites = data.sites.filter((s) => s.id !== req.params.id);
  if (data.sites.length === before) return res.status(404).json({ error: 'not found' });
  writeData(data);
  res.status(204).end();
});

// Regenerate a site's secret key (e.g. if you suspect it leaked)
app.post('/api/admin/sites/:id/regenerate-key', requireAdmin, (req, res) => {
  const data = readData();
  const site = findSite(data, req.params.id);
  if (!site) return res.status(404).json({ error: 'not found' });
  site.key = crypto.randomBytes(16).toString('hex');
  writeData(data);
  res.json(site);
});

app.get('/', (req, res) => {
  res.send('Kill-switch status server is running.');
});

app.listen(PORT, () => {
  console.log(`Kill-switch server listening on http://localhost:${PORT}`);
});

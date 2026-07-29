import express from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import os from 'os';

import db from './db.js';
import { register, login, requireAuth, getUser } from './auth.js';
import * as scryfall from './scryfall.js';
import routes from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3847;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'mtg-collector-local-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    },
  })
);

// Auth routes
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password, display_name } = req.body;
    const user = register(username, password, display_name);
    req.session.userId = user.id;
    res.status(201).json(user);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const user = login(username, password);
    req.session.userId = user.id;
    res.json(user);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = getUser(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json(user);
});

// Scryfall proxy / search
app.get('/api/search', requireAuth, async (req, res) => {
  try {
    const { q, page = 1, unique = 'prints' } = req.query;
    if (!q || q.trim().length < 2) return res.json({ total: 0, has_more: false, cards: [] });
    const raw = q.trim();
    const isSimple = !/[:+!"()<>=]/.test(raw) && !/\b(or|and|not)\b/i.test(raw);

    let result = { total: 0, has_more: false, cards: [] };
    try {
      // Prefer name field for plain typed names
      const query = isSimple ? `name:"${raw}" OR name:${raw.split(/\s+/).join(' name:')}` : raw;
      result = await scryfall.searchCards(query, { page: +page, unique });
    } catch (err) {
      if (err.status !== 404) throw err;
    }

    // Always try fuzzy named match and pin to top for simple queries
    if (isSimple && +page === 1) {
      try {
        const named = await scryfall.getCardNamed(raw);
        const cards = result.cards.filter((c) => c.scryfall_id !== named.scryfall_id);
        // Prefer printings of the named oracle card first
        let preferred = [named];
        if (named.oracle_id && unique === 'prints') {
          try {
            preferred = await scryfall.getPrints(named.oracle_id);
          } catch {
            preferred = [named];
          }
        }
        const seen = new Set(preferred.map((c) => c.scryfall_id));
        result = {
          total: Math.max(result.total, preferred.length),
          has_more: result.has_more,
          cards: [...preferred, ...cards.filter((c) => !seen.has(c.scryfall_id))],
        };
      } catch {
        /* no fuzzy match */
      }
    }

    res.json(result);
  } catch (err) {
    if (err.status === 404) return res.json({ total: 0, has_more: false, cards: [] });
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/autocomplete', requireAuth, async (req, res) => {
  try {
    const names = await scryfall.autocomplete(req.query.q || '');
    res.json(names);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cards/:id', requireAuth, async (req, res) => {
  try {
    const card = await scryfall.getCard(req.params.id);
    res.json(card);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/cards/:id/prints', requireAuth, async (req, res) => {
  try {
    const card = await scryfall.getCard(req.params.id);
    if (!card.oracle_id) return res.json([card]);
    const prints = await scryfall.getPrints(card.oracle_id);
    res.json(prints);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Scan: OCR image → identify card
app.post('/api/scan', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image required' });

    // Preprocess for better OCR: grayscale, contrast, resize
    const processed = await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen()
      .toBuffer();

    // Focus on top portion (card name area) + full card
    const topHalf = await sharp(processed)
      .metadata()
      .then(async (meta) => {
        const h = Math.floor((meta.height || 800) * 0.35);
        return sharp(processed).extract({ left: 0, top: 0, width: meta.width, height: h }).toBuffer();
      });

    const [fullOcr, topOcr] = await Promise.all([
      Tesseract.recognize(processed, 'eng', { logger: () => {} }),
      Tesseract.recognize(topHalf, 'eng', { logger: () => {} }),
    ]);

    const text = `${topOcr.data.text}\n${fullOcr.data.text}`;
    const candidates = await scryfall.identifyFromText(text);

    // Also try fuzzy search on top OCR words joined
    const topLine = topOcr.data.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 2)[0];

    if (topLine && candidates.length < 3) {
      try {
        const results = await scryfall.searchCards(`!"${topLine.replace(/"/g, '')}" OR name:/^${topLine.split(/\s+/)[0]}/`, {
          unique: 'prints',
        });
        for (const card of results.cards.slice(0, 5)) {
          if (!candidates.find((c) => c.card.scryfall_id === card.scryfall_id)) {
            candidates.push({ card, confidence: 0.5, source: topLine });
          }
        }
      } catch {
        /* ignore */
      }
    }

    candidates.sort((a, b) => b.confidence - a.confidence);

    res.json({
      ocr_text: text.trim().slice(0, 500),
      matches: candidates.slice(0, 8).map((c) => ({
        ...c.card,
        confidence: Math.round(c.confidence * 100),
        matched_text: c.source,
      })),
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: err.message || 'Scan failed' });
  }
});

// Identify by name (manual / quick add from name)
app.post('/api/identify', requireAuth, async (req, res) => {
  try {
    const { name, set } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const card = await scryfall.getCardNamed(name, { set });
    let prints = [];
    if (card.oracle_id) {
      try {
        prints = await scryfall.getPrints(card.oracle_id);
      } catch {
        prints = [card];
      }
    } else {
      prints = [card];
    }
    res.json({ card, prints });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.use('/api', routes);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'mtg-collector' });
});

// Network info helper
app.get('/api/network-info', requireAuth, (req, res) => {
  const nets = os.networkInterfaces();
  const addresses = [];
  if (process.env.PUBLIC_URL) {
    addresses.push({
      interface: 'public',
      address: process.env.PUBLIC_URL,
      url: process.env.PUBLIC_URL.replace(/\/$/, ''),
    });
  }
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const family = net.family === 4 || net.family === 'IPv4';
      if (family && !net.internal) {
        addresses.push({ interface: name, address: net.address, url: `http://${net.address}:${PORT}` });
      }
    }
  }
  res.json({
    port: PORT,
    addresses,
    hint: process.env.PUBLIC_URL
      ? null
      : 'On Docker, container IPs may not work on your phone — use your host PC LAN IP and this port.',
  });
});

// Serve production client
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, HOST, () => {
  console.log(`\n  MTG Collector running!`);
  console.log(`  Local:   http://localhost:${PORT}`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  Network: http://${net.address}:${PORT}`);
      }
    }
  }
  console.log(`  (Open the Network URL on your phone — same Wi‑Fi)\n`);
});

// Ensure default exists for lint
void db;

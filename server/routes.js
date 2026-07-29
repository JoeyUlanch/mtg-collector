import { Router } from 'express';
import db from './db.js';
import { requireAuth, ownsCollection, ownsCard } from './auth.js';
import * as scryfall from './scryfall.js';

const router = Router();

function parseJson(val, fallback = []) {
  if (Array.isArray(val)) return val;
  try {
    return JSON.parse(val || '[]');
  } catch {
    return fallback;
  }
}

function enrichCard(row) {
  if (!row) return null;
  const price = row.foil ? row.price_usd_foil ?? row.price_usd : row.price_usd;
  return {
    ...row,
    colors: parseJson(row.colors),
    color_identity: parseJson(row.color_identity),
    unit_price: price,
    total_price: price != null ? price * row.quantity : null,
    foil: !!row.foil,
    full_art: !!row.full_art,
    promo: !!row.promo,
    reserved: !!row.reserved,
  };
}

// ── Collections ──────────────────────────────────────────

router.get('/collections', requireAuth, (req, res) => {
  const cols = db
    .prepare(
      `SELECT col.*,
        (SELECT COUNT(*) FROM cards c WHERE c.collection_id = col.id) as card_count,
        (SELECT COALESCE(SUM(c.quantity), 0) FROM cards c WHERE c.collection_id = col.id) as total_quantity,
        (SELECT COALESCE(SUM(
          c.quantity * COALESCE(
            CASE WHEN c.foil = 1 THEN c.price_usd_foil ELSE c.price_usd END,
            c.price_usd, 0
          )
        ), 0) FROM cards c WHERE c.collection_id = col.id) as total_value
       FROM collections col
       WHERE col.user_id = ?
       ORDER BY col.is_default DESC, col.name ASC`
    )
    .all(req.session.userId);
  res.json(cols);
});

router.post('/collections', requireAuth, (req, res) => {
  const { name, description, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const result = db
    .prepare(
      `INSERT INTO collections (user_id, name, description, color) VALUES (?, ?, ?, ?)`
    )
    .run(
      req.session.userId,
      name.trim(),
      description || '',
      color || '#c9a227'
    );
  const col = db.prepare('SELECT * FROM collections WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(col);
});

router.patch('/collections/:id', requireAuth, (req, res) => {
  const id = +req.params.id;
  if (!ownsCollection(req.session.userId, id)) return res.status(404).json({ error: 'Not found' });
  const { name, description, color } = req.body;
  const existing = db.prepare('SELECT * FROM collections WHERE id = ?').get(id);
  db.prepare(
    `UPDATE collections SET name = ?, description = ?, color = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name?.trim() || existing.name, description ?? existing.description, color || existing.color, id);
  res.json(db.prepare('SELECT * FROM collections WHERE id = ?').get(id));
});

router.delete('/collections/:id', requireAuth, (req, res) => {
  const id = +req.params.id;
  if (!ownsCollection(req.session.userId, id)) return res.status(404).json({ error: 'Not found' });
  const col = db.prepare('SELECT * FROM collections WHERE id = ?').get(id);
  if (col.is_default) return res.status(400).json({ error: 'Cannot delete default collection' });
  db.prepare('DELETE FROM collections WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ── Cards in collection ──────────────────────────────────

router.get('/collections/:id/cards', requireAuth, (req, res) => {
  const id = +req.params.id;
  if (!ownsCollection(req.session.userId, id)) return res.status(404).json({ error: 'Not found' });

  const {
    sort = 'name',
    order = 'asc',
    q = '',
    rarity,
    set_code,
    colors,
    type,
    foil,
    condition,
    min_price,
    max_price,
    tag,
  } = req.query;

  const allowedSort = {
    name: 'c.name',
    price: 'unit_price',
    total_price: 'total_price',
    quantity: 'c.quantity',
    rarity: 'c.rarity',
    set: 'c.set_name',
    cmc: 'c.cmc',
    added: 'c.added_at',
    updated: 'c.updated_at',
    collector: 'c.collector_number',
    type: 'c.type_line',
    artist: 'c.artist',
    condition: 'c.condition',
  };

  const sortCol = allowedSort[sort] || 'c.name';
  const sortDir = order?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  let sql = `
    SELECT c.*,
      CASE WHEN c.foil = 1 THEN COALESCE(c.price_usd_foil, c.price_usd) ELSE c.price_usd END as unit_price,
      (CASE WHEN c.foil = 1 THEN COALESCE(c.price_usd_foil, c.price_usd) ELSE c.price_usd END) * c.quantity as total_price
    FROM cards c
    WHERE c.collection_id = ?
  `;
  const params = [id];

  if (q) {
    sql += ` AND (c.name LIKE ? OR c.set_name LIKE ? OR c.type_line LIKE ? OR c.notes LIKE ? OR c.artist LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (rarity) {
    sql += ` AND c.rarity = ?`;
    params.push(rarity);
  }
  if (set_code) {
    sql += ` AND c.set_code = ?`;
    params.push(set_code);
  }
  if (type) {
    sql += ` AND c.type_line LIKE ?`;
    params.push(`%${type}%`);
  }
  if (foil === '1' || foil === '0') {
    sql += ` AND c.foil = ?`;
    params.push(+foil);
  }
  if (condition) {
    sql += ` AND c.condition = ?`;
    params.push(condition);
  }
  if (min_price) {
    sql += ` AND unit_price >= ?`;
    params.push(+min_price);
  }
  if (max_price) {
    sql += ` AND (unit_price IS NULL OR unit_price <= ?)`;
    params.push(+max_price);
  }
  if (colors) {
    // colors as comma-separated WUBRG identity filter
    const cols = colors.split('').filter((c) => 'WUBRG'.includes(c.toUpperCase()));
    for (const col of cols) {
      sql += ` AND c.color_identity LIKE ?`;
      params.push(`%${col.toUpperCase()}%`);
    }
  }
  if (tag) {
    sql += ` AND EXISTS (SELECT 1 FROM card_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.card_id = c.id AND t.name = ?)`;
    params.push(tag);
  }

  sql += ` ORDER BY ${sortCol} ${sortDir}, c.name ASC`;

  // SQLite doesn't allow alias in WHERE for price filters when using subquery sorting - use outer wrap for price
  let rows;
  if (min_price || max_price || sort === 'price' || sort === 'total_price') {
    const inner = sql.replace(
      /AND unit_price >= \?/g,
      'AND (CASE WHEN c.foil = 1 THEN COALESCE(c.price_usd_foil, c.price_usd) ELSE c.price_usd END) >= ?'
    ).replace(
      /AND \(unit_price IS NULL OR unit_price <= \?\)/g,
      'AND ((CASE WHEN c.foil = 1 THEN COALESCE(c.price_usd_foil, c.price_usd) ELSE c.price_usd END) IS NULL OR (CASE WHEN c.foil = 1 THEN COALESCE(c.price_usd_foil, c.price_usd) ELSE c.price_usd END) <= ?)'
    );
    rows = db.prepare(inner).all(...params);
  } else {
    rows = db.prepare(sql).all(...params);
  }

  // Attach tags
  const tagStmt = db.prepare(
    `SELECT t.* FROM tags t JOIN card_tags ct ON ct.tag_id = t.id WHERE ct.card_id = ?`
  );
  const cards = rows.map((r) => ({
    ...enrichCard(r),
    tags: tagStmt.all(r.id),
  }));

  res.json(cards);
});

router.get('/collections/:id/stats', requireAuth, (req, res) => {
  const id = +req.params.id;
  if (!ownsCollection(req.session.userId, id)) return res.status(404).json({ error: 'Not found' });

  const cards = db.prepare('SELECT * FROM cards WHERE collection_id = ?').all(id).map(enrichCard);

  const byRarity = {};
  const byColor = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, M: 0 };
  const bySet = {};
  const byType = {};
  let totalValue = 0;
  let totalQty = 0;
  let foilCount = 0;
  let priced = 0;

  for (const c of cards) {
    totalQty += c.quantity;
    if (c.total_price != null) {
      totalValue += c.total_price;
      priced += c.quantity;
    }
    if (c.foil) foilCount += c.quantity;
    byRarity[c.rarity] = (byRarity[c.rarity] || 0) + c.quantity;

    const ci = c.color_identity || [];
    if (ci.length === 0) byColor.C += c.quantity;
    else if (ci.length > 1) byColor.M += c.quantity;
    else byColor[ci[0]] = (byColor[ci[0]] || 0) + c.quantity;

    bySet[c.set_code] = bySet[c.set_code] || { name: c.set_name, count: 0, value: 0 };
    bySet[c.set_code].count += c.quantity;
    bySet[c.set_code].value += c.total_price || 0;

    const primaryType = (c.type_line || '').split('—')[0].split('//')[0].trim();
    const key = primaryType || 'Unknown';
    byType[key] = (byType[key] || 0) + c.quantity;
  }

  const topValue = [...cards]
    .filter((c) => c.unit_price != null)
    .sort((a, b) => (b.unit_price || 0) - (a.unit_price || 0))
    .slice(0, 10);

  res.json({
    unique_cards: cards.length,
    total_quantity: totalQty,
    total_value: Math.round(totalValue * 100) / 100,
    avg_value: priced ? Math.round((totalValue / priced) * 100) / 100 : 0,
    foil_count: foilCount,
    by_rarity: byRarity,
    by_color: byColor,
    by_set: bySet,
    by_type: byType,
    top_value: topValue,
  });
});

router.post('/collections/:id/cards', requireAuth, (req, res) => {
  const id = +req.params.id;
  if (!ownsCollection(req.session.userId, id)) return res.status(404).json({ error: 'Not found' });

  const {
    scryfall_id,
    quantity = 1,
    foil = false,
    condition = 'NM',
    language = 'en',
    notes = '',
  } = req.body;

  if (!scryfall_id) return res.status(400).json({ error: 'scryfall_id required' });

  // Merge duplicates (same printing + foil + condition)
  const existing = db
    .prepare(
      `SELECT * FROM cards WHERE collection_id = ? AND scryfall_id = ? AND foil = ? AND condition = ? AND language = ?`
    )
    .get(id, scryfall_id, foil ? 1 : 0, condition, language);

  if (existing) {
    db.prepare(
      `UPDATE cards SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?`
    ).run(quantity, existing.id);
    const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(existing.id);
    return res.json(enrichCard(updated));
  }

  // Fetch card data async style - we need scryfall data
  scryfall
    .getCard(scryfall_id)
    .then((card) => {
      const result = db
        .prepare(
          `INSERT INTO cards (
            collection_id, scryfall_id, oracle_id, name, set_code, set_name, collector_number,
            rarity, type_line, mana_cost, cmc, colors, color_identity,
            image_small, image_normal, image_large, quantity, foil, condition, language, notes,
            price_usd, price_usd_foil, price_eur, price_tix, artist, frame, border_color,
            full_art, promo, reserved, last_price_check
          ) VALUES (
            ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now')
          )`
        )
        .run(
          id,
          card.scryfall_id,
          card.oracle_id,
          card.name,
          card.set_code,
          card.set_name,
          card.collector_number,
          card.rarity,
          card.type_line,
          card.mana_cost,
          card.cmc,
          card.colors,
          card.color_identity,
          card.image_small,
          card.image_normal,
          card.image_large,
          quantity,
          foil ? 1 : 0,
          condition,
          language,
          notes,
          card.price_usd,
          card.price_usd_foil,
          card.price_eur,
          card.price_tix,
          card.artist,
          card.frame,
          card.border_color,
          card.full_art,
          card.promo,
          card.reserved
        );

      // Price history
      db.prepare(
        `INSERT INTO price_history (scryfall_id, price_usd, price_usd_foil) VALUES (?, ?, ?)`
      ).run(card.scryfall_id, card.price_usd, card.price_usd_foil);

      const created = db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(enrichCard(created));
    })
    .catch((err) => {
      res.status(err.status || 500).json({ error: err.message });
    });
});

router.patch('/cards/:id', requireAuth, (req, res) => {
  const id = +req.params.id;
  if (!ownsCard(req.session.userId, id)) return res.status(404).json({ error: 'Not found' });

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  const {
    quantity = card.quantity,
    foil = card.foil,
    condition = card.condition,
    language = card.language,
    notes = card.notes,
    collection_id,
  } = req.body;

  if (collection_id && collection_id !== card.collection_id) {
    if (!ownsCollection(req.session.userId, collection_id)) {
      return res.status(400).json({ error: 'Invalid collection' });
    }
  }

  db.prepare(
    `UPDATE cards SET quantity = ?, foil = ?, condition = ?, language = ?, notes = ?,
     collection_id = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(
    Math.max(0, +quantity),
    foil ? 1 : 0,
    condition,
    language,
    notes ?? '',
    collection_id || card.collection_id,
    id
  );

  if (+quantity === 0) {
    db.prepare('DELETE FROM cards WHERE id = ?').run(id);
    return res.json({ ok: true, deleted: true });
  }

  res.json(enrichCard(db.prepare('SELECT * FROM cards WHERE id = ?').get(id)));
});

router.delete('/cards/:id', requireAuth, (req, res) => {
  const id = +req.params.id;
  if (!ownsCard(req.session.userId, id)) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM cards WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Bulk add
router.post('/collections/:id/cards/bulk', requireAuth, async (req, res) => {
  const id = +req.params.id;
  if (!ownsCollection(req.session.userId, id)) return res.status(404).json({ error: 'Not found' });

  const { cards: items } = req.body;
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'cards array required' });
  }

  const results = { added: 0, updated: 0, errors: [] };

  for (const item of items.slice(0, 100)) {
    try {
      let scryfallId = item.scryfall_id;
      if (!scryfallId && item.name) {
        const card = await scryfall.getCardNamed(item.name, { set: item.set_code, exact: !!item.exact });
        scryfallId = card.scryfall_id;
      }
      if (!scryfallId) {
        results.errors.push({ item, error: 'No card identity' });
        continue;
      }

      const card = await scryfall.getCard(scryfallId);
      const foil = item.foil ? 1 : 0;
      const condition = item.condition || 'NM';
      const quantity = item.quantity || 1;

      const existing = db
        .prepare(
          `SELECT * FROM cards WHERE collection_id = ? AND scryfall_id = ? AND foil = ? AND condition = ?`
        )
        .get(id, scryfallId, foil, condition);

      if (existing) {
        db.prepare(`UPDATE cards SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?`).run(
          quantity,
          existing.id
        );
        results.updated++;
      } else {
        db.prepare(
          `INSERT INTO cards (
            collection_id, scryfall_id, oracle_id, name, set_code, set_name, collector_number,
            rarity, type_line, mana_cost, cmc, colors, color_identity,
            image_small, image_normal, image_large, quantity, foil, condition, notes,
            price_usd, price_usd_foil, price_eur, price_tix, artist, frame, border_color,
            full_art, promo, reserved, last_price_check
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`
        ).run(
          id,
          card.scryfall_id,
          card.oracle_id,
          card.name,
          card.set_code,
          card.set_name,
          card.collector_number,
          card.rarity,
          card.type_line,
          card.mana_cost,
          card.cmc,
          card.colors,
          card.color_identity,
          card.image_small,
          card.image_normal,
          card.image_large,
          quantity,
          foil,
          condition,
          item.notes || '',
          card.price_usd,
          card.price_usd_foil,
          card.price_eur,
          card.price_tix,
          card.artist,
          card.frame,
          card.border_color,
          card.full_art,
          card.promo,
          card.reserved
        );
        results.added++;
      }
    } catch (err) {
      results.errors.push({ item, error: err.message });
    }
  }

  res.json(results);
});

// Move card between collections
router.post('/cards/:id/move', requireAuth, (req, res) => {
  const id = +req.params.id;
  if (!ownsCard(req.session.userId, id)) return res.status(404).json({ error: 'Not found' });
  const { collection_id, quantity } = req.body;
  if (!ownsCollection(req.session.userId, collection_id)) {
    return res.status(400).json({ error: 'Invalid collection' });
  }

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  const moveQty = quantity ? Math.min(+quantity, card.quantity) : card.quantity;

  if (moveQty >= card.quantity) {
    db.prepare(`UPDATE cards SET collection_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
      collection_id,
      id
    );
  } else {
    db.prepare(`UPDATE cards SET quantity = quantity - ?, updated_at = datetime('now') WHERE id = ?`).run(
      moveQty,
      id
    );
    // clone to new collection
    const existing = db
      .prepare(
        `SELECT * FROM cards WHERE collection_id = ? AND scryfall_id = ? AND foil = ? AND condition = ?`
      )
      .get(collection_id, card.scryfall_id, card.foil, card.condition);
    if (existing) {
      db.prepare(`UPDATE cards SET quantity = quantity + ? WHERE id = ?`).run(moveQty, existing.id);
    } else {
      db.prepare(
        `INSERT INTO cards (
          collection_id, scryfall_id, oracle_id, name, set_code, set_name, collector_number,
          rarity, type_line, mana_cost, cmc, colors, color_identity,
          image_small, image_normal, image_large, quantity, foil, condition, language, notes,
          price_usd, price_usd_foil, price_eur, price_tix, artist, frame, border_color,
          full_art, promo, reserved, last_price_check
        ) SELECT ?, scryfall_id, oracle_id, name, set_code, set_name, collector_number,
          rarity, type_line, mana_cost, cmc, colors, color_identity,
          image_small, image_normal, image_large, ?, foil, condition, language, notes,
          price_usd, price_usd_foil, price_eur, price_tix, artist, frame, border_color,
          full_art, promo, reserved, last_price_check
        FROM cards WHERE id = ?`
      ).run(collection_id, moveQty, id);
    }
  }

  res.json({ ok: true });
});

// Refresh prices for a collection
router.post('/collections/:id/refresh-prices', requireAuth, async (req, res) => {
  const id = +req.params.id;
  if (!ownsCollection(req.session.userId, id)) return res.status(404).json({ error: 'Not found' });

  const cards = db.prepare('SELECT id, scryfall_id FROM cards WHERE collection_id = ?').all(id);
  const unique = [...new Set(cards.map((c) => c.scryfall_id))];
  let updated = 0;

  for (const sfId of unique.slice(0, 200)) {
    try {
      const card = await scryfall.getCard(sfId);
      db.prepare(
        `UPDATE cards SET price_usd = ?, price_usd_foil = ?, price_eur = ?, price_tix = ?,
         last_price_check = datetime('now'), updated_at = datetime('now')
         WHERE scryfall_id = ? AND collection_id = ?`
      ).run(card.price_usd, card.price_usd_foil, card.price_eur, card.price_tix, sfId, id);

      db.prepare(
        `INSERT INTO price_history (scryfall_id, price_usd, price_usd_foil) VALUES (?, ?, ?)`
      ).run(sfId, card.price_usd, card.price_usd_foil);
      updated++;
    } catch {
      /* skip */
    }
  }

  res.json({ updated, total: unique.length });
});

// Global search across user's collections
router.get('/my-cards/search', requireAuth, (req, res) => {
  const { q = '', sort = 'name', order = 'asc' } = req.query;
  if (!q.trim()) return res.json([]);

  const allowedSort = {
    name: 'c.name',
    price: 'c.price_usd',
    set: 'c.set_name',
    added: 'c.added_at',
  };
  const sortCol = allowedSort[sort] || 'c.name';
  const sortDir = order === 'desc' ? 'DESC' : 'ASC';
  const like = `%${q}%`;

  const rows = db
    .prepare(
      `SELECT c.*, col.name as collection_name, col.id as collection_id
       FROM cards c
       JOIN collections col ON col.id = c.collection_id
       WHERE col.user_id = ?
         AND (c.name LIKE ? OR c.set_name LIKE ? OR c.type_line LIKE ? OR c.notes LIKE ?)
       ORDER BY ${sortCol} ${sortDir}
       LIMIT 200`
    )
    .all(req.session.userId, like, like, like, like);

  res.json(rows.map(enrichCard));
});

// Dashboard / all stats
router.get('/dashboard', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const collections = db
    .prepare('SELECT id, name, color FROM collections WHERE user_id = ?')
    .all(userId);

  const cards = db
    .prepare(
      `SELECT c.* FROM cards c
       JOIN collections col ON col.id = c.collection_id
       WHERE col.user_id = ?`
    )
    .all(userId)
    .map(enrichCard);

  let totalValue = 0;
  let totalQty = 0;
  for (const c of cards) {
    totalQty += c.quantity;
    totalValue += c.total_price || 0;
  }

  const recent = db
    .prepare(
      `SELECT c.*, col.name as collection_name FROM cards c
       JOIN collections col ON col.id = c.collection_id
       WHERE col.user_id = ?
       ORDER BY c.added_at DESC LIMIT 12`
    )
    .all(userId)
    .map(enrichCard);

  const wishlistCount = db
    .prepare('SELECT COUNT(*) as n FROM wishlists WHERE user_id = ?')
    .get(userId).n;

  res.json({
    collections: collections.length,
    unique_cards: cards.length,
    total_quantity: totalQty,
    total_value: Math.round(totalValue * 100) / 100,
    wishlist_count: wishlistCount,
    recent,
  });
});

// Wishlist
router.get('/wishlist', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM wishlists WHERE user_id = ? ORDER BY priority DESC, name ASC')
    .all(req.session.userId);
  res.json(rows.map((r) => ({ ...r, foil: !!r.foil })));
});

router.post('/wishlist', requireAuth, async (req, res) => {
  const { scryfall_id, foil = false, priority = 1, notes = '' } = req.body;
  if (!scryfall_id) return res.status(400).json({ error: 'scryfall_id required' });
  try {
    const card = await scryfall.getCard(scryfall_id);
    db.prepare(
      `INSERT INTO wishlists (user_id, scryfall_id, name, set_code, set_name, image_small, image_normal, price_usd, priority, notes, foil)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, scryfall_id, foil) DO UPDATE SET priority = excluded.priority, notes = excluded.notes`
    ).run(
      req.session.userId,
      card.scryfall_id,
      card.name,
      card.set_code,
      card.set_name,
      card.image_small,
      card.image_normal,
      foil ? card.price_usd_foil : card.price_usd,
      priority,
      notes,
      foil ? 1 : 0
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/wishlist/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM wishlists WHERE id = ? AND user_id = ?').run(+req.params.id, req.session.userId);
  res.json({ ok: true });
});

// Tags
router.get('/tags', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name').all(req.session.userId));
});

router.post('/tags', requireAuth, (req, res) => {
  const { name, color = '#6366f1' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const r = db
      .prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)')
      .run(req.session.userId, name.trim(), color);
    res.status(201).json(db.prepare('SELECT * FROM tags WHERE id = ?').get(r.lastInsertRowid));
  } catch {
    res.status(409).json({ error: 'Tag already exists' });
  }
});

router.post('/cards/:id/tags', requireAuth, (req, res) => {
  const cardId = +req.params.id;
  if (!ownsCard(req.session.userId, cardId)) return res.status(404).json({ error: 'Not found' });
  const { tag_id } = req.body;
  const tag = db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(tag_id, req.session.userId);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });
  db.prepare('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)').run(cardId, tag_id);
  res.json({ ok: true });
});

router.delete('/cards/:cardId/tags/:tagId', requireAuth, (req, res) => {
  if (!ownsCard(req.session.userId, +req.params.cardId)) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM card_tags WHERE card_id = ? AND tag_id = ?').run(
    +req.params.cardId,
    +req.params.tagId
  );
  res.json({ ok: true });
});

// Export collection CSV
router.get('/collections/:id/export', requireAuth, (req, res) => {
  const id = +req.params.id;
  if (!ownsCollection(req.session.userId, id)) return res.status(404).json({ error: 'Not found' });

  const cards = db.prepare('SELECT * FROM cards WHERE collection_id = ? ORDER BY name').all(id);
  const headers = [
    'Name',
    'Set',
    'Set Code',
    'Collector Number',
    'Rarity',
    'Quantity',
    'Foil',
    'Condition',
    'Language',
    'Price USD',
    'Total USD',
    'CMC',
    'Type',
    'Mana Cost',
    'Artist',
    'Notes',
    'Scryfall ID',
  ];

  const escape = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [headers.join(',')];
  for (const c of cards) {
    const unit = c.foil ? c.price_usd_foil ?? c.price_usd : c.price_usd;
    lines.push(
      [
        c.name,
        c.set_name,
        c.set_code,
        c.collector_number,
        c.rarity,
        c.quantity,
        c.foil ? 'foil' : '',
        c.condition,
        c.language,
        unit ?? '',
        unit != null ? (unit * c.quantity).toFixed(2) : '',
        c.cmc,
        c.type_line,
        c.mana_cost,
        c.artist,
        c.notes,
        c.scryfall_id,
      ]
        .map(escape)
        .join(',')
    );
  }

  const col = db.prepare('SELECT name FROM collections WHERE id = ?').get(id);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${(col?.name || 'collection').replace(/[^a-z0-9]/gi, '_')}.csv"`
  );
  res.send(lines.join('\n'));
});

// Price history for a card
router.get('/cards/:id/price-history', requireAuth, (req, res) => {
  const id = +req.params.id;
  if (!ownsCard(req.session.userId, id)) return res.status(404).json({ error: 'Not found' });
  const card = db.prepare('SELECT scryfall_id FROM cards WHERE id = ?').get(id);
  const history = db
    .prepare(
      `SELECT price_usd, price_usd_foil, recorded_at FROM price_history
       WHERE scryfall_id = ? ORDER BY recorded_at ASC LIMIT 90`
    )
    .all(card.scryfall_id);
  res.json(history);
});

// Duplicates across collections
router.get('/duplicates', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.scryfall_id, c.name, c.set_code, c.set_name, c.image_small,
              SUM(c.quantity) as total_qty, COUNT(DISTINCT c.collection_id) as collection_count,
              GROUP_CONCAT(DISTINCT col.name) as collections
       FROM cards c
       JOIN collections col ON col.id = c.collection_id
       WHERE col.user_id = ?
       GROUP BY c.scryfall_id
       HAVING SUM(c.quantity) > 1
       ORDER BY total_qty DESC
       LIMIT 100`
    )
    .all(req.session.userId);
  res.json(rows);
});

export default router;

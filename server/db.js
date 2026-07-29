import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'mtg.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#c9a227',
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    scryfall_id TEXT NOT NULL,
    oracle_id TEXT,
    name TEXT NOT NULL,
    set_code TEXT,
    set_name TEXT,
    collector_number TEXT,
    rarity TEXT,
    type_line TEXT,
    mana_cost TEXT,
    cmc REAL DEFAULT 0,
    colors TEXT DEFAULT '[]',
    color_identity TEXT DEFAULT '[]',
    image_small TEXT,
    image_normal TEXT,
    image_large TEXT,
    quantity INTEGER DEFAULT 1,
    foil INTEGER DEFAULT 0,
    condition TEXT DEFAULT 'NM',
    language TEXT DEFAULT 'en',
    notes TEXT DEFAULT '',
    price_usd REAL,
    price_usd_foil REAL,
    price_eur REAL,
    price_tix REAL,
    artist TEXT,
    frame TEXT,
    border_color TEXT,
    full_art INTEGER DEFAULT 0,
    promo INTEGER DEFAULT 0,
    reserved INTEGER DEFAULT 0,
    added_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    last_price_check TEXT
  );

  CREATE TABLE IF NOT EXISTS wishlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scryfall_id TEXT NOT NULL,
    name TEXT NOT NULL,
    set_code TEXT,
    set_name TEXT,
    image_small TEXT,
    image_normal TEXT,
    price_usd REAL,
    priority INTEGER DEFAULT 1,
    notes TEXT DEFAULT '',
    foil INTEGER DEFAULT 0,
    added_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, scryfall_id, foil)
  );

  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scryfall_id TEXT NOT NULL,
    price_usd REAL,
    price_usd_foil REAL,
    recorded_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
    UNIQUE(user_id, name)
  );

  CREATE TABLE IF NOT EXISTS card_tags (
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, tag_id)
  );

  CREATE INDEX IF NOT EXISTS idx_cards_collection ON cards(collection_id);
  CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
  CREATE INDEX IF NOT EXISTS idx_cards_scryfall ON cards(scryfall_id);
  CREATE INDEX IF NOT EXISTS idx_cards_set ON cards(set_code);
  CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id);
  CREATE INDEX IF NOT EXISTS idx_price_history_scryfall ON price_history(scryfall_id);
`);

export default db;

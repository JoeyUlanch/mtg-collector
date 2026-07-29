import bcrypt from 'bcryptjs';
import db from './db.js';

export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

export function getUser(id) {
  return db.prepare('SELECT id, username, display_name, created_at FROM users WHERE id = ?').get(id);
}

export function register(username, password, displayName) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    const err = new Error('Username already taken');
    err.status = 409;
    throw err;
  }
  if (!username || username.length < 2) {
    const err = new Error('Username must be at least 2 characters');
    err.status = 400;
    throw err;
  }
  if (!password || password.length < 4) {
    const err = new Error('Password must be at least 4 characters');
    err.status = 400;
    throw err;
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)')
    .run(username.trim(), (displayName || username).trim(), hash);

  const userId = result.lastInsertRowid;
  db.prepare(
    `INSERT INTO collections (user_id, name, description, is_default, color)
     VALUES (?, 'Main Collection', 'Default collection', 1, '#c9a227')`
  ).run(userId);

  return getUser(userId);
}

export function login(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    const err = new Error('Invalid username or password');
    err.status = 401;
    throw err;
  }
  return getUser(user.id);
}

export function ownsCollection(userId, collectionId) {
  const row = db
    .prepare('SELECT id FROM collections WHERE id = ? AND user_id = ?')
    .get(collectionId, userId);
  return !!row;
}

export function ownsCard(userId, cardId) {
  const row = db
    .prepare(
      `SELECT c.id FROM cards c
       JOIN collections col ON col.id = c.collection_id
       WHERE c.id = ? AND col.user_id = ?`
    )
    .get(cardId, userId);
  return !!row;
}

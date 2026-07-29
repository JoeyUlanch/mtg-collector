const BASE = 'https://api.scryfall.com';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let lastRequest = 0;
async function rateLimitedFetch(url) {
  const now = Date.now();
  const wait = Math.max(0, 100 - (now - lastRequest));
  if (wait) await delay(wait);
  lastRequest = Date.now();
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'MTGCollector/1.0' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.details || err.message || `Scryfall error ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export function mapCard(card) {
  const face = card.card_faces?.[0];
  const image = card.image_uris || face?.image_uris || {};
  return {
    scryfall_id: card.id,
    oracle_id: card.oracle_id || face?.oracle_id || null,
    name: card.name,
    set_code: card.set,
    set_name: card.set_name,
    collector_number: card.collector_number,
    rarity: card.rarity,
    type_line: card.type_line || face?.type_line || '',
    mana_cost: card.mana_cost || face?.mana_cost || '',
    cmc: card.cmc ?? 0,
    colors: JSON.stringify(card.colors || face?.colors || []),
    color_identity: JSON.stringify(card.color_identity || []),
    image_small: image.small || null,
    image_normal: image.normal || null,
    image_large: image.large || image.normal || null,
    price_usd: card.prices?.usd ? parseFloat(card.prices.usd) : null,
    price_usd_foil: card.prices?.usd_foil ? parseFloat(card.prices.usd_foil) : null,
    price_eur: card.prices?.eur ? parseFloat(card.prices.eur) : null,
    price_tix: card.prices?.tix ? parseFloat(card.prices.tix) : null,
    artist: card.artist || face?.artist || null,
    frame: card.frame || null,
    border_color: card.border_color || null,
    full_art: card.full_art ? 1 : 0,
    promo: card.promo ? 1 : 0,
    reserved: card.reserved ? 1 : 0,
    oracle_text: card.oracle_text || face?.oracle_text || '',
    power: card.power || face?.power || null,
    toughness: card.toughness || face?.toughness || null,
    loyalty: card.loyalty || face?.loyalty || null,
    legalities: card.legalities || {},
    finishes: card.finishes || ['nonfoil'],
    released_at: card.released_at || null,
    scryfall_uri: card.scryfall_uri || null,
  };
}

export async function searchCards(query, { page = 1, unique = 'prints' } = {}) {
  const q = encodeURIComponent(query);
  const data = await rateLimitedFetch(
    `${BASE}/cards/search?q=${q}&unique=${unique}&order=name&page=${page}`
  );
  return {
    total: data.total_cards,
    has_more: data.has_more,
    cards: data.data.map(mapCard),
  };
}

export async function getCard(id) {
  const card = await rateLimitedFetch(`${BASE}/cards/${id}`);
  return mapCard(card);
}

export async function getCardNamed(name, { set, exact = false } = {}) {
  const params = new URLSearchParams();
  if (exact) params.set('exact', name);
  else params.set('fuzzy', name);
  if (set) params.set('set', set);
  const card = await rateLimitedFetch(`${BASE}/cards/named?${params}`);
  return mapCard(card);
}

export async function autocomplete(query) {
  if (!query || query.length < 2) return [];
  const data = await rateLimitedFetch(
    `${BASE}/cards/autocomplete?q=${encodeURIComponent(query)}`
  );
  return data.data || [];
}

export async function getPrints(oracleId) {
  const data = await rateLimitedFetch(
    `${BASE}/cards/search?q=oracleid%3A${oracleId}&unique=prints&order=released`
  );
  return data.data.map(mapCard);
}

export async function refreshPrices(scryfallIds) {
  const results = [];
  for (const id of scryfallIds) {
    try {
      const card = await getCard(id);
      results.push(card);
    } catch {
      // skip failed
    }
  }
  return results;
}

/** Identify card from OCR text lines using Scryfall fuzzy name match */
export async function identifyFromText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && l.length <= 80)
    .filter((l) => !/^\d+$/.test(l))
    .filter((l) => !/^[©®]/.test(l));

  const candidates = [];
  const tried = new Set();

  // Prefer early lines (card name is at top)
  const ordered = [...lines.slice(0, 8), ...lines.slice(8)];

  for (const line of ordered) {
    // Clean OCR noise
    const cleaned = line
      .replace(/[|\\\/_]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[^\w]+|[^\w]+$/g, '')
      .trim();
    if (cleaned.length < 3 || tried.has(cleaned.toLowerCase())) continue;
    tried.add(cleaned.toLowerCase());

    try {
      const card = await getCardNamed(cleaned);
      candidates.push({ card, confidence: scoreMatch(cleaned, card.name), source: cleaned });
      if (candidates.length >= 5) break;
    } catch {
      // try shorter variants
      const words = cleaned.split(' ');
      if (words.length > 2) {
        const partial = words.slice(0, Math.ceil(words.length * 0.7)).join(' ');
        if (!tried.has(partial.toLowerCase())) {
          tried.add(partial.toLowerCase());
          try {
            const card = await getCardNamed(partial);
            candidates.push({
              card,
              confidence: scoreMatch(partial, card.name) * 0.9,
              source: partial,
            });
          } catch {
            /* continue */
          }
        }
      }
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}

function scoreMatch(ocr, name) {
  const a = ocr.toLowerCase();
  const b = name.toLowerCase();
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.85;
  // simple token overlap
  const ta = new Set(a.split(/\s+/));
  const tb = new Set(b.split(/\s+/));
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.max(ta.size, tb.size, 1);
}

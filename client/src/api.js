const API = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
    ...options,
    body:
      options.body && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  me: () => request('/auth/me'),
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  register: (username, password, display_name) =>
    request('/auth/register', { method: 'POST', body: { username, password, display_name } }),
  logout: () => request('/auth/logout', { method: 'POST' }),

  dashboard: () => request('/dashboard'),
  networkInfo: () => request('/network-info'),

  collections: () => request('/collections'),
  createCollection: (data) => request('/collections', { method: 'POST', body: data }),
  updateCollection: (id, data) => request(`/collections/${id}`, { method: 'PATCH', body: data }),
  deleteCollection: (id) => request(`/collections/${id}`, { method: 'DELETE' }),

  collectionCards: (id, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/collections/${id}/cards?${q}`);
  },
  collectionStats: (id) => request(`/collections/${id}/stats`),
  addCard: (collectionId, data) =>
    request(`/collections/${collectionId}/cards`, { method: 'POST', body: data }),
  bulkAdd: (collectionId, cards) =>
    request(`/collections/${collectionId}/cards/bulk`, { method: 'POST', body: { cards } }),
  updateCard: (id, data) => request(`/cards/${id}`, { method: 'PATCH', body: data }),
  deleteCard: (id) => request(`/cards/${id}`, { method: 'DELETE' }),
  moveCard: (id, data) => request(`/cards/${id}/move`, { method: 'POST', body: data }),
  refreshPrices: (id) => request(`/collections/${id}/refresh-prices`, { method: 'POST' }),
  exportCollection: (id) => {
    window.open(`${API}/collections/${id}/export`, '_blank');
  },

  search: (q, page = 1, unique = 'prints') =>
    request(`/search?q=${encodeURIComponent(q)}&page=${page}&unique=${unique}`),
  autocomplete: (q) => request(`/autocomplete?q=${encodeURIComponent(q)}`),
  getCard: (id) => request(`/cards/${id}`),
  getPrints: (id) => request(`/cards/${id}/prints`),
  identify: (name, set) => request('/identify', { method: 'POST', body: { name, set } }),
  scan: (file) => {
    const fd = new FormData();
    fd.append('image', file);
    return request('/scan', { method: 'POST', body: fd });
  },

  mySearch: (q) => request(`/my-cards/search?q=${encodeURIComponent(q)}`),
  wishlist: () => request('/wishlist'),
  addWishlist: (data) => request('/wishlist', { method: 'POST', body: data }),
  removeWishlist: (id) => request(`/wishlist/${id}`, { method: 'DELETE' }),

  tags: () => request('/tags'),
  createTag: (data) => request('/tags', { method: 'POST', body: data }),
  addCardTag: (cardId, tag_id) => request(`/cards/${cardId}/tags`, { method: 'POST', body: { tag_id } }),
  removeCardTag: (cardId, tagId) => request(`/cards/${cardId}/tags/${tagId}`, { method: 'DELETE' }),

  duplicates: () => request('/duplicates'),
  priceHistory: (id) => request(`/cards/${id}/price-history`),
};

export function formatPrice(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `$${Number(n).toFixed(2)}`;
}

export function rarityColor(r) {
  return (
    {
      common: '#9ca3af',
      uncommon: '#c0c7d1',
      rare: '#eab308',
      mythic: '#f97316',
      special: '#a855f7',
      bonus: '#a855f7',
    }[r] || '#9ca3af'
  );
}

export const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];

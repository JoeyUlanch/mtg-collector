import { useEffect, useState, useRef } from 'react';
import { api, formatPrice, rarityColor, CONDITIONS } from '../api';

export default function Search() {
  const [tab, setTab] = useState('catalog'); // catalog | mine
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [myResults, setMyResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [prints, setPrints] = useState([]);
  const [collections, setCollections] = useState([]);
  const [addState, setAddState] = useState({
    collection_id: '',
    quantity: 1,
    foil: false,
    condition: 'NM',
  });
  const [toast, setToast] = useState('');
  const [adding, setAdding] = useState(false);
  const debounce = useRef(null);

  useEffect(() => {
    api.collections().then((cols) => {
      setCollections(cols);
      if (cols[0]) setAddState((s) => ({ ...s, collection_id: cols[0].id }));
    });
  }, []);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setResults([]);
      setMyResults([]);
      setSuggestions([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        if (tab === 'catalog') {
          const [auto, search] = await Promise.all([
            api.autocomplete(q).catch(() => []),
            api.search(q, 1, 'cards'),
          ]);
          setSuggestions(auto.slice(0, 8));
          setResults(search.cards || []);
        } else {
          const mine = await api.mySearch(q);
          setMyResults(mine);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounce.current);
  }, [q, tab]);

  const showToast = (m) => {
    setToast(m);
    setTimeout(() => setToast(''), 2500);
  };

  const openCard = async (card) => {
    setSelected(card);
    setPrints([]);
    setAddState((s) => ({
      ...s,
      foil: false,
      quantity: 1,
      condition: 'NM',
    }));
    try {
      const p = await api.getPrints(card.scryfall_id);
      setPrints(p);
      const match = p.find((x) => x.scryfall_id === card.scryfall_id) || p[0] || card;
      setSelected(match);
    } catch {
      setPrints([card]);
    }
  };

  const addCard = async () => {
    if (!addState.collection_id || !selected) return;
    setAdding(true);
    try {
      await api.addCard(addState.collection_id, {
        scryfall_id: selected.scryfall_id,
        quantity: addState.quantity,
        foil: addState.foil,
        condition: addState.condition,
      });
      showToast(`Added ${selected.name}`);
      setSelected(null);
    } catch (e) {
      showToast(e.message);
    } finally {
      setAdding(false);
    }
  };

  const price = selected
    ? addState.foil
      ? selected.price_usd_foil ?? selected.price_usd
      : selected.price_usd
    : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Search</h1>
          <p>Catalog powered by Scryfall · live market prices</p>
        </div>
      </div>

      <div className="auth-tabs" style={{ marginBottom: 14 }}>
        <button type="button" className={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}>
          All cards
        </button>
        <button type="button" className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>
          My collection
        </button>
      </div>

      <div className="search-box" style={{ marginBottom: 12 }}>
        <input
          className="input"
          placeholder={tab === 'catalog' ? 'Lightning Bolt, t:creature c:r…' : 'Search cards you own…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>

      {tab === 'catalog' && (
        <p className="hint" style={{ marginBottom: 12 }}>
          Supports Scryfall syntax: <code>{"t:creature c:rg cmc<=3"}</code>, set codes, etc.
        </p>
      )}

      {suggestions.length > 0 && tab === 'catalog' && (
        <div className="chip-row" style={{ marginBottom: 12 }}>
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => setQ(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
      {loading && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      )}

      {!loading && tab === 'catalog' && results.length > 0 && (
        <div className="card-list">
          {results.map((c) => (
            <div key={c.scryfall_id} className="card-list-item" onClick={() => openCard(c)}>
              {(c.image_small || c.image_normal) && (
                <img src={c.image_small || c.image_normal} alt="" loading="lazy" />
              )}
              <div className="info">
                <h3>{c.name}</h3>
                <p>
                  <span className="rarity-dot" style={{ background: rarityColor(c.rarity) }} />
                  {c.set_name} · {c.type_line}
                </p>
              </div>
              <div className="right">
                <div className="price">{formatPrice(c.price_usd)}</div>
                {c.price_usd_foil != null && (
                  <div className="qty">foil {formatPrice(c.price_usd_foil)}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'mine' && myResults.length > 0 && (
        <div className="card-list">
          {myResults.map((c) => (
            <div key={c.id} className="card-list-item">
              {(c.image_small || c.image_normal) && (
                <img src={c.image_small || c.image_normal} alt="" loading="lazy" />
              )}
              <div className="info">
                <h3>
                  {c.foil ? '✨ ' : ''}
                  {c.name}
                </h3>
                <p>
                  {c.collection_name} · {c.set_code?.toUpperCase()} · ×{c.quantity}
                </p>
              </div>
              <div className="right">
                <div className="price">{formatPrice(c.unit_price ?? c.price_usd)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && q.length >= 2 && tab === 'catalog' && results.length === 0 && (
        <div className="empty">
          <h3>No results</h3>
          <p>Try a different name or Scryfall query.</p>
        </div>
      )}

      {!loading && q.length >= 2 && tab === 'mine' && myResults.length === 0 && (
        <div className="empty">
          <h3>Not in your binders</h3>
          <p>You don&apos;t own a match for “{q}”.</p>
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2>{selected.name}</h2>
              <button className="btn ghost sm" type="button" onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>
            <div className="card-preview">
              {(selected.image_normal || selected.image_large) && (
                <img src={selected.image_large || selected.image_normal} alt="" />
              )}
              <div className="details">
                <p className="price-lg">{formatPrice(price)}</p>
                <p>
                  {selected.set_name} #{selected.collector_number}
                </p>
                <p>{selected.type_line}</p>
                <p>{selected.mana_cost}</p>
              </div>
            </div>

            {prints.length > 1 && (
              <>
                <h3 className="section-title">Printing / version</h3>
                <div className="print-grid">
                  {prints.map((p) => (
                    <button
                      key={p.scryfall_id}
                      type="button"
                      className={`print-option ${selected.scryfall_id === p.scryfall_id ? 'selected' : ''}`}
                      onClick={() => setSelected(p)}
                    >
                      {p.image_small && <img src={p.image_small} alt={p.set_code} />}
                      <div className="label">
                        {p.set_code?.toUpperCase()} #{p.collector_number}
                        {p.price_usd != null ? ` · $${p.price_usd}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="divider" />

            <div className="field-grid">
              <div className="form-group">
                <label>Binder</label>
                <select
                  className="input select"
                  value={addState.collection_id}
                  onChange={(e) => setAddState((s) => ({ ...s, collection_id: +e.target.value }))}
                >
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Condition</label>
                <select
                  className="input select"
                  value={addState.condition}
                  onChange={(e) => setAddState((s) => ({ ...s, condition: e.target.value }))}
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Quantity</label>
                <div className="stepper">
                  <button
                    type="button"
                    onClick={() => setAddState((s) => ({ ...s, quantity: Math.max(1, s.quantity - 1) }))}
                  >
                    −
                  </button>
                  <span>{addState.quantity}</span>
                  <button
                    type="button"
                    onClick={() => setAddState((s) => ({ ...s, quantity: s.quantity + 1 }))}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Finish</label>
                <select
                  className="input select"
                  value={addState.foil ? '1' : '0'}
                  onChange={(e) => setAddState((s) => ({ ...s, foil: e.target.value === '1' }))}
                >
                  <option value="0">Non-foil · {formatPrice(selected.price_usd)}</option>
                  <option value="1">Foil · {formatPrice(selected.price_usd_foil)}</option>
                </select>
              </div>
            </div>

            <div className="btn-row">
              <button className="btn primary" type="button" onClick={addCard} disabled={adding}>
                {adding ? 'Adding…' : 'Add to binder'}
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={async () => {
                  try {
                    await api.addWishlist({ scryfall_id: selected.scryfall_id, foil: addState.foil });
                    showToast('Added to wishlist');
                  } catch (e) {
                    showToast(e.message);
                  }
                }}
              >
                + Wish
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

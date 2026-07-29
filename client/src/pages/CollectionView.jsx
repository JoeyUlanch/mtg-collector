import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatPrice, rarityColor, CONDITIONS } from '../api';

const SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'price', label: 'Price' },
  { value: 'total_price', label: 'Total $' },
  { value: 'quantity', label: 'Qty' },
  { value: 'cmc', label: 'CMC' },
  { value: 'rarity', label: 'Rarity' },
  { value: 'set', label: 'Set' },
  { value: 'added', label: 'Date added' },
  { value: 'type', label: 'Type' },
  { value: 'artist', label: 'Artist' },
  { value: 'condition', label: 'Condition' },
];

export default function CollectionView() {
  const { id } = useParams();
  const [collection, setCollection] = useState(null);
  const [cards, setCards] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [allCollections, setAllCollections] = useState([]);

  const [filters, setFilters] = useState({
    q: '',
    sort: 'name',
    order: 'asc',
    rarity: '',
    foil: '',
    condition: '',
    type: '',
  });

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cols, cardList, st] = await Promise.all([
        api.collections(),
        api.collectionCards(id, Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))),
        api.collectionStats(id),
      ]);
      setAllCollections(cols);
      setCollection(cols.find((c) => String(c.id) === String(id)));
      setCards(cardList);
      setStats(st);
    } catch (e) {
      showToast(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, filters]);

  useEffect(() => {
    const t = setTimeout(load, filters.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, filters.q]);

  const refreshPrices = async () => {
    setRefreshing(true);
    try {
      const r = await api.refreshPrices(id);
      showToast(`Updated ${r.updated} prices`);
      load();
    } catch (e) {
      showToast(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const saveCard = async (patch) => {
    try {
      const result = await api.updateCard(selected.id, patch);
      if (result.deleted) {
        setSelected(null);
        showToast('Card removed');
      } else {
        setSelected(result);
        showToast('Saved');
      }
      load();
    } catch (e) {
      showToast(e.message);
    }
  };

  const deleteCard = async () => {
    if (!confirm('Remove this card from the binder?')) return;
    try {
      await api.deleteCard(selected.id);
      setSelected(null);
      showToast('Removed');
      load();
    } catch (e) {
      showToast(e.message);
    }
  };

  const maxRarity = stats ? Math.max(...Object.values(stats.by_rarity || { x: 1 }), 1) : 1;

  return (
    <div>
      <Link to="/collections" className="back-link">
        ← Binders
      </Link>

      <div className="page-header">
        <div>
          <h1>{collection?.name || 'Collection'}</h1>
          <p>
            {stats ? `${stats.total_quantity} cards · ${formatPrice(stats.total_value)}` : '…'}
          </p>
        </div>
        <div className="btn-row">
          <button className="btn secondary sm" type="button" onClick={() => setShowStats(true)}>
            Stats
          </button>
          <button className="btn secondary sm" type="button" onClick={refreshPrices} disabled={refreshing}>
            {refreshing ? '…' : '$ Sync'}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-row">
          <div className="search-box" style={{ flex: 1 }}>
            <input
              className="input"
              placeholder="Search this binder…"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
          </div>
          <button
            className={`btn secondary sm ${showFilters ? 'primary' : ''}`}
            type="button"
            onClick={() => setShowFilters((v) => !v)}
          >
            Filters
          </button>
          <div className="view-toggle">
            <button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}>
              Grid
            </button>
            <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
              List
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="field-grid">
              <div className="form-group" style={{ margin: 0 }}>
                <label>Sort by</label>
                <select
                  className="input select"
                  value={filters.sort}
                  onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Order</label>
                <select
                  className="input select"
                  value={filters.order}
                  onChange={(e) => setFilters((f) => ({ ...f, order: e.target.value }))}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Rarity</label>
                <select
                  className="input select"
                  value={filters.rarity}
                  onChange={(e) => setFilters((f) => ({ ...f, rarity: e.target.value }))}
                >
                  <option value="">Any</option>
                  <option value="common">Common</option>
                  <option value="uncommon">Uncommon</option>
                  <option value="rare">Rare</option>
                  <option value="mythic">Mythic</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Foil</label>
                <select
                  className="input select"
                  value={filters.foil}
                  onChange={(e) => setFilters((f) => ({ ...f, foil: e.target.value }))}
                >
                  <option value="">Any</option>
                  <option value="1">Foil only</option>
                  <option value="0">Non-foil</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Condition</label>
                <select
                  className="input select"
                  value={filters.condition}
                  onChange={(e) => setFilters((f) => ({ ...f, condition: e.target.value }))}
                >
                  <option value="">Any</option>
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Type contains</label>
                <input
                  className="input"
                  value={filters.type}
                  onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
                  placeholder="Creature, Instant…"
                />
              </div>
            </div>
            <button
              className="btn ghost sm"
              type="button"
              style={{ marginTop: 10 }}
              onClick={() =>
                setFilters({ q: '', sort: 'name', order: 'asc', rarity: '', foil: '', condition: '', type: '' })
              }
            >
              Reset filters
            </button>
          </div>
        )}
      </div>

      <div className="btn-row" style={{ marginBottom: 12 }}>
        <button className="btn ghost sm" type="button" onClick={() => api.exportCollection(id)}>
          ↓ Export CSV
        </button>
        <span className="hint" style={{ alignSelf: 'center' }}>
          {cards.length} shown
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : cards.length === 0 ? (
        <div className="empty">
          <h3>No cards match</h3>
          <p>Try clearing filters, or scan/search to add cards.</p>
          <Link to="/scan" className="btn primary" style={{ marginTop: 12 }}>
            Scan a card
          </Link>
        </div>
      ) : view === 'grid' ? (
        <div className="card-grid">
          {cards.map((c) => (
            <div key={c.id} className="mtg-card" onClick={() => setSelected(c)}>
              <div className="art">
                {(c.image_normal || c.image_small) && (
                  <img src={c.image_normal || c.image_small} alt={c.name} loading="lazy" />
                )}
                {c.quantity > 1 && <span className="qty-badge">×{c.quantity}</span>}
                {c.foil && <span className="foil-badge">FOIL</span>}
              </div>
              <div className="body">
                <div className="name">{c.name}</div>
                <div className="sub">
                  <span>
                    <span className="rarity-dot" style={{ background: rarityColor(c.rarity) }} />
                    {c.set_code?.toUpperCase()}
                  </span>
                  <span className="price">{formatPrice(c.unit_price)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-list">
          {cards.map((c) => (
            <div key={c.id} className="card-list-item" onClick={() => setSelected(c)}>
              {(c.image_small || c.image_normal) && (
                <img src={c.image_small || c.image_normal} alt="" loading="lazy" />
              )}
              <div className="info">
                <h3>
                  {c.foil ? '✨ ' : ''}
                  {c.name}
                </h3>
                <p>
                  {c.set_name} · {c.rarity} · {c.condition}
                </p>
              </div>
              <div className="right">
                <div className="price">{formatPrice(c.total_price ?? c.unit_price)}</div>
                <div className="qty">×{c.quantity}</div>
              </div>
            </div>
          ))}
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
                <img src={selected.image_large || selected.image_normal} alt={selected.name} />
              )}
              <div className="details">
                <p className="price-lg">{formatPrice(selected.unit_price)}</p>
                <p>
                  {selected.set_name} ({selected.set_code?.toUpperCase()}) #{selected.collector_number}
                </p>
                <p>{selected.type_line}</p>
                <p className="mana-cost">{selected.mana_cost || '—'}</p>
                <p style={{ textTransform: 'capitalize' }}>{selected.rarity}</p>
                {selected.artist && <p>Art: {selected.artist}</p>}
                {selected.foil && <p style={{ color: 'var(--gold)' }}>Foil</p>}
              </div>
            </div>

            <div className="field-grid">
              <div className="form-group">
                <label>Quantity</label>
                <div className="stepper">
                  <button type="button" onClick={() => saveCard({ quantity: Math.max(0, selected.quantity - 1) })}>
                    −
                  </button>
                  <span>{selected.quantity}</span>
                  <button type="button" onClick={() => saveCard({ quantity: selected.quantity + 1 })}>
                    +
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Condition</label>
                <select
                  className="input select"
                  value={selected.condition}
                  onChange={(e) => saveCard({ condition: e.target.value })}
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Foil</label>
                <select
                  className="input select"
                  value={selected.foil ? '1' : '0'}
                  onChange={(e) => saveCard({ foil: e.target.value === '1' })}
                >
                  <option value="0">Non-foil</option>
                  <option value="1">Foil</option>
                </select>
              </div>
              <div className="form-group">
                <label>Move to binder</label>
                <select
                  className="input select"
                  value={selected.collection_id}
                  onChange={(e) => saveCard({ collection_id: +e.target.value })}
                >
                  {allCollections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                className="input textarea"
                defaultValue={selected.notes || ''}
                key={selected.id + '-notes'}
                onBlur={(e) => {
                  if (e.target.value !== (selected.notes || '')) saveCard({ notes: e.target.value });
                }}
                placeholder="Signed, altered, trade interest…"
              />
            </div>

            <div className="btn-row">
              <button className="btn danger" type="button" onClick={deleteCard}>
                Remove
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={async () => {
                  try {
                    await api.addWishlist({ scryfall_id: selected.scryfall_id, foil: selected.foil });
                    showToast('Added to wishlist');
                  } catch (e) {
                    showToast(e.message);
                  }
                }}
              >
                + Wishlist
              </button>
            </div>
          </div>
        </div>
      )}

      {showStats && stats && (
        <div className="modal-backdrop" onClick={() => setShowStats(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2>Binder stats</h2>
              <button className="btn ghost sm" type="button" onClick={() => setShowStats(false)}>
                ✕
              </button>
            </div>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="label">Value</div>
                <div className="value">{formatPrice(stats.total_value)}</div>
              </div>
              <div className="stat-card">
                <div className="label">Cards</div>
                <div className="value">{stats.total_quantity}</div>
              </div>
              <div className="stat-card">
                <div className="label">Unique</div>
                <div className="value">{stats.unique_cards}</div>
              </div>
              <div className="stat-card">
                <div className="label">Foils</div>
                <div className="value">{stats.foil_count}</div>
              </div>
            </div>

            <h3 className="section-title">By rarity</h3>
            <div className="bar-list">
              {Object.entries(stats.by_rarity || {}).map(([k, v]) => (
                <div className="bar-row" key={k}>
                  <span style={{ textTransform: 'capitalize' }}>{k}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${(v / maxRarity) * 100}%`, background: rarityColor(k) }}
                    />
                  </div>
                  <span>{v}</span>
                </div>
              ))}
            </div>

            {stats.top_value?.length > 0 && (
              <>
                <h3 className="section-title" style={{ marginTop: 20 }}>
                  Most valuable
                </h3>
                <div className="card-list">
                  {stats.top_value.map((c) => (
                    <div key={c.id} className="card-list-item" onClick={() => { setShowStats(false); setSelected(c); }}>
                      {c.image_small && <img src={c.image_small} alt="" />}
                      <div className="info">
                        <h3>{c.name}</h3>
                        <p>{c.set_code?.toUpperCase()}</p>
                      </div>
                      <div className="right">
                        <div className="price">{formatPrice(c.unit_price)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

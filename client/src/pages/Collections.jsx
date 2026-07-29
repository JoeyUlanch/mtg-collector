import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatPrice } from '../api';

const COLORS = ['#c9a227', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#f59e0b', '#06b6d4', '#ec4899'];

export default function Collections() {
  const [cols, setCols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .collections()
      .then(setCols)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createCollection({ name, description, color });
      setShowNew(false);
      setName('');
      setDescription('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalValue = cols.reduce((s, c) => s + (c.total_value || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Binders</h1>
          <p>
            {cols.length} collections · {formatPrice(totalValue)} total
          </p>
        </div>
        <button className="btn primary sm" type="button" onClick={() => setShowNew(true)}>
          + New
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : cols.length === 0 ? (
        <div className="empty">
          <h3>No binders yet</h3>
          <p>Create a collection to organize your cards.</p>
        </div>
      ) : (
        <div className="collection-list">
          {cols.map((c) => (
            <Link key={c.id} to={`/collections/${c.id}`} className="collection-item">
              <div className="collection-swatch" style={{ background: c.color || '#c9a227' }} />
              <div className="info">
                <h3>
                  {c.name}
                  {c.is_default ? (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 8 }}>
                      default
                    </span>
                  ) : null}
                </h3>
                <div className="meta">
                  {c.total_quantity || 0} cards · {c.card_count || 0} unique
                  {c.description ? ` · ${c.description}` : ''}
                </div>
              </div>
              <div className="value">{formatPrice(c.total_value)}</div>
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <div className="modal-backdrop" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2>New binder</h2>
              <button className="btn ghost sm" type="button" onClick={() => setShowNew(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={create}>
              <div className="form-group">
                <label>Name</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="EDH staples, Trade binder…"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  className="input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="form-group">
                <label>Color</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: c,
                        border: color === c ? '3px solid white' : '3px solid transparent',
                        boxShadow: color === c ? '0 0 0 2px var(--gold)' : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
              <button className="btn primary block" type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create binder'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

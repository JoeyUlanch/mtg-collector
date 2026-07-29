import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatPrice } from '../api';
import { useAuth } from '../auth';

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div className="spinner" style={{ margin: '0 auto' }} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Hey, {user?.display_name || user?.username}</h1>
          <p>Your collection at a glance</p>
        </div>
        <Link to="/settings" className="btn ghost sm">
          ⚙
        </Link>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total value</div>
          <div className="value">{formatPrice(data.total_value)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Cards</div>
          <div className="value">{data.total_quantity}</div>
        </div>
        <div className="stat-card">
          <div className="label">Unique</div>
          <div className="value">{data.unique_cards}</div>
        </div>
        <div className="stat-card">
          <div className="label">Binders</div>
          <div className="value">{data.collections}</div>
        </div>
      </div>

      <div className="btn-row" style={{ marginBottom: 20 }}>
        <Link to="/scan" className="btn primary">
          ◉ Scan card
        </Link>
        <Link to="/search" className="btn secondary">
          ⌕ Find cards
        </Link>
        <Link to="/collections" className="btn secondary">
          ▤ Binders
        </Link>
      </div>

      <h2 className="section-title">Recently added</h2>
      {data.recent?.length ? (
        <div className="h-scroll">
          {data.recent.map((c) => (
            <div
              key={c.id}
              className="mtg-card"
              onClick={() => navigate(`/collections/${c.collection_id}`)}
            >
              <div className="art">
                {c.image_normal || c.image_small ? (
                  <img src={c.image_normal || c.image_small} alt={c.name} loading="lazy" />
                ) : (
                  <div style={{ height: '100%', background: 'var(--bg)' }} />
                )}
                {c.quantity > 1 && <span className="qty-badge">×{c.quantity}</span>}
                {c.foil && <span className="foil-badge">FOIL</span>}
              </div>
              <div className="body">
                <div className="name">{c.name}</div>
                <div className="sub">
                  <span>{c.set_code?.toUpperCase()}</span>
                  <span className="price">{formatPrice(c.unit_price)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel empty" style={{ padding: 28 }}>
          <h3>No cards yet</h3>
          <p>Scan a card or search the catalog to start your collection.</p>
          <Link to="/scan" className="btn primary" style={{ marginTop: 12 }}>
            Scan your first card
          </Link>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <h2 className="section-title">Quick links</h2>
        <div className="collection-list">
          <Link to="/wishlist" className="collection-item">
            <div className="collection-swatch" style={{ background: '#a855f7' }} />
            <div className="info">
              <h3>Wishlist</h3>
              <div className="meta">{data.wishlist_count} cards you want</div>
            </div>
            <span style={{ color: 'var(--text-muted)' }}>→</span>
          </Link>
          <Link to="/search" className="collection-item">
            <div className="collection-swatch" style={{ background: '#3b82f6' }} />
            <div className="info">
              <h3>Search my collection</h3>
              <div className="meta">Find any card you own</div>
            </div>
            <span style={{ color: 'var(--text-muted)' }}>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api, formatPrice } from '../api';

export default function Wishlist() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState([]);
  const [toast, setToast] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api.wishlist(), api.collections()])
      .then(([w, c]) => {
        setItems(w);
        setCollections(c);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const showToast = (m) => {
    setToast(m);
    setTimeout(() => setToast(''), 2500);
  };

  const remove = async (id) => {
    await api.removeWishlist(id);
    load();
  };

  const acquire = async (item) => {
    const col = collections[0];
    if (!col) return showToast('Create a binder first');
    try {
      await api.addCard(col.id, {
        scryfall_id: item.scryfall_id,
        foil: item.foil,
        quantity: 1,
      });
      await api.removeWishlist(item.id);
      showToast(`Added ${item.name} to ${col.name}`);
      load();
    } catch (e) {
      showToast(e.message);
    }
  };

  const total = items.reduce((s, i) => s + (i.price_usd || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Wishlist</h1>
          <p>
            {items.length} cards · ~{formatPrice(total)} to complete
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <h3>Wishlist is empty</h3>
          <p>Star cards from Search or while browsing your binders.</p>
        </div>
      ) : (
        <div className="card-list">
          {items.map((item) => (
            <div key={item.id} className="card-list-item" style={{ cursor: 'default' }}>
              {(item.image_small || item.image_normal) && (
                <img src={item.image_small || item.image_normal} alt="" />
              )}
              <div className="info">
                <h3>
                  {item.foil ? '✨ ' : ''}
                  {item.name}
                </h3>
                <p>
                  {item.set_name} · priority {item.priority}
                  {item.notes ? ` · ${item.notes}` : ''}
                </p>
              </div>
              <div className="right">
                <div className="price">{formatPrice(item.price_usd)}</div>
                <div className="btn-row" style={{ marginTop: 6, justifyContent: 'flex-end' }}>
                  <button className="btn primary sm" type="button" onClick={() => acquire(item)}>
                    Got it
                  </button>
                  <button className="btn ghost sm" type="button" onClick={() => remove(item.id)}>
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

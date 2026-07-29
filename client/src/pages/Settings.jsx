import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatPrice } from '../api';
import { useAuth } from '../auth';

export default function Settings() {
  const { user, logout } = useAuth();
  const [network, setNetwork] = useState(null);
  const [dupes, setDupes] = useState([]);
  const [showDupes, setShowDupes] = useState(false);

  useEffect(() => {
    api.networkInfo().then(setNetwork).catch(() => {});
  }, []);

  const loadDupes = async () => {
    const d = await api.duplicates();
    setDupes(d);
    setShowDupes(true);
  };

  return (
    <div>
      <Link to="/" className="back-link">
        ← Home
      </Link>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Signed in as {user?.display_name} (@{user?.username})</p>
        </div>
      </div>

      <div className="panel">
        <h2>Access on your phone</h2>
        <p className="hint" style={{ marginBottom: 12 }}>
          Connect your phone to the same Wi‑Fi as this computer, then open one of these addresses in Safari or Chrome:
        </p>
        {network?.addresses?.length ? (
          <div className="network-box">
            {network.addresses.map((a) => (
              <div key={a.address} style={{ marginBottom: 8 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{a.interface}</div>
                <a href={a.url}>{a.url}</a>
              </div>
            ))}
          </div>
        ) : (
          <div className="network-box">
            In production mode use the address printed in the server terminal.
            <br />
            Dev mode: <code>http://YOUR-PC-IP:5173</code>
          </div>
        )}
        <p className="hint" style={{ marginTop: 12 }}>
          Tip: For best camera scanning on phone, use HTTPS or localhost. On local network HTTP, some browsers still allow camera after you grant permission.
        </p>
      </div>

      <div className="panel">
        <h2>Tools</h2>
        <div className="btn-row">
          <button className="btn secondary" type="button" onClick={loadDupes}>
            Find duplicates
          </button>
          <Link to="/collections" className="btn secondary">
            Manage binders
          </Link>
        </div>
      </div>

      {showDupes && (
        <div className="panel">
          <h2>
            Duplicates
            <button className="btn ghost sm" type="button" onClick={() => setShowDupes(false)}>
              Close
            </button>
          </h2>
          {dupes.length === 0 ? (
            <p className="hint">No duplicates found across your binders.</p>
          ) : (
            <div className="card-list">
              {dupes.map((d) => (
                <div key={d.scryfall_id} className="card-list-item" style={{ cursor: 'default' }}>
                  {d.image_small && <img src={d.image_small} alt="" />}
                  <div className="info">
                    <h3>{d.name}</h3>
                    <p>
                      ×{d.total_qty} · {d.collections}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <h2>About</h2>
        <p className="hint">
          Card data & USD market prices from{' '}
          <a href="https://scryfall.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            Scryfall
          </a>
          . Prices are estimates and may lag the live market. This app runs entirely on your computer — family
          accounts stay separate.
        </p>
      </div>

      <button className="btn danger block" type="button" onClick={logout}>
        Log out
      </button>
    </div>
  );
}

import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Collections from './pages/Collections';
import CollectionView from './pages/CollectionView';
import Search from './pages/Search';
import Scan from './pages/Scan';
import Wishlist from './pages/Wishlist';
import Settings from './pages/Settings';

function Shell({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const hideNav = location.pathname.startsWith('/scan');

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <span className="brand-text">MTG Collector</span>
        </div>
        <div className="topbar-right">
          <span className="user-chip">{user?.display_name || user?.username}</span>
          <button className="btn ghost sm" onClick={logout} type="button">
            Log out
          </button>
        </div>
      </header>

      <main className="main-content">{children}</main>

      {!hideNav && (
        <nav className="bottom-nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon">⌂</span>
            <span>Home</span>
          </NavLink>
          <NavLink to="/collections" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon">▤</span>
            <span>Binders</span>
          </NavLink>
          <NavLink to="/scan" className={({ isActive }) => `scan-fab ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">◉</span>
            <span>Scan</span>
          </NavLink>
          <NavLink to="/search" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon">⌕</span>
            <span>Search</span>
          </NavLink>
          <NavLink to="/wishlist" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon">☆</span>
            <span>Wish</span>
          </NavLink>
        </nav>
      )}
    </div>
  );
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/collections"
        element={
          <PrivateRoute>
            <Collections />
          </PrivateRoute>
        }
      />
      <Route
        path="/collections/:id"
        element={
          <PrivateRoute>
            <CollectionView />
          </PrivateRoute>
        }
      />
      <Route
        path="/search"
        element={
          <PrivateRoute>
            <Search />
          </PrivateRoute>
        }
      />
      <Route
        path="/scan"
        element={
          <PrivateRoute>
            <Scan />
          </PrivateRoute>
        }
      />
      <Route
        path="/wishlist"
        element={
          <PrivateRoute>
            <Wishlist />
          </PrivateRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <Settings />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

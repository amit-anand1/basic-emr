import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { api, getActor, setActor } from '../api.js';
import { StatusBadge } from './ui.jsx';

/** App frame: top bar + page area. */
export function Shell() {
  const [actor, setActorState] = useState(getActor());
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">+</span> Basic EMR
        </Link>
        <label className="actor">
          Acting as
          <input
            value={actor}
            placeholder="your name"
            onChange={(e) => {
              setActorState(e.target.value);
              setActor(e.target.value);
            }}
          />
        </label>
      </header>
      <Outlet />
    </div>
  );
}

const NAV = [
  ['', 'Overview'],
  ['config', 'Configuration'],
  ['exceptions', 'Exceptions'],
  ['import', 'Data Import'],
  ['patients', 'Patients'],
  ['schedule', 'Schedule'],
  ['integrations', 'Integrations'],
  ['audit', 'Audit Log'],
];

/** Everything inside one environment: sidebar + page. Pages get { env, reloadEnv } via useOutletContext(). */
export function EnvShell() {
  const { envId } = useParams();
  const [env, setEnv] = useState(null);
  const [error, setError] = useState('');

  const reloadEnv = useCallback(() => {
    api(`/environments/${envId}`).then(setEnv).catch((e) => setError(e.message));
  }, [envId]);
  useEffect(reloadEnv, [reloadEnv]);

  if (error) return <div className="page"><div className="alert error">{error}</div><Link to="/">← Back to environments</Link></div>;
  if (!env) return <div className="page muted">Loading…</div>;

  return (
    <div className="env-layout">
      <aside className="sidebar">
        <Link to="/" className="back">← All environments</Link>
        <div className="env-card">
          <div className="env-name">{env.name}</div>
          <StatusBadge value={env.status} />
        </div>
        <nav>
          {NAV.map(([path, label]) => (
            <NavLink key={label} to={`/env/${envId}${path ? `/${path}` : ''}`} end={!path}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="page">
        <Outlet context={{ env, reloadEnv }} />
      </main>
    </div>
  );
}

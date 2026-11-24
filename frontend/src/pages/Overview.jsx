import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Modal, PageHeader, StatusBadge } from '../components/ui.jsx';

const STATUSES = ['Draft', 'Configuring', 'Migrating', 'Validating', 'Ready', 'Live'];
const CARDS = [
  ['locations', 'Locations', 'config/locations'],
  ['departments', 'Departments', 'config/departments'],
  ['providers', 'Providers', 'config/providers'],
  ['appointment-types', 'Appointment types', 'config/appointment-types'],
  ['users', 'Users', 'config/users'],
  ['patients', 'Patients', 'patients'],
  ['appointments', 'Appointments', 'schedule'],
];

/** Page 2 — environment overview: status, organization, counts, recent activity. */
export default function Overview() {
  const { env, reloadEnv } = useOutletContext();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [activity, setActivity] = useState([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const base = `/env/${env._id}`;

  useEffect(() => {
    api(`/environments/${env._id}/summary`).then(setSummary).catch(setError);
    api(`/environments/${env._id}/audit?limit=8`).then(setActivity).catch(() => {});
  }, [env]);

  async function setStatus(status) {
    if (status === env.status) return;
    if (!window.confirm(`Change environment status from ${env.status} to ${status}?`)) return;
    try {
      await api(`/environments/${env._id}/status`, { method: 'POST', body: { status } });
      reloadEnv();
    } catch (e) {
      setError(e);
    }
  }

  async function remove() {
    if (window.prompt(`This permanently deletes the environment and ALL its data.\nType the environment name to confirm:`) !== env.name) return;
    await api(`/environments/${env._id}`, { method: 'DELETE' });
    navigate('/');
  }

  const idx = STATUSES.indexOf(env.status);
  return (
    <div>
      <PageHeader title={env.name} subtitle={[env.organization?.specialty, env.organization?.segment].filter(Boolean).join(' · ')}>
        <button className="btn" onClick={() => setEditing(true)}>Edit details</button>
      </PageHeader>
      <ErrorBox error={error} />

      <section className="card">
        <h3>Environment status</h3>
        <p className="muted small">The EMR records the status but does not enforce gates — deciding when to advance is the orchestration layer's job. Click a step to set it.</p>
        <ol className="stepper">
          {STATUSES.map((s, i) => (
            <li key={s} className={i < idx ? 'done' : i === idx ? 'current' : ''}>
              <button onClick={() => setStatus(s)}>{s}</button>
            </li>
          ))}
        </ol>
      </section>

      {summary?.pendingExceptions > 0 && (
        <div className="alert warn">
          {summary.pendingExceptions} configuration exception(s) awaiting approval. <Link to={`${base}/exceptions`}>Review exceptions →</Link>
        </div>
      )}

      <div className="stat-grid">
        {CARDS.map(([k, label, path]) => (
          <Link key={k} to={`${base}/${path}`} className="stat">
            <div className="stat-value">{summary ? summary.counts[k] : '–'}</div>
            <div className="stat-label">{label}</div>
          </Link>
        ))}
        <Link to={`${base}/import`} className="stat">
          <div className="stat-value">{summary ? summary.imports : '–'}</div>
          <div className="stat-label">Import batches</div>
        </Link>
      </div>

      <div className="two-col">
        <section className="card">
          <h3>Details</h3>
          <dl className="details">
            <dt>Organization</dt><dd>{env.organization?.name}</dd>
            <dt>Template</dt><dd>{summary?.template?.name || 'Blank'}</dd>
            <dt>Target go-live</dt><dd>{env.targetGoLive || '—'}</dd>
            <dt>Created by</dt><dd>{env.createdBy}</dd>
            <dt>Environment ID</dt><dd><code>{env._id}</code></dd>
            <dt>Description</dt><dd>{env.description || '—'}</dd>
          </dl>
          {summary?.template && (
            <>
              <h4>Template standards</h4>
              <ul className="plain">
                {Object.entries(summary.template.standards.appointmentDurations).map(([cat, min]) => (
                  <li key={cat}><code>{cat}</code> = {min} minutes</li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="card">
          <h3>Recent activity</h3>
          {activity.length === 0 && <p className="muted">Nothing yet.</p>}
          <ul className="activity">
            {activity.map((a) => (
              <li key={a._id}>
                <code>{a.action}</code> {a.entityKey && a.entityType !== 'environment' && a.entityType !== 'importBatch' && <strong>{a.entityKey}</strong>}
                <div className="muted small">{a.actor} · {new Date(a.at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
          <Link to={`${base}/audit`}>Full audit log →</Link>
        </section>
      </div>

      <section className="card danger-zone">
        <h3>Danger zone</h3>
        <button className="btn danger" onClick={remove}>Delete environment</button>
      </section>

      {editing && <EditEnv env={env} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reloadEnv(); }} />}
    </div>
  );
}

function EditEnv({ env, onClose, onSaved }) {
  const [v, setV] = useState({
    name: env.name, orgName: env.organization?.name || '', segment: env.organization?.segment || '',
    specialty: env.organization?.specialty || '', targetGoLive: env.targetGoLive || '', description: env.description || '',
  });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    try {
      await api(`/environments/${env._id}`, {
        method: 'PATCH',
        body: {
          name: v.name, targetGoLive: v.targetGoLive, description: v.description,
          organization: { name: v.orgName, segment: v.segment, specialty: v.specialty },
        },
      });
      onSaved();
    } catch (err) {
      setError(err);
    }
  }
  return (
    <Modal title="Edit environment" onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <ErrorBox error={error} />
        <div className="form-grid">
          <div className="field"><label>Environment name</label><input value={v.name} onChange={set('name')} /></div>
          <div className="field"><label>Organization name</label><input value={v.orgName} onChange={set('orgName')} /></div>
          <div className="field"><label>Specialty</label><input value={v.specialty} onChange={set('specialty')} /></div>
          <div className="field"><label>Segment</label><input value={v.segment} onChange={set('segment')} /></div>
          <div className="field"><label>Target go-live</label><input type="date" value={v.targetGoLive} onChange={set('targetGoLive')} /></div>
          <div className="field span-2"><label>Description</label><textarea rows={2} value={v.description} onChange={set('description')} /></div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, PageHeader } from '../components/ui.jsx';

/** Page 8 — outbound activity report export + webhooks (how an orchestrator like Beacon gets notified). */
export default function Integrations() {
  const { env } = useOutletContext();
  const [hooks, setHooks] = useState([]);
  const [form, setForm] = useState({ url: '', events: '*', scope: 'env' });
  const [range, setRange] = useState({ from: '', to: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api(`/webhooks?environmentId=${env._id}`).then(setHooks).catch(setError);
  }, [env._id]);
  useEffect(load, [load]);

  async function add(e) {
    e.preventDefault();
    try {
      await api('/webhooks', {
        method: 'POST',
        body: {
          url: form.url,
          events: form.events.split(',').map((s) => s.trim()).filter(Boolean),
          environmentId: form.scope === 'env' ? env._id : null,
        },
      });
      setForm({ ...form, url: '' });
      setError(null);
      load();
    } catch (err) {
      setError(err);
    }
  }

  async function test(h) {
    const r = await api(`/webhooks/${h._id}/test`, { method: 'POST' });
    setMsg(r.error ? `Test to ${h.url} failed: ${r.error}` : `Test to ${h.url} returned HTTP ${r.status}`);
    load();
  }

  async function remove(h) {
    if (!window.confirm(`Remove webhook ${h.url}?`)) return;
    await api(`/webhooks/${h._id}`, { method: 'DELETE' });
    load();
  }

  const qs = new URLSearchParams(Object.entries(range).filter(([, v]) => v)).toString();
  const exportUrl = `/api/environments/${env._id}/exports/activity-report.csv${qs ? `?${qs}` : ''}`;

  return (
    <div>
      <PageHeader title="Integrations" subtitle="Outbound data and event notifications." />
      <ErrorBox error={error} />

      <section className="card">
        <h3>Daily activity report (CSV)</h3>
        <p className="muted small">Columns: Activity_Date, Location, Provider_ID, Provider_Name, Department, Appointment_Type, Status. UTF-8, comma-delimited.</p>
        <div className="row">
          <label className="inline">From <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
          <label className="inline">To <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
          <a className="btn primary" href={exportUrl}>Download CSV</a>
        </div>
      </section>

      <section className="card">
        <h3>Webhooks</h3>
        <p className="muted small">
          Every audited change is sent as a JSON POST to matching URLs. Events look like <code>patient.created</code>,{' '}
          <code>appointmentType.updated</code>, <code>exception.raised</code>, <code>import.completed</code>,{' '}
          <code>environment.status_changed</code>. Use <code>*</code> for all or a prefix like <code>exception.*</code>.
        </p>
        {msg && <div className="alert info">{msg}</div>}
        <form className="row" onSubmit={add}>
          <input className="grow" placeholder="https://your-orchestrator.example.com/hooks/emr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <input placeholder="events, comma-separated" value={form.events} onChange={(e) => setForm({ ...form, events: e.target.value })} />
          <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
            <option value="env">This environment</option>
            <option value="all">All environments</option>
          </select>
          <button className="btn primary">Add webhook</button>
        </form>
        <div className="table-wrap">
          <table className="compact">
            <thead><tr><th>URL</th><th>Events</th><th>Scope</th><th>Last delivery</th><th /></tr></thead>
            <tbody>
              {hooks.length === 0 && <tr><td colSpan={5} className="empty">No webhooks.</td></tr>}
              {hooks.map((h) => (
                <tr key={h._id}>
                  <td><code>{h.url}</code></td>
                  <td>{h.events.join(', ')}</td>
                  <td>{h.environmentId ? 'This environment' : 'All'}</td>
                  <td className="small">
                    {h.lastDelivery?.at
                      ? <>{h.lastDelivery.event} → {h.lastDelivery.error || `HTTP ${h.lastDelivery.status}`}<div className="muted">{new Date(h.lastDelivery.at).toLocaleString()}</div></>
                      : '—'}
                  </td>
                  <td className="row-actions">
                    <button className="btn small" onClick={() => test(h)}>Send test</button>
                    <button className="btn small danger" onClick={() => remove(h)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h3>API for this environment</h3>
        <p className="muted small">Send an <code>X-Actor</code> header (e.g. <code>beacon</code>) so actions are attributed in the audit log.</p>
        <pre className="code">{`Base:            /api/environments/${env._id}
Records:         GET|POST /{locations|departments|providers|appointment-types|users|patients|appointments}
                 GET|PUT|DELETE /{entity}/{id}
Bulk import:     POST /imports   { entity, rows, mapping?, dryRun? }
Roll back:       POST /imports/{batchId}/rollback
Exceptions:      GET /exceptions?status=Pending   POST /exceptions/{id}/decision { decision, comment }
Status:          POST /status { status }
Audit / events:  GET /audit?since=ISO_DATE
Field schema:    GET /api/schema`}</pre>
      </section>
    </div>
  );
}

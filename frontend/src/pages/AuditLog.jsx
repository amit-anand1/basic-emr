import { Fragment, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, PageHeader } from '../components/ui.jsx';

const TYPES = ['', 'environment', 'location', 'department', 'provider', 'appointmentType', 'user', 'patient', 'appointment', 'exception', 'importBatch'];

/** Page 9 — every change: who, what, when, before/after. */
export default function AuditLog() {
  const { env } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const qs = new URLSearchParams({ limit: '500', ...(entityType && { entityType }), ...(action && { action }) });
    api(`/environments/${env._id}/audit?${qs}`).then(setRows).catch(setError);
  }, [env._id, entityType, action]);

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Every change, with who made it (UI user, seed script, Beacon…) and the before/after values. Click a row for details." />
      <ErrorBox error={error} />
      <div className="toolbar">
        <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          {TYPES.map((t) => <option key={t} value={t}>{t || 'All record types'}</option>)}
        </select>
        <input className="search" placeholder="Filter action, e.g. exception" value={action} onChange={(e) => setAction(e.target.value)} />
        <span className="muted small">{rows.length} entries (newest first)</span>
      </div>
      <div className="table-wrap">
        <table className="compact">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Record</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="empty">No entries.</td></tr>}
            {rows.map((r) => (
              <Fragment key={r._id}>
                <tr className="clickable" onClick={() => setOpen(open === r._id ? null : r._id)}>
                  <td className="nowrap">{new Date(r.at).toLocaleString()}</td>
                  <td>{r.actor}</td>
                  <td><code>{r.action}</code></td>
                  <td>{r.entityKey}</td>
                </tr>
                {open === r._id && (
                  <tr>
                    <td colSpan={4}>
                      <div className="diff">
                        <div><h4>Before</h4><pre className="code">{r.before ? JSON.stringify(r.before, null, 2) : '—'}</pre></div>
                        <div><h4>After</h4><pre className="code">{r.after ? JSON.stringify(r.after, null, 2) : '—'}</pre></div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

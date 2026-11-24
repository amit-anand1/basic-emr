import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Modal, PageHeader, StatusBadge } from '../components/ui.jsx';

/** Page 4 — configuration that deviates from the template standard, awaiting a human decision. */
export default function Exceptions() {
  const { env } = useOutletContext();
  const [status, setStatus] = useState('Pending');
  const [rows, setRows] = useState([]);
  const [deciding, setDeciding] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api(`/environments/${env._id}/exceptions${status ? `?status=${status}` : ''}`).then(setRows).catch(setError);
  }, [env._id, status]);
  useEffect(load, [load]);

  return (
    <div>
      <PageHeader
        title="Exceptions"
        subtitle="Raised automatically when an appointment type's duration differs from the template standard. Approval is a human decision."
      >
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {['Pending', 'Approved', 'Rejected', 'Withdrawn', 'Superseded'].map((s) => <option key={s}>{s}</option>)}
        </select>
      </PageHeader>
      <ErrorBox error={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Raised</th><th>Record</th><th>Field</th><th>Standard</th><th>Requested</th><th>Scope</th><th>Reason</th><th>Status</th><th>Decision</th><th /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="empty">No {status.toLowerCase()} exceptions.</td></tr>}
            {rows.map((x) => (
              <tr key={x._id}>
                <td className="nowrap">{new Date(x.createdAt).toLocaleString()}<div className="muted small">{x.raisedBy}</div></td>
                <td><code>{x.entityKey}</code><div className="muted small">{x.entityType}</div></td>
                <td>{x.field}</td>
                <td>{x.standardValue}</td>
                <td><strong>{x.requestedValue}</strong></td>
                <td>{x.scope}</td>
                <td>{x.reason}</td>
                <td><StatusBadge value={x.status} /></td>
                <td className="small">{x.decidedBy && <>{x.decidedBy}<div className="muted">{x.decisionComment}</div></>}</td>
                <td>{x.status === 'Pending' && <button className="btn small primary" onClick={() => setDeciding(x)}>Decide</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {deciding && (
        <Decide envId={env._id} ex={deciding} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); load(); }} />
      )}
    </div>
  );
}

function Decide({ envId, ex, onClose, onDone }) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState(null);
  async function decide(decision) {
    try {
      await api(`/environments/${envId}/exceptions/${ex._id}/decision`, { method: 'POST', body: { decision, comment } });
      onDone();
    } catch (e) {
      setError(e);
    }
  }
  return (
    <Modal title={`Decide exception for ${ex.entityKey}`} onClose={onClose}>
      <div className="form">
        <ErrorBox error={error} />
        <p>
          <strong>{ex.field}</strong>: template standard is <strong>{ex.standardValue}</strong>, requested <strong>{ex.requestedValue}</strong> ({ex.scope}).
        </p>
        {ex.reason && <p className="muted">Reason given: {ex.reason}</p>}
        <div className="field"><label>Comment</label><textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
        <div className="form-actions">
          <button className="btn danger" onClick={() => decide('Rejected')}>Reject</button>
          <button className="btn primary" onClick={() => decide('Approved')}>Approve</button>
        </div>
      </div>
    </Modal>
  );
}

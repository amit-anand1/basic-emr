import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ENTITY_UI, formatCell } from '../entities.js';
import RecordForm from './RecordForm.jsx';
import BulkImport from './BulkImport.jsx';
import { ErrorBox, Modal, StatusBadge } from './ui.jsx';

const BADGE_COLUMNS = new Set(['approvalStatus', 'status']);

/**
 * Table + add/edit/delete for one entity type. Used by Configuration (all tabs)
 * and by the Patients page.
 */
export default function EntityManager({ envId, entity, rowLink, onChange, bulk = false }) {
  const ui = ENTITY_UI[entity];
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | record
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api(`/environments/${envId}/${entity}${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      .then(setRows)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [envId, entity, q]);
  useEffect(load, [load]);

  async function remove(row) {
    if (!window.confirm(`Delete ${ui.singular} "${row[ui.key]}"?`)) return;
    try {
      await api(`/environments/${envId}/${entity}/${encodeURIComponent(row[ui.key])}`, { method: 'DELETE' });
      setError(null);
      load();
      onChange?.();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <input className="search" placeholder={`Search ${ui.label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted small">{loading ? 'Loading…' : `${rows.length} record(s)`}</span>
        <div className="spacer" />
        {bulk && <button className="btn" onClick={() => setBulkOpen(true)}>⇪ Bulk import from Excel</button>}
        <button className="btn primary" onClick={() => setEditing('new')}>+ Add {ui.singular}</button>
      </div>
      <ErrorBox error={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {ui.columns.map(([k, label]) => <th key={k}>{label}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={ui.columns.length + 1} className="empty">No {ui.label.toLowerCase()} yet.</td></tr>
            )}
            {rows.map((row) => (
              <tr key={row._id}>
                {ui.columns.map(([k], i) => (
                  <td key={k}>
                    {BADGE_COLUMNS.has(k) ? <StatusBadge value={row[k]} />
                      : i === 0 && rowLink ? <Link to={rowLink(row)}>{formatCell(row[k])}</Link>
                        : formatCell(row[k])}
                  </td>
                ))}
                <td className="row-actions">
                  <button className="btn small" onClick={() => setEditing(row)}>Edit</button>
                  <button className="btn small danger" onClick={() => remove(row)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bulkOpen && (
        <BulkImport
          envId={envId}
          entity={entity}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            load();
            onChange?.();
          }}
        />
      )}
      {editing && (
        <Modal title={editing === 'new' ? `Add ${ui.singular}` : `Edit ${ui.singular} ${editing[ui.key]}`} onClose={() => setEditing(null)} wide>
          <RecordForm
            envId={envId}
            entity={entity}
            ui={ui}
            record={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
              onChange?.();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

import { useEffect } from 'react';

const TONES = {
  Draft: 'gray', Configuring: 'blue', Migrating: 'blue', Validating: 'amber', Ready: 'green', Live: 'green',
  Standard: 'gray', 'Pending approval': 'amber', 'Approved exception': 'green', Rejected: 'red',
  Pending: 'amber', Approved: 'green', Withdrawn: 'gray', Superseded: 'gray',
  Completed: 'green', 'Dry run': 'blue', 'Rolled back': 'gray',
  Scheduled: 'blue', 'Checked in': 'amber', Cancelled: 'gray', 'No-show': 'red',
  loaded: 'green', ok: 'green', rejected: 'red',
};

export function StatusBadge({ value }) {
  if (!value) return null;
  return <span className={`badge ${TONES[value] || 'gray'}`}>{value}</span>;
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Shows an API error, including the field-level integrity details. */
export function ErrorBox({ error }) {
  if (!error) return null;
  const details = Array.isArray(error.details) ? error.details : null;
  return (
    <div className="alert error">
      <strong>{error.message}</strong>
      {details && (
        <ul>
          {details.map((d, i) => (
            <li key={i}>
              {d.message || `${d.entity}: ${d.count} record(s) via ${d.field}`}
              {d.code && <code className="code-tag">{d.code}</code>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}

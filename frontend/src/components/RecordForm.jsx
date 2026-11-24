import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { OPTION_LABEL, OPTION_VALUE } from '../entities.js';
import { ErrorBox } from './ui.jsx';

/** Loads dropdown options for the given source entities, e.g. ['locations','providers']. */
export function useOptions(envId, sources) {
  const key = [...new Set(sources)].sort().join(',');
  const [options, setOptions] = useState({});
  useEffect(() => {
    if (!key) return;
    let alive = true;
    Promise.all(
      key.split(',').map((s) => api(`/environments/${envId}/${s}`).then((rows) => [s, rows])),
    ).then((pairs) => {
      if (!alive) return;
      const out = {};
      for (const [s, rows] of pairs) {
        out[s] = rows.map((r) => ({ value: r[OPTION_VALUE[s]], label: OPTION_LABEL[s](r), row: r }));
      }
      setOptions(out);
    });
    return () => {
      alive = false;
    };
  }, [envId, key]);
  return options;
}

function initialValues(fields, record) {
  const v = {};
  for (const f of fields) {
    if (record && record[f.name] !== undefined && record[f.name] !== null) v[f.name] = record[f.name];
    else if (f.default !== undefined) v[f.name] = f.default;
    else v[f.name] = f.type === 'multiselect' ? [] : f.type === 'checkbox' ? false : '';
  }
  return v;
}

/**
 * Generic create/edit form for any entity in ENTITY_UI.
 * Submits to the API and shows the backend's integrity errors next to the fields.
 */
export default function RecordForm({ envId, entity, ui, record, defaults, onSaved, onCancel }) {
  const isEdit = !!record;
  const fields = ui.fields;
  const sources = useMemo(() => fields.filter((f) => f.source).map((f) => f.source), [fields]);
  const options = useOptions(envId, sources);
  const [values, setValues] = useState(() => ({ ...initialValues(fields, record), ...(defaults || {}) }));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const fieldErrors = {};
  (error?.details || []).forEach((d) => {
    if (d.field) fieldErrors[d.field] = d.message;
  });

  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { ...values };
      if (body.durationMinutes !== undefined && body.durationMinutes !== '') body.durationMinutes = Number(body.durationMinutes);
      const saved = isEdit
        ? await api(`/environments/${envId}/${entity}/${encodeURIComponent(record[ui.key])}`, { method: 'PUT', body })
        : await api(`/environments/${envId}/${entity}`, { method: 'POST', body });
      onSaved?.(saved);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="form">
      <ErrorBox error={error} />
      <div className="form-grid">
        {fields.map((f) => {
          const disabled = isEdit && f.name === ui.key;
          const common = { id: `f-${f.name}`, disabled };
          let input;
          if (f.type === 'checkbox') {
            input = <input type="checkbox" {...common} checked={!!values[f.name]} onChange={(e) => set(f.name, e.target.checked)} />;
          } else if (f.type === 'select') {
            const opts = f.options ? f.options.map((o) => ({ value: o, label: o })) : options[f.source] || [];
            input = (
              <select {...common} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)}>
                <option value="">{f.required ? '— select —' : '— none —'}</option>
                {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                {values[f.name] && !opts.some((o) => o.value === values[f.name]) && (
                  <option value={values[f.name]}>{values[f.name]} (not configured)</option>
                )}
              </select>
            );
          } else if (f.type === 'multiselect') {
            const opts = options[f.source] || [];
            const selected = values[f.name] || [];
            input = (
              <div className="checks">
                {opts.length === 0 && <span className="muted small">No {f.source} configured yet</span>}
                {opts.map((o) => (
                  <label key={o.value} className="check">
                    <input
                      type="checkbox"
                      checked={selected.includes(o.value)}
                      onChange={(e) => set(f.name, e.target.checked ? [...selected, o.value] : selected.filter((x) => x !== o.value))}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            );
          } else if (f.type === 'textarea') {
            input = <textarea {...common} rows={2} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} />;
          } else {
            input = (
              <input
                {...common}
                type={f.type || 'text'}
                placeholder={f.placeholder}
                value={values[f.name] ?? ''}
                onChange={(e) => set(f.name, e.target.value)}
              />
            );
          }
          return (
            <div key={f.name} className={`field ${f.type === 'multiselect' || f.type === 'textarea' ? 'span-2' : ''} ${fieldErrors[f.name] ? 'has-error' : ''}`}>
              <label htmlFor={common.id}>
                {f.label}
                {f.required && <span className="req">*</span>}
              </label>
              {input}
              {fieldErrors[f.name] && <div className="field-error">{fieldErrors[f.name]}</div>}
            </div>
          );
        })}
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save changes' : `Add ${ui.singular}`}</button>
      </div>
    </form>
  );
}

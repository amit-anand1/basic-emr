import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import Papa from 'papaparse';
import { api } from '../api.js';
import { ErrorBox, PageHeader, StatusBadge } from '../components/ui.jsx';
import { autoMap, readSheet } from '../importUtils.js';

const IMPORTABLE = ['patients', 'appointments', 'providers', 'locations', 'departments', 'appointment-types', 'users'];
function guessEntity(fileName) {
  const n = fileName.toLowerCase();
  if (n.includes('appointment')) return 'appointments';
  if (n.includes('demograph') || n.includes('patient')) return 'patients';
  if (n.includes('provider') || n.includes('roster')) return 'providers';
  if (n.includes('department')) return 'departments';
  if (n.includes('location')) return 'locations';
  if (n.includes('user')) return 'users';
  return null;
}

/**
 * Page 5 — Data import (migration).
 * Upload CSV → map columns → (optionally pick a subset) → dry run or load.
 * The EMR applies only integrity guardrails; business validation is expected upstream (Beacon).
 */
export default function DataImport() {
  const { env } = useOutletContext();
  const [schema, setSchema] = useState(null);
  const [entity, setEntity] = useState('patients');
  const [file, setFile] = useState(null); // { name, headers, rows }
  const [mapping, setMapping] = useState({});
  const [filter, setFilter] = useState({ column: '', value: '' });
  const [result, setResult] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [batches, setBatches] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/schema').then(setSchema).catch(setError);
  }, []);
  const loadBatches = useCallback(() => {
    api(`/environments/${env._id}/imports`).then(setBatches).catch(setError);
  }, [env._id]);
  useEffect(loadBatches, [loadBatches]);

  const fields = useMemo(() => schema?.entities.find((e) => e.entity === entity)?.fields || [], [schema, entity]);

  useEffect(() => {
    if (file) setMapping(autoMap(file.headers, fields));
  }, [file, fields]);

  function loaded(name, headers, rows, lines) {
    const guessed = guessEntity(name);
    if (guessed) setEntity(guessed);
    setFilter({ column: '', value: '' });
    setFile({ name, headers, rows, lines });
  }

  function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setResult(null);
    setError(null);
    if (/\.xlsx?$/i.test(f.name)) {
      readSheet(f)
        .then(({ headers, rows }) => loaded(f.name, headers, rows.map((r) => r.row), rows.map((r) => r.line)))
        .catch(setError);
      return;
    }
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => loaded(f.name, res.meta.fields || [], res.data, res.data.map((_, i) => i + 2)),
      error: (err) => setError(err),
    });
  }

  // rows to send, with original CSV line numbers (header = line 1)
  const selected = useMemo(() => {
    if (!file) return [];
    return file.rows
      .map((row, i) => ({ row, line: file.lines[i] }))
      .filter(({ row }) => !filter.column || String(row[filter.column] ?? '') === filter.value);
  }, [file, filter]);

  const filterValues = useMemo(() => {
    if (!file || !filter.column) return [];
    return [...new Set(file.rows.map((r) => String(r[filter.column] ?? '')))].sort();
  }, [file, filter.column]);

  const missingRequired = fields.filter((f) => f.required && !mapping[f.name]);

  async function run(dryRun) {
    setBusy(true);
    setError(null);
    try {
      const sourceToTarget = {};
      Object.entries(mapping).forEach(([target, src]) => {
        if (src) sourceToTarget[src] = target;
      });
      const batch = await api(`/environments/${env._id}/imports`, {
        method: 'POST',
        body: {
          entity,
          sourceName: file.name + (filter.column ? ` [${filter.column}=${filter.value}]` : ''),
          rows: selected.map((s) => s.row),
          rowNumbers: selected.map((s) => s.line),
          mapping: sourceToTarget,
          dryRun,
        },
      });
      setResult(batch);
      loadBatches();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function view(b) {
    setResult(await api(`/environments/${env._id}/imports/${b._id}`));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function rollback(b) {
    if (!window.confirm(`Roll back this import? It deletes the ${b.summary.loaded} ${b.entity} record(s) it created.`)) return;
    try {
      await api(`/environments/${env._id}/imports/${b._id}/rollback`, { method: 'POST' });
      setError(null);
      loadBatches();
    } catch (e) {
      setError(e);
    }
  }

  const shown = result ? result.results.filter((r) => showAll || r.status === 'rejected') : [];

  return (
    <div>
      <PageHeader title="Data Import" subtitle="Load a client's existing data into the configured environment. Import configuration first, then patients, then appointments." />
      <div className="callout">
        This EMR checks <strong>integrity only</strong>: required fields, readable dates/times, duplicate IDs and references to
        configuration that exists. Business rules (future birth dates, invalid states, missing NPI, unapproved exceptions…) are
        not checked here — they belong in the validation layer before data is sent.
      </div>
      <ErrorBox error={error} />

      <section className="card">
        <h3>1. Choose file and record type</h3>
        <div className="row">
          <label className="btn primary file-btn">
            Choose CSV or Excel file…
            <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile} hidden />
          </label>
          {file && <span><strong>{file.name}</strong> — {file.rows.length} rows, {file.headers.length} columns</span>}
          <div className="spacer" />
          <label className="inline">
            Import as
            <select value={entity} onChange={(e) => setEntity(e.target.value)}>
              {IMPORTABLE.map((x) => <option key={x} value={x}>{schema?.entities.find((s) => s.entity === x)?.label || x}</option>)}
            </select>
          </label>
        </div>
      </section>

      {file && (
        <>
          <section className="card">
            <h3>2. Map columns</h3>
            <p className="muted small">Columns were matched automatically by name. Fix any that are wrong. Fields marked * are required.</p>
            <div className="table-wrap">
              <table className="compact">
                <thead><tr><th>EMR field</th><th>Source column</th><th>Sample value</th></tr></thead>
                <tbody>
                  {fields.map((f) => (
                    <tr key={f.name} className={f.required && !mapping[f.name] ? 'warn-row' : ''}>
                      <td>{f.label}{f.required && <span className="req">*</span>} <code className="muted small">{f.name}</code></td>
                      <td>
                        <select value={mapping[f.name] || ''} onChange={(e) => setMapping({ ...mapping, [f.name]: e.target.value })}>
                          <option value="">— not mapped —</option>
                          {file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </td>
                      <td className="muted">{mapping[f.name] ? String(file.rows[0]?.[mapping[f.name]] ?? '') : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h3>3. Choose rows (optional)</h3>
            <p className="muted small">Load only part of the file, for example one location's department. Leave blank to send every row.</p>
            <div className="row">
              <select value={filter.column} onChange={(e) => setFilter({ column: e.target.value, value: '' })}>
                <option value="">All rows</option>
                {file.headers.map((h) => <option key={h} value={h}>Only rows where {h} =</option>)}
              </select>
              {filter.column && (
                <select value={filter.value} onChange={(e) => setFilter({ ...filter, value: e.target.value })}>
                  {filterValues.map((v) => <option key={v} value={v}>{v === '' ? '(blank)' : v}</option>)}
                </select>
              )}
              <span className="muted">{selected.length} row(s) will be sent</span>
            </div>
          </section>

          <section className="card">
            <h3>4. Run</h3>
            {missingRequired.length > 0 && (
              <p className="muted small">Not mapped: {missingRequired.map((f) => f.label).join(', ')} — rows will be rejected as REQUIRED.</p>
            )}
            <div className="row">
              <button className="btn" disabled={busy || !selected.length} onClick={() => run(true)}>Dry run (check only)</button>
              <button className="btn primary" disabled={busy || !selected.length} onClick={() => run(false)}>
                {busy ? 'Working…' : `Load ${selected.length} row(s)`}
              </button>
            </div>
          </section>
        </>
      )}

      {result && (
        <section className="card">
          <div className="row">
            <h3>Result — {result.entity} from {result.sourceName}</h3>
            <StatusBadge value={result.status} />
          </div>
          <div className="pills">
            <span className="pill">Total {result.summary.total}</span>
            <span className="pill green">{result.dryRun ? 'Would load' : 'Loaded'} {result.dryRun ? result.summary.total - result.summary.rejected : result.summary.loaded}</span>
            <span className="pill red">Rejected {result.summary.rejected}</span>
            {!result.dryRun && result.entity === 'patients' && <Link to={`/env/${env._id}/patients`}>View patients →</Link>}
            {!result.dryRun && result.entity === 'appointments' && <Link to={`/env/${env._id}/schedule`}>View schedule →</Link>}
          </div>
          <label className="check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show accepted rows too</label>
          <div className="table-wrap">
            <table className="compact">
              <thead><tr><th>Line</th><th>Record ID</th><th>Outcome</th><th>Reasons</th></tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={4} className="empty">No rejected rows.</td></tr>}
                {shown.map((r) => (
                  <tr key={`${r.rowNumber}-${r.key}`}>
                    <td>{r.rowNumber}</td>
                    <td><code>{r.key}</code></td>
                    <td><StatusBadge value={r.status} /></td>
                    <td>{r.errors.map((e, i) => <div key={i}><code className="code-tag">{e.code}</code> {e.message}</div>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h3>Import history</h3>
        <div className="table-wrap">
          <table className="compact">
            <thead><tr><th>When</th><th>Type</th><th>Source</th><th>Total</th><th>Loaded</th><th>Rejected</th><th>Status</th><th>By</th><th /></tr></thead>
            <tbody>
              {batches.length === 0 && <tr><td colSpan={9} className="empty">No imports yet.</td></tr>}
              {batches.map((b) => (
                <tr key={b._id}>
                  <td className="nowrap">{new Date(b.createdAt).toLocaleString()}</td>
                  <td>{b.entity}</td>
                  <td>{b.sourceName}</td>
                  <td>{b.summary?.total}</td>
                  <td>{b.summary?.loaded}</td>
                  <td>{b.summary?.rejected}</td>
                  <td><StatusBadge value={b.status} /></td>
                  <td className="small">{b.actor}</td>
                  <td className="row-actions">
                    <button className="btn small" onClick={() => view(b)}>View</button>
                    {b.status === 'Completed' && <button className="btn small danger" onClick={() => rollback(b)}>Roll back</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

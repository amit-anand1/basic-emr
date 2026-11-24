import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { OPTION_VALUE } from '../entities.js';
import { autoMap, downloadTemplate, getSchema, readSheet } from '../importUtils.js';
import { ErrorBox, Modal } from './ui.jsx';

/**
 * Bulk add records of one type from an Excel (or CSV) sheet.
 *  1. Download template   2. Upload filled sheet
 *  3. Every row is checked first (dry run) — faulty rows are listed with their sheet row number
 *  4. "Add N valid records" loads the good rows and skips the faulty ones
 * Each load is a normal import batch, so it can be rolled back from the Data Import page.
 */
export default function BulkImport({ envId, entity, onClose, onDone }) {
  const [schema, setSchema] = useState(null);
  const [phase, setPhase] = useState('start'); // start | checking | preview | adding | done
  const [sheet, setSheet] = useState(null); // { fileName, headers, rows, mapping }
  const [check, setCheck] = useState(null); // dry-run batch
  const [result, setResult] = useState(null); // real batch
  const [error, setError] = useState(null);

  useEffect(() => {
    getSchema().then((s) => setSchema(s.entities.find((e) => e.entity === entity))).catch(setError);
  }, [entity]);

  async function template() {
    try {
      // Put the currently configured codes into the Instructions sheet for reference columns.
      const refs = [...new Set(schema.fields.filter((f) => f.ref).map((f) => f.ref))];
      const refValues = {};
      await Promise.all(refs.map(async (r) => {
        const rows = await api(`/environments/${envId}/${r}`);
        refValues[r] = rows.map((x) => x[OPTION_VALUE[r]]).slice(0, 50);
      }));
      downloadTemplate(schema, refValues);
    } catch (e) {
      setError(e);
    }
  }

  function body(dryRun) {
    const sourceToTarget = {};
    Object.entries(sheet.mapping).forEach(([target, src]) => { sourceToTarget[src] = target; });
    return {
      entity,
      sourceName: `${sheet.fileName} (bulk ${schema.label.toLowerCase()})`,
      rows: sheet.rows.map((r) => r.row),
      rowNumbers: sheet.rows.map((r) => r.line),
      mapping: sourceToTarget,
      dryRun,
    };
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setCheck(null);
    setResult(null);
    setPhase('checking');
    try {
      const { headers, rows } = await readSheet(file);
      if (!rows.length) throw new Error('The sheet has no data rows. Fill the first sheet starting at row 2, below the header.');
      const mapping = autoMap(headers, schema.fields);
      const s = { fileName: file.name, headers, rows, mapping };
      setSheet(s);
      const sourceToTarget = {};
      Object.entries(mapping).forEach(([t, src]) => { sourceToTarget[src] = t; });
      const batch = await api(`/environments/${envId}/imports`, {
        method: 'POST',
        body: {
          entity, sourceName: file.name, rows: rows.map((r) => r.row), rowNumbers: rows.map((r) => r.line),
          mapping: sourceToTarget, dryRun: true,
        },
      });
      setCheck(batch);
      setPhase('preview');
    } catch (err) {
      setError(err);
      setPhase('start');
    }
  }

  async function add() {
    setPhase('adding');
    setError(null);
    try {
      const batch = await api(`/environments/${envId}/imports`, { method: 'POST', body: body(false) });
      setResult(batch);
      setPhase('done');
      onDone?.();
    } catch (err) {
      setError(err);
      setPhase('preview');
    }
  }

  if (!schema) return <Modal title="Bulk import" onClose={onClose}><ErrorBox error={error} /><p className="muted">Loading…</p></Modal>;

  const mappedHeaders = new Set(Object.values(sheet?.mapping || {}));
  const ignored = sheet ? sheet.headers.filter((h) => !mappedHeaders.has(h)) : [];
  const missingRequired = sheet ? schema.fields.filter((f) => f.required && !sheet.mapping[f.name]) : [];
  const shown = result || check;
  const faulty = shown ? shown.results.filter((r) => r.status === 'rejected') : [];
  const valid = shown ? shown.results.length - faulty.length : 0;

  return (
    <Modal title={`Bulk import — ${schema.label}`} onClose={onClose} wide>
      <ErrorBox error={error} />

      <div className="bulk-steps">
        <div className="bulk-step">
          <div className="bulk-num">1</div>
          <div>
            <strong>Download the template</strong>
            <p className="muted small">An Excel file with the right columns, plus an Instructions sheet listing required fields, formats and the codes already configured.</p>
            <button className="btn" onClick={template}>⬇ Download {schema.label.toLowerCase()} template (.xlsx)</button>
          </div>
        </div>
        <div className="bulk-step">
          <div className="bulk-num">2</div>
          <div>
            <strong>Upload the filled sheet</strong>
            <p className="muted small">.xlsx, .xls or .csv. Every row is checked before anything is added.</p>
            <label className={`btn primary file-btn ${phase === 'checking' || phase === 'adding' ? 'disabled' : ''}`}>
              {phase === 'checking' ? 'Checking rows…' : sheet ? 'Upload a different file…' : 'Upload sheet…'}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} hidden disabled={phase === 'checking' || phase === 'adding'} />
            </label>
            {sheet && <span className="small" style={{ marginLeft: 10 }}><strong>{sheet.fileName}</strong> — {sheet.rows.length} data row(s)</span>}
          </div>
        </div>
      </div>

      {sheet && (ignored.length > 0 || missingRequired.length > 0) && (
        <div className="alert warn small">
          {missingRequired.length > 0 && <div>Missing required column(s): <strong>{missingRequired.map((f) => f.label).join(', ')}</strong> — every row will fail. Use the template headers.</div>}
          {ignored.length > 0 && <div>Column(s) not recognised and ignored: {ignored.join(', ')}</div>}
        </div>
      )}

      {shown && (
        <div className="card bulk-result">
          {phase === 'done' ? (
            <h3>✓ Added {result.summary.loaded} record(s){faulty.length ? ` — ${faulty.length} faulty row(s) skipped` : ''}</h3>
          ) : (
            <h3>Check result</h3>
          )}
          <div className="pills">
            <span className="pill">Rows {shown.summary.total}</span>
            <span className="pill green">{phase === 'done' ? 'Added' : 'Ready to add'} {valid}</span>
            <span className="pill red">{phase === 'done' ? 'Skipped' : 'With errors'} {faulty.length}</span>
          </div>
          {faulty.length > 0 ? (
            <>
              <p className="small muted">
                {phase === 'done' ? 'These rows were not added. Fix them in the sheet and upload again — rows already added will show as duplicates.' : 'These rows will be skipped. Everything else will be added.'}
              </p>
              <div className="table-wrap">
                <table className="compact">
                  <thead><tr><th>Row no.</th><th>Record ID</th><th>Problem</th></tr></thead>
                  <tbody>
                    {faulty.map((r) => (
                      <tr key={r.rowNumber} className="warn-row">
                        <td><strong>{r.rowNumber}</strong></td>
                        <td><code>{r.key || '(blank)'}</code></td>
                        <td>{r.errors.map((e, i) => <div key={i}><code className="code-tag">{e.code}</code> {e.message}</div>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            phase !== 'done' && <p className="small">No problems found — all rows can be added.</p>
          )}
        </div>
      )}

      <div className="form-actions">
        <button className="btn" onClick={onClose}>{phase === 'done' ? 'Close' : 'Cancel'}</button>
        {phase !== 'done' && check && (
          <button className="btn primary" disabled={!valid || phase === 'adding'} onClick={add}>
            {phase === 'adding' ? 'Adding…' : valid ? `Add ${valid} valid record(s)${faulty.length ? `, skip ${faulty.length}` : ''}` : 'Nothing to add'}
          </button>
        )}
      </div>
    </Modal>
  );
}

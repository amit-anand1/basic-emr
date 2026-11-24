import { Router } from 'express';
import { ImportBatch } from '../models/index.js';
import { getEntity } from '../services/registry.js';
import { loadRefs, prepare, findDependents } from '../services/integrity.js';
import { evaluateAppointmentType } from '../services/exceptions.js';
import { record } from '../services/audit.js';
import { ah, actorOf, HttpError } from '../utils.js';

/**
 * Bulk load (data migration).
 *
 * POST /api/environments/:envId/imports
 * {
 *   "entity": "patients" | "appointments" | "providers" | ... ,
 *   "rows": [ { ...source row... } ],
 *   "mapping": { "Patient_ID": "patientId", ... },   // optional: source column -> EMR field
 *   "rowNumbers": [2, 3, ...],                       // optional: original line numbers for reporting
 *   "sourceName": "Synthetic_Demographics.csv",       // optional
 *   "dryRun": false                                   // true = check only, write nothing
 * }
 *
 * Only the integrity guardrails run here. Rows that pass are loaded, rows that
 * fail are rejected with reasons. Business validation and deciding WHICH rows
 * to send is left to the caller (e.g. Beacon).
 */
const router = Router({ mergeParams: true });

function applyMapping(row, mapping) {
  if (!mapping) return row;
  const out = {};
  for (const [src, target] of Object.entries(mapping)) {
    if (target) out[target] = row[src];
  }
  return out;
}

router.post('/', ah(async (req, res) => {
  const { env } = req;
  const actor = actorOf(req);
  const { entity, rows, mapping, rowNumbers, sourceName, dryRun = false } = req.body || {};
  const def = getEntity(entity);
  if (!def) throw new HttpError(400, `Unknown entity "${entity}"`);
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, '"rows" must be a non-empty array');
  if (rows.length > 50000) throw new HttpError(413, 'Maximum 50,000 rows per import');

  const batch = new ImportBatch({ environmentId: env._id, entity, sourceName: sourceName || 'api', dryRun: !!dryRun, actor });
  const refs = await loadRefs(env._id, entity);
  const results = [];
  const docs = [];
  const docResultIdx = [];

  rows.forEach((row, i) => {
    const rowNumber = Array.isArray(rowNumbers) && rowNumbers[i] ? rowNumbers[i] : i + 2;
    const { data, errors } = prepare(entity, applyMapping(row, mapping), refs, { mode: 'create' });
    const key = data[def.key] ?? '';
    if (errors.length) {
      results.push({ rowNumber, key, status: 'rejected', errors });
      return;
    }
    refs.keys[entity].add(key); // catches duplicates inside the same file
    results.push({ rowNumber, key, status: dryRun ? 'ok' : 'loaded', errors: [] });
    if (!dryRun) {
      docs.push({ ...data, environmentId: env._id, importBatchId: batch._id });
      docResultIdx.push(results.length - 1);
    }
  });

  if (docs.length) {
    try {
      await def.model.insertMany(docs, { ordered: false });
    } catch (e) {
      const writeErrors = e.writeErrors || e.result?.writeErrors;
      if (!writeErrors) throw e;
      for (const we of writeErrors) {
        const idx = we.index ?? we.err?.index;
        const r = results[docResultIdx[idx]];
        if (r) Object.assign(r, { status: 'rejected', errors: [{ field: def.key, code: 'DB_ERROR', message: we.errmsg || we.err?.errmsg || 'Write failed' }] });
      }
    }
    if (entity === 'appointment-types') {
      const created = await def.model.find({ importBatchId: batch._id });
      for (const t of created) await evaluateAppointmentType(env, t, actor);
    }
  }

  const loaded = results.filter((r) => r.status !== 'rejected').length;
  batch.results = results;
  batch.summary = { total: rows.length, loaded: dryRun ? 0 : loaded, rejected: rows.length - loaded };
  batch.status = dryRun ? 'Dry run' : 'Completed';
  await batch.save();
  await record({
    environmentId: env._id, actor, action: dryRun ? 'import.dry_run' : 'import.completed',
    entityType: 'importBatch', entityKey: String(batch._id),
    after: { entity, sourceName: batch.sourceName, summary: batch.summary },
  });
  res.status(201).json(batch);
}));

router.get('/', ah(async (req, res) => {
  const items = await ImportBatch.find({ environmentId: req.env._id }).select('-results').sort({ createdAt: -1 }).lean();
  res.json(items);
}));

router.get('/:batchId', ah(async (req, res) => {
  const batch = await ImportBatch.findOne({ _id: req.params.batchId, environmentId: req.env._id }).lean();
  if (!batch) throw new HttpError(404, 'Import batch not found');
  res.json(batch);
}));

router.post('/:batchId/rollback', ah(async (req, res) => {
  const { env } = req;
  const batch = await ImportBatch.findOne({ _id: req.params.batchId, environmentId: env._id });
  if (!batch) throw new HttpError(404, 'Import batch not found');
  if (batch.status !== 'Completed') throw new HttpError(400, `Only completed imports can be rolled back (this one is "${batch.status}")`);
  const def = getEntity(batch.entity);
  const keys = (await def.model.find({ importBatchId: batch._id }).select(def.key).lean()).map((d) => d[def.key]);
  const deps = await findDependents(env._id, batch.entity, keys, { excludeBatchId: batch._id });
  if (deps.length) {
    throw new HttpError(409, 'Cannot roll back: records from other imports or manual entry reference this batch. Roll those back first.', deps);
  }
  const { deletedCount } = await def.model.deleteMany({ environmentId: env._id, importBatchId: batch._id });
  batch.status = 'Rolled back';
  batch.rolledBackAt = new Date();
  batch.rolledBackBy = actorOf(req);
  await batch.save();
  await record({
    environmentId: env._id, actor: actorOf(req), action: 'import.rolled_back',
    entityType: 'importBatch', entityKey: String(batch._id), after: { entity: batch.entity, deletedCount },
  });
  res.json({ ok: true, deletedCount });
}));

export default router;

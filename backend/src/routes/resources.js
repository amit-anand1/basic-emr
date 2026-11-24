import { Router } from 'express';
import { getEntity } from '../services/registry.js';
import { loadRefs, prepare, findDependents } from '../services/integrity.js';
import { evaluateAppointmentType } from '../services/exceptions.js';
import { record } from '../services/audit.js';
import { ah, actorOf, plain, HttpError } from '../utils.js';

/**
 * Generic CRUD for every record type in the registry:
 *   GET    /api/environments/:envId/:entity            list (filters: any field, q=search, from/to for appointments)
 *   GET    /api/environments/:envId/:entity/:key       one record
 *   POST   /api/environments/:envId/:entity            create
 *   PUT    /api/environments/:envId/:entity/:key       update (partial body allowed)
 *   DELETE /api/environments/:envId/:entity/:key       delete (blocked if referenced)
 */
const router = Router({ mergeParams: true });

router.use(
  '/:entity',
  (req, res, next) => {
    const def = getEntity(req.params.entity);
    if (!def) return next('router');
    req.entityName = req.params.entity;
    req.def = def;
    next();
  },
);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/:entity', ah(async (req, res) => {
  const { def } = req;
  const q = { environmentId: req.env._id };
  for (const fl of def.fields) {
    if (req.query[fl.name] !== undefined && req.query[fl.name] !== '') q[fl.name] = req.query[fl.name];
  }
  if (req.query.importBatchId) q.importBatchId = req.query.importBatchId;
  if (req.query.q) {
    const re = new RegExp(escapeRe(String(req.query.q)), 'i');
    q.$or = def.searchFields.map((s) => ({ [s]: re }));
  }
  if (req.entityName === 'appointments' && (req.query.from || req.query.to)) {
    q.date = { ...(req.query.from && { $gte: req.query.from }), ...(req.query.to && { $lte: req.query.to }) };
  }
  const limit = Math.min(Number(req.query.limit) || 2000, 10000);
  const items = await def.model.find(q).sort(def.sort || { [def.key]: 1 }).limit(limit).lean();
  res.json(items);
}));

router.get('/:entity/:key', ah(async (req, res) => {
  const doc = await req.def.model.findOne({ environmentId: req.env._id, [req.def.key]: req.params.key }).lean();
  if (!doc) throw new HttpError(404, `${req.def.label} record "${req.params.key}" not found`);
  res.json(doc);
}));

router.post('/:entity', ah(async (req, res) => {
  const { def, entityName, env } = req;
  const actor = actorOf(req);
  const refs = await loadRefs(env._id, entityName);
  const { data, errors } = prepare(entityName, req.body || {}, refs, { mode: 'create' });
  if (errors.length) throw new HttpError(422, 'Integrity check failed', errors);

  const doc = await def.model.create({ ...data, environmentId: env._id });
  await record({
    environmentId: env._id, actor, action: `${def.entityType}.created`,
    entityType: def.entityType, entityKey: data[def.key], after: plain(doc),
  });
  if (entityName === 'appointment-types') await evaluateAppointmentType(env, doc, actor, req.body.exceptionReason);
  res.status(201).json(await def.model.findById(doc._id).lean());
}));

router.put('/:entity/:key', ah(async (req, res) => {
  const { def, entityName, env } = req;
  const actor = actorOf(req);
  const doc = await def.model.findOne({ environmentId: env._id, [def.key]: req.params.key });
  if (!doc) throw new HttpError(404, `${def.label} record "${req.params.key}" not found`);

  const before = plain(doc);
  const merged = { ...before, ...(req.body || {}) };
  const refs = await loadRefs(env._id, entityName);
  const { data, errors } = prepare(entityName, merged, refs, { mode: 'update', originalKey: req.params.key });
  if (errors.length) throw new HttpError(422, 'Integrity check failed', errors);

  for (const fl of def.fields) doc.set(fl.name, data[fl.name]);
  if (data.durationMinutes !== undefined && entityName === 'appointments') doc.durationMinutes = data.durationMinutes;
  await doc.save();
  await record({
    environmentId: env._id, actor, action: `${def.entityType}.updated`,
    entityType: def.entityType, entityKey: req.params.key, before, after: plain(doc),
  });
  if (entityName === 'appointment-types') await evaluateAppointmentType(env, doc, actor, req.body.exceptionReason);
  res.json(await def.model.findById(doc._id).lean());
}));

router.delete('/:entity/:key', ah(async (req, res) => {
  const { def, entityName, env } = req;
  const doc = await def.model.findOne({ environmentId: env._id, [def.key]: req.params.key });
  if (!doc) throw new HttpError(404, `${def.label} record "${req.params.key}" not found`);
  const deps = await findDependents(env._id, entityName, [req.params.key]);
  if (deps.length) {
    throw new HttpError(409, `Cannot delete "${req.params.key}": other records still reference it`, deps);
  }
  await doc.deleteOne();
  await record({
    environmentId: env._id, actor: actorOf(req), action: `${def.entityType}.deleted`,
    entityType: def.entityType, entityKey: req.params.key, before: plain(doc),
  });
  res.status(204).end();
}));

export default router;

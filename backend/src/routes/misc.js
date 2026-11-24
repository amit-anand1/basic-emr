import { Router } from 'express';
import { Exception, AuditLog, Webhook, Appointment, Department, Location, Provider } from '../models/index.js';
import { decideException } from '../services/exceptions.js';
import { deliver } from '../services/audit.js';
import { ah, actorOf, csvEscape, HttpError } from '../utils.js';

/* ---------------- Exceptions (mounted at /api/environments/:envId/exceptions) ---------------- */
export const exceptionsRouter = Router({ mergeParams: true });

exceptionsRouter.get('/', ah(async (req, res) => {
  const q = { environmentId: req.env._id };
  if (req.query.status) q.status = req.query.status;
  res.json(await Exception.find(q).sort({ createdAt: -1 }).lean());
}));

exceptionsRouter.post('/:id/decision', ah(async (req, res) => {
  const { decision, comment } = req.body || {};
  if (!['Approved', 'Rejected'].includes(decision)) throw new HttpError(422, 'decision must be "Approved" or "Rejected"');
  const ex = await Exception.findOne({ _id: req.params.id, environmentId: req.env._id }).catch(() => null);
  if (!ex) throw new HttpError(404, 'Exception not found');
  if (ex.status !== 'Pending') throw new HttpError(409, `Exception is already ${ex.status}`);
  res.json(await decideException(req.env, ex, decision, comment, actorOf(req)));
}));

/* ---------------- Audit log (mounted at /api/environments/:envId/audit) ---------------- */
export const auditRouter = Router({ mergeParams: true });

auditRouter.get('/', ah(async (req, res) => {
  const q = { environmentId: req.env._id };
  if (req.query.entityType) q.entityType = req.query.entityType;
  if (req.query.action) q.action = new RegExp(String(req.query.action).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (req.query.since) q.at = { $gt: new Date(req.query.since) };
  const limit = Math.min(Number(req.query.limit) || 200, 2000);
  res.json(await AuditLog.find(q).sort({ at: -1 }).limit(limit).lean());
}));

/* ---------------- Exports (mounted at /api/environments/:envId/exports) ---------------- */
export const exportsRouter = Router({ mergeParams: true });

/** Daily activity report (Interface B in the interface spec): CSV, UTF-8, comma-delimited. */
exportsRouter.get('/activity-report.csv', ah(async (req, res) => {
  const environmentId = req.env._id;
  const q = { environmentId };
  if (req.query.from || req.query.to) {
    q.date = { ...(req.query.from && { $gte: req.query.from }), ...(req.query.to && { $lte: req.query.to }) };
  }
  const [appts, depts, locs, provs] = await Promise.all([
    Appointment.find(q).sort({ date: 1, time: 1 }).lean(),
    Department.find({ environmentId }).lean(),
    Location.find({ environmentId }).lean(),
    Provider.find({ environmentId }).lean(),
  ]);
  const deptMap = new Map(depts.map((d) => [d.code, d]));
  const locMap = new Map(locs.map((l) => [l.code, l]));
  const provMap = new Map(provs.map((p) => [p.providerId, p]));
  const header = ['Activity_Date', 'Location', 'Provider_ID', 'Provider_Name', 'Department', 'Appointment_Type', 'Status'];
  const lines = [header.join(',')];
  for (const a of appts) {
    const loc = locMap.get(deptMap.get(a.departmentCode)?.locationCode);
    lines.push([
      a.date, loc?.name || '', a.providerId, provMap.get(a.providerId)?.name || '',
      a.departmentCode, a.appointmentTypeCode, a.status,
    ].map(csvEscape).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="activity-report-${req.query.from || 'all'}-${req.query.to || 'all'}.csv"`);
  res.send(`${lines.join('\n')}\n`);
}));

/* ---------------- Webhooks (mounted at /api/webhooks) ---------------- */
export const webhooksRouter = Router();

webhooksRouter.get('/', ah(async (req, res) => {
  const q = req.query.environmentId ? { $or: [{ environmentId: null }, { environmentId: req.query.environmentId }] } : {};
  res.json(await Webhook.find(q).sort({ createdAt: -1 }).lean());
}));

webhooksRouter.post('/', ah(async (req, res) => {
  const { url, events, environmentId = null } = req.body || {};
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
  } catch {
    throw new HttpError(422, 'A valid http(s) URL is required');
  }
  const list = Array.isArray(events) && events.length ? events : ['*'];
  res.status(201).json(await Webhook.create({ url, events: list, environmentId: environmentId || null }));
}));

webhooksRouter.delete('/:id', ah(async (req, res) => {
  await Webhook.deleteOne({ _id: req.params.id }).catch(() => null);
  res.status(204).end();
}));

webhooksRouter.post('/:id/test', ah(async (req, res) => {
  const hook = await Webhook.findById(req.params.id).catch(() => null);
  if (!hook) throw new HttpError(404, 'Webhook not found');
  const result = await deliver(hook, {
    event: 'webhook.test', environmentId: hook.environmentId, actor: actorOf(req), at: new Date(),
  });
  res.json(result);
}));

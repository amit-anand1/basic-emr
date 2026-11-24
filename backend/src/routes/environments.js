import { Router } from 'express';
import {
  Environment, AppointmentType, Exception, ImportBatch, AuditLog, Webhook, ENV_STATUSES,
} from '../models/index.js';
import { ENTITIES } from '../services/registry.js';
import { getTemplate } from '../templates.js';
import { record } from '../services/audit.js';
import { ah, actorOf, plain, HttpError } from '../utils.js';

const router = Router();

router.get('/', ah(async (req, res) => {
  res.json(await Environment.find().sort({ createdAt: -1 }).lean());
}));

router.post('/', ah(async (req, res) => {
  const { name, organization = {}, templateId = null, targetGoLive, description } = req.body || {};
  if (!name || !String(name).trim()) throw new HttpError(422, 'Integrity check failed', [{ field: 'name', code: 'REQUIRED', message: 'Environment name is required' }]);
  const tpl = templateId ? getTemplate(templateId) : null;
  if (templateId && !tpl) throw new HttpError(422, `Unknown template "${templateId}"`);

  const env = await Environment.create({
    name: String(name).trim(),
    organization: {
      name: organization.name || name,
      segment: organization.segment || tpl?.segment || '',
      specialty: organization.specialty || tpl?.specialty || '',
    },
    templateId: tpl?.id || null,
    targetGoLive,
    description,
    createdBy: actorOf(req),
  });
  if (tpl) {
    await AppointmentType.insertMany(
      tpl.appointmentTypes.map((t) => ({ ...t, environmentId: env._id, fromTemplate: true, approvalStatus: 'Standard' })),
    );
  }
  await record({
    environmentId: env._id, actor: actorOf(req), action: 'environment.created',
    entityType: 'environment', entityKey: String(env._id), after: plain(env),
  });
  res.status(201).json(env);
}));

/* Load :envId for this router and for the nested routers mounted in app.js */
export async function loadEnv(req, res, next) {
  try {
    const env = await Environment.findById(req.params.envId).catch(() => null);
    if (!env) throw new HttpError(404, 'Environment not found');
    req.env = env;
    next();
  } catch (e) {
    next(e);
  }
}

router.get('/:envId', loadEnv, (req, res) => res.json(req.env));

router.patch('/:envId', loadEnv, ah(async (req, res) => {
  const before = plain(req.env);
  const { name, organization, targetGoLive, description } = req.body || {};
  if (name !== undefined) {
    if (!String(name).trim()) throw new HttpError(422, 'Environment name cannot be empty');
    req.env.name = String(name).trim();
  }
  if (organization) req.env.organization = { ...plain(req.env).organization, ...organization };
  if (targetGoLive !== undefined) req.env.targetGoLive = targetGoLive;
  if (description !== undefined) req.env.description = description;
  await req.env.save();
  await record({
    environmentId: req.env._id, actor: actorOf(req), action: 'environment.updated',
    entityType: 'environment', entityKey: String(req.env._id), before, after: plain(req.env),
  });
  res.json(req.env);
}));

/* The EMR does not gate status changes — deciding readiness is the orchestrator's job. */
router.post('/:envId/status', loadEnv, ah(async (req, res) => {
  const { status } = req.body || {};
  if (!ENV_STATUSES.includes(status)) throw new HttpError(422, `Status must be one of: ${ENV_STATUSES.join(', ')}`);
  const from = req.env.status;
  req.env.status = status;
  await req.env.save();
  await record({
    environmentId: req.env._id, actor: actorOf(req), action: 'environment.status_changed',
    entityType: 'environment', entityKey: String(req.env._id), before: { status: from }, after: { status },
  });
  res.json(req.env);
}));

router.get('/:envId/summary', loadEnv, ah(async (req, res) => {
  const environmentId = req.env._id;
  const counts = {};
  await Promise.all(
    Object.entries(ENTITIES).map(async ([name, def]) => {
      counts[name] = await def.model.countDocuments({ environmentId });
    }),
  );
  const [pendingExceptions, imports] = await Promise.all([
    Exception.countDocuments({ environmentId, status: 'Pending' }),
    ImportBatch.countDocuments({ environmentId }),
  ]);
  res.json({ counts, pendingExceptions, imports, template: getTemplate(req.env.templateId) });
}));

router.delete('/:envId', loadEnv, ah(async (req, res) => {
  const environmentId = req.env._id;
  await Promise.all([
    ...Object.values(ENTITIES).map((d) => d.model.deleteMany({ environmentId })),
    Exception.deleteMany({ environmentId }),
    ImportBatch.deleteMany({ environmentId }),
    AuditLog.deleteMany({ environmentId }),
    Webhook.deleteMany({ environmentId }),
  ]);
  await req.env.deleteOne();
  await record({
    actor: actorOf(req), action: 'environment.deleted',
    entityType: 'environment', entityKey: String(environmentId), before: { name: req.env.name },
  });
  res.status(204).end();
}));

export default router;

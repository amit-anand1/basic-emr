import { Exception, AppointmentType } from '../models/index.js';
import { getTemplate } from '../templates.js';
import { record } from './audit.js';
import { plain } from '../utils.js';

/**
 * Compares an appointment type with the environment's template standard.
 * - Same as standard (or no standard)  -> approvalStatus "Standard", open exceptions withdrawn
 * - Different from standard            -> a Pending exception is raised (once per requested value)
 * The EMR only records the deviation; approving it is a human decision
 * (made on the Exceptions page or via the API, e.g. routed by Beacon).
 */
export async function evaluateAppointmentType(env, apptType, actor, reason) {
  const tpl = getTemplate(env.templateId);
  const standard = tpl?.standards?.appointmentDurations?.[apptType.category];
  const open = await Exception.find({
    environmentId: env._id,
    entityType: 'appointmentType',
    entityKey: apptType.code,
    status: { $in: ['Pending', 'Approved'] },
  });

  const setStatus = async (s) => {
    if (apptType.approvalStatus !== s) await AppointmentType.updateOne({ _id: apptType._id }, { approvalStatus: s });
  };
  const close = async (ex, status, comment) => {
    const before = plain(ex);
    Object.assign(ex, { status, decidedBy: actor, decidedAt: new Date(), decisionComment: comment });
    await ex.save();
    await record({
      environmentId: env._id, actor, action: `exception.${status.toLowerCase()}`,
      entityType: 'exception', entityKey: String(ex._id), before, after: plain(ex),
    });
  };

  if (standard == null || apptType.durationMinutes === standard) {
    for (const ex of open) await close(ex, 'Withdrawn', 'Value returned to the template standard');
    await setStatus('Standard');
    return null;
  }

  const same = open.find((e) => e.requestedValue === apptType.durationMinutes);
  if (same) {
    await setStatus(same.status === 'Approved' ? 'Approved exception' : 'Pending approval');
    return same;
  }

  for (const ex of open) await close(ex, 'Superseded', `Replaced by a new requested value (${apptType.durationMinutes})`);

  const ex = await Exception.create({
    environmentId: env._id,
    kind: 'NON_STANDARD_DURATION',
    entityType: 'appointmentType',
    entityKey: apptType.code,
    field: 'durationMinutes',
    standardValue: standard,
    requestedValue: apptType.durationMinutes,
    scope: apptType.locationCodes?.length ? `Locations: ${apptType.locationCodes.join(', ')}` : 'All locations',
    reason: reason || '',
    templateId: env.templateId,
    raisedBy: actor,
  });
  await setStatus('Pending approval');
  await record({
    environmentId: env._id, actor, action: 'exception.raised',
    entityType: 'exception', entityKey: String(ex._id), after: plain(ex),
  });
  return ex;
}

/** Applies a human decision to a pending exception. */
export async function decideException(env, ex, decision, comment, actor) {
  const before = plain(ex);
  Object.assign(ex, { status: decision, decidedBy: actor, decidedAt: new Date(), decisionComment: comment || '' });
  await ex.save();
  if (ex.entityType === 'appointmentType') {
    await AppointmentType.updateOne(
      { environmentId: env._id, code: ex.entityKey },
      { approvalStatus: decision === 'Approved' ? 'Approved exception' : 'Rejected' },
    );
  }
  await record({
    environmentId: env._id, actor, action: `exception.${decision.toLowerCase()}`,
    entityType: 'exception', entityKey: String(ex._id), before, after: plain(ex),
  });
  return ex;
}

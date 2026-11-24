import { AuditLog, Webhook } from '../models/index.js';

/**
 * Records an audit entry and fans it out to matching webhooks.
 * The audit action name IS the event name (e.g. "provider.created").
 */
export async function record({ environmentId = null, actor, action, entityType, entityKey, before = null, after = null }) {
  const entry = await AuditLog.create({ environmentId, actor, action, entityType, entityKey, before, after });
  dispatch(entry).catch((e) => console.error('[webhook] dispatch failed', e.message));
  return entry;
}

function matches(patterns, action) {
  return patterns.some((p) => p === '*' || p === action || (p.endsWith('.*') && action.startsWith(p.slice(0, -1))));
}

async function dispatch(entry) {
  const hooks = await Webhook.find({
    active: true,
    $or: [{ environmentId: null }, { environmentId: entry.environmentId }],
  });
  const payload = {
    event: entry.action,
    environmentId: entry.environmentId,
    actor: entry.actor,
    entityType: entry.entityType,
    entityKey: entry.entityKey,
    at: entry.at,
    before: entry.before,
    after: entry.after,
  };
  await Promise.all(
    hooks
      .filter((h) => matches(h.events, entry.action))
      .map((h) => deliver(h, payload)),
  );
}

export async function deliver(hook, payload) {
  const lastDelivery = { at: new Date(), event: payload.event };
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-EMR-Event': payload.event },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    lastDelivery.status = res.status;
  } catch (e) {
    lastDelivery.error = e.message;
  }
  await Webhook.updateOne({ _id: hook._id }, { lastDelivery });
  return lastDelivery;
}

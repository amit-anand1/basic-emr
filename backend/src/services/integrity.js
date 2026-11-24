import { ENTITIES } from './registry.js';
import { isValidDate, isValidTime } from '../utils.js';

/*
 * INTEGRITY GUARDRAILS — deliberately minimal.
 *
 * The EMR only refuses data it physically cannot store or use:
 *   REQUIRED           a mandatory field is empty
 *   INVALID_FORMAT     a date/time/number cannot be interpreted
 *   INVALID_VALUE      a value is not in a fixed list (e.g. appointment status)
 *   UNKNOWN_REFERENCE  a code points at configuration that does not exist
 *   DUPLICATE_KEY      the record ID already exists
 *   KEY_IMMUTABLE      an update tries to change the record ID
 *
 * Business-rule validation (future birth dates, invalid states, missing NPI,
 * expiring licenses, unapproved exceptions, provider/location fit, readiness…)
 * is intentionally NOT done here. That belongs to the orchestration layer (Beacon).
 */

/** Which reference sets a given entity needs to be checked. */
function neededEntities(entity) {
  const def = ENTITIES[entity];
  const set = new Set([entity]);
  def.fields.forEach((fl) => fl.ref && set.add(fl.ref));
  return [...set];
}

/**
 * Loads the keys of every entity needed to check `entity` records.
 * refs.keys[entityName] = Set of keys
 * refs.locationLookup  = Map(lowercased code or name -> code)
 * refs.appointmentTypes = Map(code -> doc)
 */
export async function loadRefs(environmentId, entity) {
  const refs = { keys: {}, locationLookup: new Map(), appointmentTypes: new Map() };
  const names = neededEntities(entity);
  await Promise.all(
    names.map(async (name) => {
      const def = ENTITIES[name];
      const extra = name === 'locations' ? ' name' : name === 'appointment-types' ? ' durationMinutes category' : '';
      const docs = await def.model.find({ environmentId }).select(`${def.key}${extra}`).lean();
      refs.keys[name] = new Set(docs.map((d) => d[def.key]));
      if (name === 'locations') {
        docs.forEach((d) => {
          refs.locationLookup.set(String(d.code).toLowerCase(), d.code);
          if (d.name) refs.locationLookup.set(String(d.name).toLowerCase(), d.code);
        });
      }
      if (name === 'appointment-types') docs.forEach((d) => refs.appointmentTypes.set(d.code, d));
    }),
  );
  return refs;
}

const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/**
 * Converts a raw input object (UI form, API body or mapped CSV row) into the
 * stored shape, and checks it. Returns { data, errors }.
 * mode: 'create' | 'update'; originalKey is required for 'update'.
 */
export function prepare(entity, raw, refs, { mode = 'create', originalKey } = {}) {
  const def = ENTITIES[entity];
  const data = {};
  const errors = [];
  const err = (field, code, message) => errors.push({ field, code, message });

  for (const fl of def.fields) {
    let v = raw[fl.name];
    if (typeof v === 'string') v = v.trim();
    if (isEmpty(v)) {
      if (fl.type === 'boolean' && mode === 'create') data[fl.name] = true;
      else if (fl.default !== undefined) data[fl.name] = fl.default;
      else data[fl.name] = fl.type === 'list' ? [] : undefined;
      if (fl.required && data[fl.name] === undefined) err(fl.name, 'REQUIRED', `${fl.label} is required`);
      continue;
    }
    switch (fl.type) {
      case 'boolean':
        data[fl.name] = typeof v === 'boolean' ? v : !['false', 'no', 'n', '0', 'inactive'].includes(String(v).toLowerCase());
        break;
      case 'int': {
        const n = Number(v);
        if (!Number.isInteger(n) || n <= 0) err(fl.name, 'INVALID_FORMAT', `${fl.label} must be a positive whole number (got "${v}")`);
        data[fl.name] = n;
        break;
      }
      case 'date':
        if (!isValidDate(String(v))) err(fl.name, 'INVALID_FORMAT', `${fl.label} must be a real date in YYYY-MM-DD format (got "${v}")`);
        data[fl.name] = String(v);
        break;
      case 'time': {
        let t = String(v);
        if (/^\d:\d\d$/.test(t)) t = `0${t}`;
        if (!isValidTime(t)) err(fl.name, 'INVALID_FORMAT', `${fl.label} must be HH:mm, 24-hour (got "${v}")`);
        data[fl.name] = t;
        break;
      }
      case 'enum': {
        const match = fl.values.find((x) => x.toLowerCase() === String(v).toLowerCase());
        if (!match) err(fl.name, 'INVALID_VALUE', `${fl.label} must be one of: ${fl.values.join(', ')} (got "${v}")`);
        data[fl.name] = match || String(v);
        break;
      }
      case 'list': {
        let list = Array.isArray(v) ? v : String(v).split(/[;,|]/);
        list = list.map((x) => String(x).trim()).filter(Boolean);
        if (fl.ref === 'locations') list = list.map((x) => refs.locationLookup.get(x.toLowerCase()) || x);
        data[fl.name] = [...new Set(list)];
        break;
      }
      default:
        data[fl.name] = String(v);
    }
  }

  // Reference checks
  for (const fl of def.fields) {
    if (!fl.ref || isEmpty(data[fl.name])) continue;
    const known = refs.keys[fl.ref];
    const values = fl.type === 'list' ? data[fl.name] : [data[fl.name]];
    for (const val of values) {
      if (!known.has(val)) {
        err(fl.name, 'UNKNOWN_REFERENCE', `${fl.label} "${val}" does not exist in this environment's ${ENTITIES[fl.ref].label.toLowerCase()}`);
      }
    }
  }

  // Key checks
  const key = data[def.key];
  if (!isEmpty(key)) {
    if (mode === 'create' && refs.keys[entity].has(key)) {
      err(def.key, 'DUPLICATE_KEY', `${ENTITIES[entity].fields.find((x) => x.name === def.key).label} "${key}" already exists`);
    }
    if (mode === 'update' && key !== originalKey) {
      err(def.key, 'KEY_IMMUTABLE', `The record ID cannot be changed (was "${originalKey}")`);
    }
  }

  // Derived values
  if (entity === 'appointments' && refs.appointmentTypes.has(data.appointmentTypeCode)) {
    data.durationMinutes = refs.appointmentTypes.get(data.appointmentTypeCode).durationMinutes;
  }

  return { data, errors };
}

/**
 * Counts records in other entities that point at the given keys.
 * Used to block deletes and import rollbacks that would leave broken references.
 */
export async function findDependents(environmentId, entity, keys, { excludeBatchId } = {}) {
  const def = ENTITIES[entity];
  const out = [];
  for (const dep of def.dependents) {
    const q = { environmentId, [dep.field]: { $in: keys } };
    if (excludeBatchId) q.importBatchId = { $ne: excludeBatchId };
    const count = await ENTITIES[dep.entity].model.countDocuments(q);
    if (count) out.push({ entity: dep.entity, field: dep.field, count });
  }
  return out;
}

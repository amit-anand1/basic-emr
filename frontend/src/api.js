/** Name shown in the audit log for actions taken in the UI. */
export function getActor() {
  try {
    return localStorage.getItem('emr.actor') || '';
  } catch {
    return '';
  }
}
export function setActor(name) {
  try {
    localStorage.setItem('emr.actor', name);
  } catch {
    /* ignore */
  }
}

/**
 * Small fetch wrapper. Throws an Error with .status and .details
 * (the backend's integrity errors) when the response is not OK.
 */
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Actor': `ui:${getActor() || 'user'}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `${res.status} ${res.statusText}`);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

export const envPath = (envId, rest = '') => `/environments/${envId}${rest}`;

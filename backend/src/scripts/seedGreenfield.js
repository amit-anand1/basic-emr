/**
 * Creates the "Greenfield Behavioral Health Group" environment through the
 * public REST API — the same calls an orchestrator such as Beacon would make.
 * It loads CONFIGURATION ONLY (locations, departments, appointment types,
 * providers, users). Patients and appointments are left for the Data Import page.
 *
 * Usage (with the API running):  npm run seed:greenfield
 * Optional: API_URL=http://localhost:5050/api npm run seed:greenfield
 */
const API = process.env.API_URL || `http://localhost:${process.env.PORT || 5050}/api`;
const headers = { 'Content-Type': 'application/json', 'X-Actor': 'seed-script' };

async function call(method, path, body) {
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) {
    console.error(`✗ ${method} ${path}:`, data?.error, JSON.stringify(data?.details || ''));
    return null;
  }
  return data;
}

const env = await call('POST', '/environments', {
  name: 'Greenfield Behavioral Health Group',
  organization: { name: 'Greenfield Behavioral Health Group', segment: 'Small group', specialty: 'Behavioral Health' },
  templateId: 'bh-small-group',
  targetGoLive: '2027-03-15',
  description: 'Seeded from the synthetic demo pack (Case Intake, Provider Roster, Kickoff Conversation).',
});
if (!env) process.exit(1);
const base = `/environments/${env._id}`;
console.log(`✓ environment ${env._id}`);

await call('POST', `/environments/${env._id}/status`, { status: 'Configuring' });

for (const l of [
  { code: 'WEST', name: 'West', address: 'Location A' },
  { code: 'EAST', name: 'East', address: 'Location B' },
]) await call('POST', `${base}/locations`, l);

for (const d of [
  { code: 'GBH-WEST', name: 'Behavioral Health – West', locationCode: 'WEST', specialty: 'Behavioral Health' },
  { code: 'GBH-EAST', name: 'Behavioral Health – East', locationCode: 'EAST', specialty: 'Behavioral Health' },
]) await call('POST', `${base}/departments`, d);

// Kickoff: East needs a 30-minute new-patient consultation -> raises an exception (standard is 45).
await call('POST', `${base}/appointment-types`, {
  code: 'BH_NEW_30', name: 'New patient consultation (East, short assessment)', category: 'NEW_PATIENT',
  durationMinutes: 30, locationCodes: ['EAST'],
  exceptionReason: 'East team uses a shorter assessment pathway (kickoff conversation)',
});

const providers = [
  ['P1001', 'Jordan Lee', '1669000101', '2027-08-31', 'WEST;EAST'],
  ['P1002', 'Casey Morgan', '1669000102', '2027-01-31', 'WEST'],
  ['P1003', 'Taylor Rivera', '1669000103', '2028-03-31', 'EAST'],
  ['P1004', 'Avery Chen', '1669000104', '2027-11-30', 'WEST;EAST'],
  ['P1005', 'Riley Patel', '1669000105', '2027-02-15', 'EAST'],
  // P1006 Morgan Blake is left out: no NPI yet, and NPI is mandatory for providers.
];
for (const [providerId, name, npi, licenseExpiry, locs] of providers) {
  await call('POST', `${base}/providers`, { providerId, name, credentialType: 'Clinician', npi, licenseExpiry, locationCodes: locs });
}

for (const u of [
  { username: 'mparker', fullName: 'Mia Parker', role: 'Admin' },
  { username: 'scheduler.west', fullName: 'West Scheduler', role: 'Scheduler' },
  { username: 'scheduler.east', fullName: 'East Scheduler', role: 'Scheduler' },
  { username: 'billing', fullName: 'Billing User', role: 'Billing user' },
  { username: 'jlee', fullName: 'Jordan Lee', role: 'Clinician', providerId: 'P1001' },
]) await call('POST', `${base}/users`, u);

console.log(`✓ Greenfield configuration loaded. Open http://localhost:5173/env/${env._id}`);

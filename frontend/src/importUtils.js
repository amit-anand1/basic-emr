import * as XLSX from 'xlsx';
import { api } from './api.js';

/* ---------- field schema (from the backend registry) ---------- */
let schemaPromise = null;
export function getSchema() {
  if (!schemaPromise) schemaPromise = api('/schema').catch((e) => { schemaPromise = null; throw e; });
  return schemaPromise;
}

/* ---------- column auto-mapping ---------- */
export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Returns { targetField: sourceHeader } matched by field name, label or alias. */
export function autoMap(headers, fields) {
  const used = new Set();
  const map = {};
  for (const f of fields) {
    const candidates = new Set([f.name, f.label, ...(f.aliases || [])].map(norm));
    const h = headers.find((x) => !used.has(x) && candidates.has(norm(x)));
    if (h) {
      map[f.name] = h;
      used.add(h);
    }
  }
  return map;
}

/* ---------- reading Excel / CSV ---------- */
const pad = (n) => String(n).padStart(2, '0');

/** Converts one SheetJS cell to the text the API expects (dates → YYYY-MM-DD, times → HH:mm). */
function cellText(cell) {
  if (!cell || cell.v === undefined || cell.v === null) return '';
  if (cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
    const d = XLSX.SSF.parse_date_code(cell.v);
    if (cell.v < 1) return `${pad(d.H)}:${pad(d.M)}`; // time only
    return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  if (cell.t === 'd' && cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE';
  return String(cell.v).trim();
}

/**
 * Reads the first data sheet of an .xlsx/.xls/.csv file.
 * Returns { sheetName, headers, rows: [{ line, row }] } where `line` is the
 * spreadsheet row number (header = row 1) so errors can point at the exact row.
 */
export async function readSheet(file) {
  const isCsv = /\.csv$/i.test(file.name);
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellNF: true, raw: isCsv });
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase() !== 'instructions') || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws['!ref']) return { sheetName, headers: [], rows: [] };
  const range = XLSX.utils.decode_range(ws['!ref']);
  const cols = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const h = cellText(ws[XLSX.utils.encode_cell({ r: range.s.r, c })]);
    if (h) cols.push({ c, h });
  }
  const rows = [];
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const row = {};
    let any = false;
    for (const { c, h } of cols) {
      const v = cellText(ws[XLSX.utils.encode_cell({ r, c })]);
      row[h] = v;
      if (v !== '') any = true;
    }
    if (any) rows.push({ line: r + 1, row });
  }
  return { sheetName, headers: cols.map((x) => x.h), rows };
}

/* ---------- downloadable template ---------- */
const EXAMPLES = {
  locations: { code: 'WEST', name: 'West', address: 'Location A', active: 'TRUE' },
  departments: { code: 'GBH-WEST', name: 'Behavioral Health – West', locationCode: 'WEST', specialty: 'Behavioral Health', active: 'TRUE' },
  providers: { providerId: 'P1001', name: 'Jordan Lee', credentialType: 'Clinician', npi: '1669000101', licenseExpiry: '2027-08-31', locationCodes: 'WEST; EAST', active: 'TRUE' },
  'appointment-types': { code: 'BH_NEW_45', name: 'New patient consultation', category: 'NEW_PATIENT', durationMinutes: '45', locationCodes: 'EAST', active: 'TRUE' },
  users: { username: 'mparker', fullName: 'Mia Parker', email: 'mia@example.org', role: 'Admin', providerId: '', active: 'TRUE' },
  patients: { patientId: 'PT0001', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1980-05-17', sex: 'Female', state: 'MA', phone: '555-0100', email: '', departmentCode: 'GBH-WEST' },
};

function describe(f, refValues) {
  const parts = [];
  if (f.type === 'date') parts.push('Date as YYYY-MM-DD (text) or an Excel date cell');
  if (f.type === 'time') parts.push('Time as HH:mm, 24-hour');
  if (f.type === 'int') parts.push('Whole number greater than 0');
  if (f.type === 'boolean') parts.push('TRUE / FALSE (blank = TRUE)');
  if (f.type === 'enum') parts.push(`One of: ${f.values.join(', ')}`);
  if (f.type === 'list') parts.push('Several values allowed, separated by ;');
  if (f.ref) {
    const vals = refValues?.[f.ref] || [];
    parts.push(`Must match an existing ${f.ref.replace('-', ' ')} code${vals.length ? `: ${vals.join(', ')}` : ' (none configured yet — add those first)'}`);
    if (f.ref === 'locations') parts.push('location names are accepted too');
  }
  if (!parts.length) parts.push('Text');
  return parts.join('. ');
}

/** Builds and downloads "<entity>-template.xlsx": a data sheet with headers + an Instructions sheet. */
export function downloadTemplate(entitySchema, refValues = {}) {
  const { entity, label, fields } = entitySchema;
  const headers = fields.map((f) => f.label);
  const data = XLSX.utils.aoa_to_sheet([headers]);
  data['!cols'] = headers.map((h) => ({ wch: Math.max(14, h.length + 4) }));

  const ex = EXAMPLES[entity] || {};
  const info = [
    [`How to fill the "${label}" sheet`],
    ['Fill one record per row on the first sheet, starting at row 2. Keep the header row exactly as it is. Do not add rows above the header.'],
    ['Rows with problems are listed with their row number and skipped; all other rows are added.'],
    [],
    ['Column', 'Required?', 'What to enter', 'Example'],
    ...fields.map((f) => [f.label, f.required ? 'Yes' : 'No', describe(f, refValues), ex[f.name] ?? '']),
  ];
  const instructions = XLSX.utils.aoa_to_sheet(info);
  instructions['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 80 }, { wch: 26 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, data, label.slice(0, 31));
  XLSX.utils.book_append_sheet(wb, instructions, 'Instructions');
  XLSX.writeFile(wb, `${entity}-template.xlsx`);
}

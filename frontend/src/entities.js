/**
 * UI description of each record type: table columns and form fields.
 * (The backend has its own definition in backend/src/services/registry.js —
 * that one is the source of truth for integrity checks.)
 */
export const CATEGORIES = ['NEW_PATIENT', 'FOLLOW_UP', 'OTHER'];
export const ROLES = ['Admin', 'Clinician', 'Scheduler', 'Billing user', 'Front desk'];
export const APPT_STATUSES = ['Scheduled', 'Checked in', 'Completed', 'Cancelled', 'No-show'];

/** How a record of each type is shown inside a dropdown. */
export const OPTION_LABEL = {
  locations: (r) => `${r.code} – ${r.name}`,
  departments: (r) => `${r.code} – ${r.name}`,
  providers: (r) => `${r.providerId} – ${r.name}`,
  'appointment-types': (r) => `${r.code} – ${r.name} (${r.durationMinutes} min)`,
  patients: (r) => `${r.patientId} – ${r.firstName} ${r.lastName}`,
};
export const OPTION_VALUE = {
  locations: 'code', departments: 'code', providers: 'providerId', 'appointment-types': 'code', patients: 'patientId',
};

export const ENTITY_UI = {
  locations: {
    label: 'Locations', singular: 'location', key: 'code',
    help: 'Physical sites of the clinic. Departments and providers are attached to locations.',
    columns: [['code', 'Code'], ['name', 'Name'], ['address', 'Address'], ['active', 'Active']],
    fields: [
      { name: 'code', label: 'Location code', required: true, placeholder: 'WEST' },
      { name: 'name', label: 'Location name', required: true, placeholder: 'West' },
      { name: 'address', label: 'Address' },
      { name: 'active', label: 'Active', type: 'checkbox', default: true },
    ],
  },
  departments: {
    label: 'Departments', singular: 'department', key: 'code',
    help: 'Departments belong to a location. Patients and appointments reference department codes.',
    columns: [['code', 'Code'], ['name', 'Name'], ['locationCode', 'Location'], ['specialty', 'Specialty'], ['active', 'Active']],
    fields: [
      { name: 'code', label: 'Department code', required: true, placeholder: 'GBH-WEST' },
      { name: 'name', label: 'Department name', required: true },
      { name: 'locationCode', label: 'Location', type: 'select', source: 'locations', required: true },
      { name: 'specialty', label: 'Specialty' },
      { name: 'active', label: 'Active', type: 'checkbox', default: true },
    ],
  },
  providers: {
    label: 'Providers', singular: 'provider', key: 'providerId',
    help: 'Clinicians who see patients. Appointments reference provider IDs.',
    columns: [
      ['providerId', 'Provider ID'], ['name', 'Name'], ['credentialType', 'Credential'], ['npi', 'NPI'],
      ['licenseExpiry', 'License expiry'], ['locationCodes', 'Locations'], ['active', 'Active'],
    ],
    fields: [
      { name: 'providerId', label: 'Provider ID', required: true, placeholder: 'P1001' },
      { name: 'name', label: 'Provider name', required: true },
      { name: 'credentialType', label: 'Credential type', placeholder: 'Clinician' },
      { name: 'npi', label: 'National identifier (NPI)', required: true },
      { name: 'licenseExpiry', label: 'License expiry', type: 'date' },
      { name: 'locationCodes', label: 'Locations', type: 'multiselect', source: 'locations' },
      { name: 'active', label: 'Active', type: 'checkbox', default: true },
    ],
  },
  'appointment-types': {
    label: 'Appointment types', singular: 'appointment type', key: 'code',
    help: 'Visit types and their durations. A duration that differs from the template standard raises an exception for approval.',
    columns: [
      ['code', 'Code'], ['name', 'Name'], ['category', 'Category'], ['durationMinutes', 'Minutes'],
      ['locationCodes', 'Locations'], ['approvalStatus', 'Approval'], ['active', 'Active'],
    ],
    fields: [
      { name: 'code', label: 'Code', required: true, placeholder: 'BH_NEW_45' },
      { name: 'name', label: 'Name', required: true },
      { name: 'category', label: 'Category', type: 'select', options: CATEGORIES, required: true },
      { name: 'durationMinutes', label: 'Duration (minutes)', type: 'number', required: true },
      { name: 'locationCodes', label: 'Allowed locations (none = all)', type: 'multiselect', source: 'locations' },
      { name: 'exceptionReason', label: 'Reason, if different from the template standard', type: 'textarea', transient: true },
      { name: 'active', label: 'Active', type: 'checkbox', default: true },
    ],
  },
  users: {
    label: 'Users', singular: 'user', key: 'username',
    help: 'People who will log in to the EMR, with their role.',
    columns: [['username', 'Username'], ['fullName', 'Full name'], ['email', 'Email'], ['role', 'Role'], ['providerId', 'Provider'], ['active', 'Active']],
    fields: [
      { name: 'username', label: 'Username', required: true },
      { name: 'fullName', label: 'Full name' },
      { name: 'email', label: 'Email' },
      { name: 'role', label: 'Role', type: 'select', options: ROLES, required: true },
      { name: 'providerId', label: 'Linked provider (clinicians)', type: 'select', source: 'providers' },
      { name: 'active', label: 'Active', type: 'checkbox', default: true },
    ],
  },
  patients: {
    label: 'Patients', singular: 'patient', key: 'patientId',
    columns: [
      ['patientId', 'Patient ID'], ['lastName', 'Last name'], ['firstName', 'First name'], ['dateOfBirth', 'Date of birth'],
      ['state', 'State'], ['departmentCode', 'Department'], ['phone', 'Phone'],
    ],
    fields: [
      { name: 'patientId', label: 'Patient ID', required: true, placeholder: 'PT0001' },
      { name: 'firstName', label: 'First name', required: true },
      { name: 'lastName', label: 'Last name', required: true },
      { name: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
      { name: 'sex', label: 'Sex' },
      { name: 'state', label: 'State' },
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email' },
      { name: 'departmentCode', label: 'Department', type: 'select', source: 'departments' },
    ],
  },
  appointments: {
    label: 'Appointments', singular: 'appointment', key: 'appointmentId',
    columns: [
      ['appointmentId', 'ID'], ['date', 'Date'], ['time', 'Time'], ['patientId', 'Patient'], ['providerId', 'Provider'],
      ['departmentCode', 'Department'], ['appointmentTypeCode', 'Type'], ['durationMinutes', 'Min'], ['status', 'Status'],
    ],
    fields: [
      { name: 'appointmentId', label: 'Appointment ID', required: true, placeholder: 'APPT0500' },
      { name: 'patientId', label: 'Patient', type: 'select', source: 'patients', required: true },
      { name: 'providerId', label: 'Provider', type: 'select', source: 'providers', required: true },
      { name: 'departmentCode', label: 'Department', type: 'select', source: 'departments', required: true },
      { name: 'appointmentTypeCode', label: 'Appointment type', type: 'select', source: 'appointment-types', required: true },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'time', label: 'Start time', type: 'time', required: true },
      { name: 'status', label: 'Status', type: 'select', options: APPT_STATUSES, default: 'Scheduled' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
};

export function formatCell(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value === true) return '✓';
  if (value === false) return '—';
  if (value === undefined || value === null || value === '') return '';
  return String(value);
}

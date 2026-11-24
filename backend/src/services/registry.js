import {
  Location, Department, Provider, AppointmentType, User, Patient, Appointment,
  CATEGORIES, ROLES, APPT_STATUSES,
} from '../models/index.js';

const f = (name, label, o = {}) => ({ name, label, type: 'string', required: false, aliases: [], ...o });
const active = f('active', 'Active', { type: 'boolean' });

/**
 * Every record type the EMR stores, described once. This drives:
 *  - the generic REST routes (/api/environments/:envId/<entity>)
 *  - the integrity guardrails (required, format, reference, uniqueness)
 *  - the bulk import field list (+ aliases used for auto-mapping CSV headers)
 *  - delete / rollback protection (dependents)
 */
export const ENTITIES = {
  locations: {
    model: Location, entityType: 'location', key: 'code', label: 'Locations', group: 'configuration',
    searchFields: ['code', 'name'],
    fields: [
      f('code', 'Location code', { required: true, aliases: ['location_code', 'location_id'] }),
      f('name', 'Location name', { required: true, aliases: ['location_name', 'location'] }),
      f('address', 'Address'),
      active,
    ],
    dependents: [
      { entity: 'departments', field: 'locationCode' },
      { entity: 'providers', field: 'locationCodes' },
      { entity: 'appointment-types', field: 'locationCodes' },
    ],
  },
  departments: {
    model: Department, entityType: 'department', key: 'code', label: 'Departments', group: 'configuration',
    searchFields: ['code', 'name'],
    fields: [
      f('code', 'Department code', { required: true, aliases: ['department', 'department_code', 'dept', 'department_id'] }),
      f('name', 'Department name', { required: true, aliases: ['department_name'] }),
      f('locationCode', 'Location code', { required: true, ref: 'locations', aliases: ['location', 'location_code'] }),
      f('specialty', 'Specialty'),
      active,
    ],
    dependents: [
      { entity: 'patients', field: 'departmentCode' },
      { entity: 'appointments', field: 'departmentCode' },
    ],
  },
  providers: {
    model: Provider, entityType: 'provider', key: 'providerId', label: 'Providers', group: 'configuration',
    searchFields: ['providerId', 'name', 'npi'],
    fields: [
      f('providerId', 'Provider ID', { required: true, aliases: ['provider_id', 'provider', 'id'] }),
      f('name', 'Provider name', { required: true, aliases: ['provider_name', 'full_name'] }),
      f('credentialType', 'Credential type', { aliases: ['credential', 'credential_type'] }),
      f('npi', 'National identifier (NPI)', { required: true, aliases: ['national_identifier', 'npi_number', 'npi'] }),
      f('licenseExpiry', 'License expiry', { type: 'date', aliases: ['license_expiry', 'license_expiration'] }),
      f('locationCodes', 'Locations', { type: 'list', ref: 'locations', aliases: ['locations', 'location'] }),
      active,
    ],
    dependents: [
      { entity: 'appointments', field: 'providerId' },
      { entity: 'users', field: 'providerId' },
    ],
  },
  'appointment-types': {
    model: AppointmentType, entityType: 'appointmentType', key: 'code', label: 'Appointment types', group: 'configuration',
    searchFields: ['code', 'name'],
    fields: [
      f('code', 'Appointment type code', { required: true, aliases: ['appointment_type', 'type_code', 'appointment_type_code'] }),
      f('name', 'Name', { required: true, aliases: ['appointment_type_name', 'description'] }),
      f('category', 'Category', { required: true, type: 'enum', values: CATEGORIES }),
      f('durationMinutes', 'Duration (minutes)', { required: true, type: 'int', aliases: ['duration', 'minutes', 'duration_minutes'] }),
      f('locationCodes', 'Allowed locations (empty = all)', { type: 'list', ref: 'locations', aliases: ['locations'] }),
      active,
    ],
    dependents: [{ entity: 'appointments', field: 'appointmentTypeCode' }],
  },
  users: {
    model: User, entityType: 'user', key: 'username', label: 'Users', group: 'configuration',
    searchFields: ['username', 'fullName', 'email'],
    fields: [
      f('username', 'Username', { required: true, aliases: ['user', 'login', 'user_name'] }),
      f('fullName', 'Full name', { aliases: ['full_name', 'name'] }),
      f('email', 'Email'),
      f('role', 'Role', { required: true, type: 'enum', values: ROLES }),
      f('providerId', 'Linked provider ID', { ref: 'providers', aliases: ['provider_id'] }),
      active,
    ],
    dependents: [],
  },
  patients: {
    model: Patient, entityType: 'patient', key: 'patientId', label: 'Patients', group: 'clinical',
    searchFields: ['patientId', 'firstName', 'lastName', 'phone'],
    fields: [
      f('patientId', 'Patient ID', { required: true, aliases: ['patient_id', 'mrn', 'id', 'patient'] }),
      f('firstName', 'First name', { required: true, aliases: ['first_name', 'given_name', 'firstname'] }),
      f('lastName', 'Last name', { required: true, aliases: ['last_name', 'family_name', 'surname'] }),
      f('dateOfBirth', 'Date of birth', { required: true, type: 'date', aliases: ['date_of_birth', 'dob', 'birth_date'] }),
      f('sex', 'Sex', { aliases: ['gender'] }),
      f('state', 'State'),
      f('phone', 'Phone', { aliases: ['phone_number', 'telephone'] }),
      f('email', 'Email'),
      f('departmentCode', 'Department code', { ref: 'departments', aliases: ['department', 'dept', 'department_code'] }),
    ],
    dependents: [{ entity: 'appointments', field: 'patientId' }],
  },
  appointments: {
    model: Appointment, entityType: 'appointment', key: 'appointmentId', label: 'Appointments', group: 'clinical',
    searchFields: ['appointmentId', 'patientId', 'providerId'],
    sort: { date: 1, time: 1 },
    fields: [
      f('appointmentId', 'Appointment ID', { required: true, aliases: ['appointment_id', 'appt_id', 'id'] }),
      f('patientId', 'Patient ID', { required: true, ref: 'patients', aliases: ['patient_id', 'patient', 'mrn'] }),
      f('providerId', 'Provider ID', { required: true, ref: 'providers', aliases: ['provider_id', 'provider'] }),
      f('departmentCode', 'Department code', { required: true, ref: 'departments', aliases: ['department', 'dept', 'department_code'] }),
      f('appointmentTypeCode', 'Appointment type code', { required: true, ref: 'appointment-types', aliases: ['appointment_type', 'type', 'visit_type'] }),
      f('date', 'Date', { required: true, type: 'date', aliases: ['appointment_date', 'date'] }),
      f('time', 'Start time (HH:mm)', { required: true, type: 'time', aliases: ['appointment_time', 'start_time', 'time'] }),
      f('status', 'Status', { type: 'enum', values: APPT_STATUSES, default: 'Scheduled' }),
      f('notes', 'Notes'),
    ],
    dependents: [],
  },
};

export const getEntity = (name) => ENTITIES[name] || null;

/** Public description of entities/fields (used by the import UI and by Beacon). */
export function describeEntities() {
  return Object.entries(ENTITIES).map(([name, def]) => ({
    entity: name,
    label: def.label,
    group: def.group,
    key: def.key,
    fields: def.fields.map(({ name: n, label, type, required, values, ref, aliases, default: d }) => ({
      name: n, label, type, required, values, ref, aliases, default: d,
    })),
  }));
}

import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const envRef = { type: Schema.Types.ObjectId, ref: 'Environment', required: true, index: true };
const batchRef = { type: Schema.Types.ObjectId, ref: 'ImportBatch', default: null, index: true };
const opts = { timestamps: true };

export const ENV_STATUSES = ['Draft', 'Configuring', 'Migrating', 'Validating', 'Ready', 'Live'];
export const CATEGORIES = ['NEW_PATIENT', 'FOLLOW_UP', 'OTHER'];
export const ROLES = ['Admin', 'Clinician', 'Scheduler', 'Billing user', 'Front desk'];
export const APPT_STATUSES = ['Scheduled', 'Checked in', 'Completed', 'Cancelled', 'No-show'];
export const APPROVAL_STATUSES = ['Standard', 'Pending approval', 'Approved exception', 'Rejected'];

/* ---------- Environment (one per client) ---------- */
export const Environment = model(
  'Environment',
  new Schema(
    {
      name: { type: String, required: true },
      organization: {
        name: String,
        segment: String,
        specialty: String,
      },
      templateId: { type: String, default: null },
      status: { type: String, enum: ENV_STATUSES, default: 'Draft' },
      targetGoLive: String,
      description: String,
      createdBy: String,
    },
    opts,
  ),
);

/* ---------- Configuration (setup / master data) ---------- */
function configModel(name, fields, key) {
  const schema = new Schema({ environmentId: envRef, importBatchId: batchRef, ...fields, active: { type: Boolean, default: true } }, opts);
  schema.index({ environmentId: 1, [key]: 1 }, { unique: true });
  return model(name, schema);
}

export const Location = configModel('Location', { code: String, name: String, address: String }, 'code');

export const Department = configModel(
  'Department',
  { code: String, name: String, locationCode: String, specialty: String },
  'code',
);

export const Provider = configModel(
  'Provider',
  {
    providerId: String,
    name: String,
    credentialType: String,
    npi: String,
    licenseExpiry: String,
    locationCodes: [String],
  },
  'providerId',
);

export const AppointmentType = configModel(
  'AppointmentType',
  {
    code: String,
    name: String,
    category: { type: String, enum: CATEGORIES },
    durationMinutes: Number,
    locationCodes: [String],
    approvalStatus: { type: String, enum: APPROVAL_STATUSES, default: 'Standard' },
    fromTemplate: { type: Boolean, default: false },
  },
  'code',
);

export const User = configModel(
  'User',
  { username: String, fullName: String, email: String, role: { type: String, enum: ROLES }, providerId: String },
  'username',
);

/* ---------- Clinical / operational data (what migration fills) ---------- */
const patientSchema = new Schema(
  {
    environmentId: envRef,
    importBatchId: batchRef,
    patientId: String,
    firstName: String,
    lastName: String,
    dateOfBirth: String,
    sex: String,
    state: String,
    phone: String,
    email: String,
    departmentCode: String,
  },
  opts,
);
patientSchema.index({ environmentId: 1, patientId: 1 }, { unique: true });
export const Patient = model('Patient', patientSchema);

const appointmentSchema = new Schema(
  {
    environmentId: envRef,
    importBatchId: batchRef,
    appointmentId: String,
    patientId: String,
    providerId: String,
    departmentCode: String,
    appointmentTypeCode: String,
    date: String,
    time: String,
    durationMinutes: Number,
    status: { type: String, enum: APPT_STATUSES, default: 'Scheduled' },
    notes: String,
  },
  opts,
);
appointmentSchema.index({ environmentId: 1, appointmentId: 1 }, { unique: true });
appointmentSchema.index({ environmentId: 1, date: 1, time: 1 });
export const Appointment = model('Appointment', appointmentSchema);

/* ---------- Governance / operations ---------- */
export const Exception = model(
  'Exception',
  new Schema(
    {
      environmentId: envRef,
      kind: { type: String, default: 'NON_STANDARD_DURATION' },
      entityType: String,
      entityKey: String,
      field: String,
      standardValue: Schema.Types.Mixed,
      requestedValue: Schema.Types.Mixed,
      scope: String,
      reason: String,
      templateId: String,
      status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Withdrawn', 'Superseded'], default: 'Pending' },
      raisedBy: String,
      decidedBy: String,
      decidedAt: Date,
      decisionComment: String,
    },
    opts,
  ),
);

export const ImportBatch = model(
  'ImportBatch',
  new Schema(
    {
      environmentId: envRef,
      entity: String,
      sourceName: String,
      dryRun: Boolean,
      actor: String,
      status: { type: String, enum: ['Completed', 'Dry run', 'Rolled back'] },
      summary: { total: Number, loaded: Number, rejected: Number },
      results: [
        new Schema(
          {
            rowNumber: Number,
            key: String,
            status: { type: String, enum: ['loaded', 'rejected', 'ok'] },
            errors: [{ _id: false, field: String, code: String, message: String }],
          },
          { _id: false, suppressReservedKeysWarning: true },
        ),
      ],
      rolledBackAt: Date,
      rolledBackBy: String,
    },
    opts,
  ),
);

export const AuditLog = model(
  'AuditLog',
  new Schema({
    environmentId: { type: Schema.Types.ObjectId, ref: 'Environment', default: null, index: true },
    actor: String,
    action: String,
    entityType: String,
    entityKey: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    at: { type: Date, default: Date.now, index: true },
  }),
);

export const Webhook = model(
  'Webhook',
  new Schema(
    {
      url: { type: String, required: true },
      events: { type: [String], default: ['*'] },
      environmentId: { type: Schema.Types.ObjectId, ref: 'Environment', default: null },
      active: { type: Boolean, default: true },
      lastDelivery: { at: Date, status: Number, error: String, event: String },
    },
    opts,
  ),
);

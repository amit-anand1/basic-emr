/**
 * Specialty templates ("standard patterns"). Creating an environment from a
 * template pre-loads its appointment types. Any appointment type whose duration
 * differs from the template standard for its category raises an Exception that
 * a human must approve.
 */
export const TEMPLATES = [
  {
    id: 'bh-small-group',
    name: 'Behavioral Health – Small Group',
    specialty: 'Behavioral Health',
    segment: 'Small group',
    standards: { appointmentDurations: { NEW_PATIENT: 45, FOLLOW_UP: 30 } },
    appointmentTypes: [
      { code: 'BH_NEW_45', name: 'New patient consultation', category: 'NEW_PATIENT', durationMinutes: 45 },
      { code: 'BH_FOLLOW_30', name: 'Follow-up consultation', category: 'FOLLOW_UP', durationMinutes: 30 },
    ],
    roles: ['Clinician', 'Scheduler', 'Billing user'],
  },
  {
    id: 'pc-small-group',
    name: 'Primary Care – Small Group',
    specialty: 'Primary Care',
    segment: 'Small group',
    standards: { appointmentDurations: { NEW_PATIENT: 30, FOLLOW_UP: 15 } },
    appointmentTypes: [
      { code: 'PC_NEW_30', name: 'New patient visit', category: 'NEW_PATIENT', durationMinutes: 30 },
      { code: 'PC_FOLLOW_15', name: 'Follow-up visit', category: 'FOLLOW_UP', durationMinutes: 15 },
      { code: 'PC_ANNUAL_30', name: 'Annual wellness visit', category: 'OTHER', durationMinutes: 30 },
    ],
    roles: ['Clinician', 'Scheduler', 'Billing user', 'Front desk'],
  },
];

export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id) || null;

# Basic EMR

A minimal EMR (electronic medical record) application built with the MERN stack (MongoDB, Express, React, Node). It covers the onboarding lifecycle of a new clinic:

**Set up environment → Configure → Migrate data → Run (patients and scheduling)**

It is built **API-first**: every action in the UI is also a REST call, every change is written to an audit log, and every change can be pushed to a webhook. An orchestration layer such as Beacon can drive it without touching the code.

> **Validation is deliberately not in this app.** The EMR only runs *integrity guardrails*: checks for data it physically cannot store. All business-rule validation, readiness decisions and subset decisions are meant to be done by Beacon. See [Validation: what the EMR does and what Beacon does](#validation-what-the-emr-does-and-what-beacon-does).

---

## 1. Run it

**Prerequisite:** Node.js 18 or later (tested on Node 25). MongoDB does **not** need to be installed. The backend starts an embedded MongoDB automatically. The first start downloads the MongoDB binary (~100 MB), which takes a minute.

```bash
# Terminal 1 — API on http://localhost:5050/api
cd emr-app/backend
npm install
npm run dev

# Terminal 2 — UI on http://localhost:5173
cd emr-app/frontend
npm install
npm run dev
```

Open **http://localhost:5173**.

| Task | How |
|---|---|
| Load the demo client's configuration in one step | With the backend running: `cd backend && npm run seed:greenfield` |
| Start again from empty | Stop the backend, delete `backend/.mongo-data/`, start it again |
| Use your own MongoDB or Atlas | `cp backend/.env.example backend/.env` and set `MONGO_URI=...` |
| Change ports | `PORT` in `backend/.env`; `VITE_API_URL` when starting the frontend |

---

## 2. Folder structure

```
emr-app/
├── README.md                     ← this file
├── sample-data/
│   └── Provider_Roster.csv       ← "Provider Roster" sheet of the demo workbook, as CSV (for import)
├── backend/                      ← Node + Express + Mongoose API
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── server.js             ← starts DB + HTTP server
│       ├── app.js                ← Express app, mounts all routes, error handling
│       ├── db.js                 ← MONGO_URI, or embedded MongoDB stored in backend/.mongo-data
│       ├── templates.js          ← specialty templates (standard appointment types and durations)
│       ├── utils.js              ← helpers (errors, date/time checks, CSV escaping)
│       ├── models/index.js       ← all MongoDB schemas
│       ├── services/
│       │   ├── registry.js       ← one definition per record type: fields, keys, references, import aliases
│       │   ├── integrity.js      ← the integrity guardrails (the ONLY checks the EMR does)
│       │   ├── exceptions.js     ← raises/decides "non-standard configuration" exceptions
│       │   └── audit.js          ← audit log + webhook delivery
│       ├── routes/
│       │   ├── environments.js   ← create/list/update environments, status, summary, delete
│       │   ├── resources.js      ← generic CRUD for locations, departments, providers,
│       │   │                       appointment-types, users, patients, appointments
│       │   ├── imports.js        ← bulk import (migration), dry run, rollback
│       │   └── misc.js           ← exceptions, audit log, activity-report export, webhooks
│       └── scripts/seedGreenfield.js ← creates the demo client through the REST API
└── frontend/                     ← React (Vite) UI
    ├── package.json
    ├── vite.config.js            ← dev server; proxies /api to the backend
    └── src/
        ├── main.jsx              ← routes
        ├── api.js                ← fetch wrapper (sends X-Actor header)
        ├── entities.js           ← table columns and form fields per record type
        ├── styles.css
        ├── components/
        │   ├── Layout.jsx        ← top bar ("Acting as") + environment sidebar
        │   ├── EntityManager.jsx ← reusable table with add/edit/delete
        │   ├── RecordForm.jsx    ← reusable form that shows backend integrity errors per field
        │   └── ui.jsx            ← Modal, badges, error box, page header
        └── pages/
            ├── Environments.jsx  ← list + "Set up environment"
            ├── Overview.jsx      ← status, counts, details, recent activity
            ├── Configuration.jsx ← tabs: Locations, Departments, Providers, Appointment types, Users
            ├── Exceptions.jsx    ← approve/reject non-standard configuration
            ├── DataImport.jsx    ← CSV upload → mapping → subset → dry run/load → results/rollback
            ├── Patients.jsx      ← patient list
            ├── PatientDetail.jsx ← one patient's record + appointments
            ├── Schedule.jsx      ← weekly calendar, booking, status changes
            ├── Integrations.jsx  ← activity-report export, webhooks, API cheat sheet
            └── AuditLog.jsx      ← every change with before/after
```

---

## 3. The pages and how to use them

Type your name in **"Acting as"** in the top bar. Every change you make is logged under `ui:<your name>`.

### Environments (home page)
The list of client environments, one per clinic or group.
- **Set up environment** creates one. Pick a **specialty template** to pre-load its standard appointment types, e.g. *Behavioral Health – Small Group* loads `BH_NEW_45` (45 min) and `BH_FOLLOW_30` (30 min).

### Overview
- **Status bar** (Draft → Configuring → Migrating → Validating → Ready → Live). Click a step to change it. The EMR does not block any change; deciding when to move forward is Beacon's job.
- **Counts** for every record type. Click a count to open that page.
- **Details**, **template standards**, **recent activity**, and **Delete environment** (you must type the name to confirm).

### Configuration
Set up the clinic's setup data. The tab order is the order to work in, because later tabs refer to earlier ones:
1. **Locations**: code + name (e.g. `WEST` / West)
2. **Departments**: code + the location it belongs to (e.g. `GBH-WEST` → `WEST`)
3. **Providers**: ID, name, NPI (**mandatory**), license expiry, locations
4. **Appointment types**: code, category, duration, allowed locations. If the duration differs from the template standard, the type gets an **exception** with status *Pending approval*.
5. **Users**: username and role (Admin, Clinician, Scheduler, Billing user, Front desk)

**Bulk import from Excel** is available on every tab, next to "+ Add":
1. **Download template** gives you `<type>-template.xlsx`. It has the correct column headers, plus an *Instructions* sheet with required columns, formats, allowed values, examples and the codes already configured.
2. Fill one record per row from row 2, then **Upload sheet** (`.xlsx`, `.xls` or `.csv`).
3. Every row is checked before anything is saved. Faulty rows are listed with their **sheet row number** and the reason.
4. **Add N valid records** adds the good rows and skips the faulty ones. Fix the faulty rows and upload again.

Each bulk load is an import batch, so you can **roll it back** from Data Import → Import history.

You cannot delete a record that is still in use. For example, deleting a department that patients belong to returns an error showing how many records refer to it.

### Exceptions
Lists configuration that differs from the template standard. **Decide** opens a form to **Approve** or **Reject** with a comment. The decision is logged with your name.

### Data Import
Migrates existing data into the configured environment.
1. **Choose CSV or Excel file.** The record type is guessed from the file name and can be changed.
2. **Map columns.** Columns are matched automatically by name. Fix any wrong matches. A highlighted row means a required field is not mapped.
3. **Choose rows (optional).** For example, only rows where `Department = GBH-WEST`. This is how you load part of a file.
4. **Dry run** checks without saving anything. **Load** saves every row that passes.
5. **Result** lists each rejected row with its CSV line number and the reason code.
6. **Import history**: **View** shows any past batch, and **Roll back** deletes everything that batch created. Rollback is refused if other records depend on the batch. For example, you must roll back appointments before the patients they belong to.

### Patients and patient record
Search, add, edit and delete patients. Click a patient ID to open their record, which shows demographics, their appointments, **Edit** and **Book appointment**.

### Schedule
A weekly calendar. It opens on the week of the earliest appointment, because migrated data is often in the future. Filter by location or provider, use **+** on a day or **Book appointment** to book, and change an appointment's status (Scheduled, Checked in, Completed, Cancelled, No-show) from its card.

### Integrations
- **Daily activity report (CSV)**: downloads appointments for a date range with the fields from Interface B of the interface spec.
- **Webhooks**: register a URL to receive every event as a JSON POST. You can filter events, e.g. `exception.*`, and use **Send test**.
- **API cheat sheet** for this environment.

### Audit Log
Every change, newest first, showing who made it (`ui:<name>`, `seed-script`, `beacon`…), what the action was, and which record. Click a row to see the **before and after** JSON.

---

## 4. Walkthrough with the demo pack files

The demo files are in the parent folder (`demo_pack/`). This table shows where each one is used:

| Demo pack file | Where it is used in the EMR |
|---|---|
| `Synthetic_Onboarding_Demo_Data.xlsx`, sheet **Case Intake** + **Commercial Handoff** | **Environments → Set up environment**: name, segment, specialty, target go-live 2027-03-15 |
| same workbook, sheet **Knowledge Patterns** | The **Behavioral Health – Small Group template** (45-minute new patient, 30-minute follow-up) |
| same workbook, sheet **Provider Roster** | **Configuration → Providers**, or import `emr-app/sample-data/Provider_Roster.csv` on **Data Import** |
| same workbook, sheet **Partial Questionnaire** | Locations (2), providers (6), users; the 30-minute conflict becomes an appointment type |
| `Fictional_Kickoff_Conversation.docx` | East needs a 30-minute new-patient type: add `BH_NEW_30` and approve it on **Exceptions** |
| `Synthetic_Demographics.csv` | **Data Import** as *Patients* |
| `Synthetic_Appointments.csv` (`.xlsx` is the same data; use the CSV) | **Data Import** as *Appointments* |
| `Fictional_Interface_Specification.docx` | **Integrations**: the activity report export matches Interface B. The claims feed (Interface A) is not built. |
| same workbook, sheets **Readiness Rules** + **Seeded Issues** | **Not in the EMR.** These are Beacon's rulebook (see section 5). |
| `Brand_Neutral_..._Demo_Brief.docx`, `Synthetic_Demo_Data_Pack_README.docx` | Background only |

### Step by step

**Fast path:** run `npm run seed:greenfield` in `backend/`. It performs steps A–C below through the API, except that the exception in step C stays *Pending*. Then continue from step D.

**A. Set up the environment.** Go to Environments → **Set up environment**:
- Name: `Greenfield Behavioral Health Group`
- Template: `Behavioral Health – Small Group`
- Target go-live: `2027-03-15`

On Overview, set the status to **Configuring**.

**B. Configure it** (Configuration page):
- Locations: `WEST` / `West` and `EAST` / `East`. The names must be *West* and *East*, because the provider roster refers to locations by name.
- Departments: `GBH-WEST` → WEST and `GBH-EAST` → EAST. These codes must match the CSVs exactly.
- Providers: Configuration → Providers → **Bulk import from Excel** → upload `sample-data/Provider_Roster.csv`. **5 load, and row 7 (P1006) is rejected**, because NPI is mandatory and P1006 has none.
- Users: add a few, e.g. Mia Parker (Admin) and two Schedulers.

**C. Record the kickoff decision.** Appointment types → **Add**:
- Code `BH_NEW_30`, category `NEW_PATIENT`, 30 minutes, location EAST
- Reason: "East team uses a shorter assessment pathway"

It shows **Pending approval**. Set "Acting as" to *Alex Reed*, then go to **Exceptions → Decide → Approve**.

**D. Migrate patients.** On Overview, set the status to **Migrating**. Data Import → `Synthetic_Demographics.csv` → *Patients*. Try **Dry run** first, then **Load**. Expected: **97 loaded, 3 rejected**.

**E. Migrate appointments.** Data Import → `Synthetic_Appointments.csv` → *Appointments* → **Load**. Expected: **116 loaded, 34 rejected**. That's the 11 bad rows plus P1006's 25 appointments, which are rejected because P1006 isn't configured. The second `APPT0089` now loads, because the first one, a P1006 row, was rejected.
- If you skipped step C, `APPT0024` is also rejected, because `BH_NEW_30` doesn't exist.
- To show a partial load, first choose rows where `Department = GBH-WEST`, then load the rest later.

**F. Use it.**
- **Schedule** opens on the week of 1 February 2027.
- Open a patient from a calendar card.
- Mark visits *Completed*.
- Download the activity report on **Integrations**.
- Look at everything that happened on **Audit Log**.

**G. Undo.** Data Import → Import history → **Roll back** the appointments batch, then the patients batch.

---

## 5. Validation: what the EMR does and what Beacon does

### How real EMRs handle this
Commercial EMRs ship **bulk-load or conversion utilities** that enforce the database's own rules. Required fields must be present, dates must be readable, codes must exist in the configured master tables, and IDs must be unique. Failures go to a reject or error log. The heavier work happens **outside the EMR**, by the implementation and conversion team using scripts, ETL tools, spreadsheets or a conversion vendor:
- profiling and cleaning the source data
- applying business rules
- deciding what to fix or hold
- doing repeated "mock" loads

That outside layer is the gap Beacon fills. This app reproduces only the EMR side.

### Integrity guardrails in the EMR (`backend/src/services/integrity.js`)
| Code | Meaning |
|---|---|
| `REQUIRED` | A mandatory field is empty (including a provider's NPI) |
| `INVALID_FORMAT` | A date, time or number cannot be read (e.g. `13/40/1988`, `2027-02-30`) |
| `INVALID_VALUE` | The value is not in a fixed list (e.g. appointment status) |
| `UNKNOWN_REFERENCE` | A code points at configuration or records that don't exist (department, provider, patient, appointment type, location) |
| `DUPLICATE_KEY` | The ID already exists, in the database or earlier in the same file |
| `KEY_IMMUTABLE` | An update tries to change a record's ID |

### What the demo files contain, and who catches each problem
| Seeded problem | Caught by the EMR? | Should be caught by Beacon |
|---|---|---|
| Demographics: duplicate `PT0009` | ✅ `DUPLICATE_KEY` (line 11) | Explain which copy is correct |
| Demographics: `PT0040` department `UNKNOWN-DEPT` | ✅ `UNKNOWN_REFERENCE` | Route to the data owner |
| Demographics: `PT0050` birth date `13/40/1988` | ✅ `INVALID_FORMAT` | Suggest a correction |
| Demographics: `PT0020` born **2032** (future) | ❌ loads | ✅ business rule |
| Demographics: `PT0030` state **ZZ** | ❌ loads | ✅ business rule |
| Demographics: `PT0060` **blank department** | ❌ loads (department is optional for a patient) | ✅ completeness rule |
| Appointments: unknown patient `PT9999`, provider `P1999`, `UNKNOWN-DEPT`, blank type, duplicate `APPT0089` | ✅ rejected | Link each to the governing decision |
| Appointments: patients `PT0010`, `PT0040`, `PT0050` (missing or rejected) | ✅ `UNKNOWN_REFERENCE` (knock-on from the patient load) | Show the chain of cause |
| Appointments for **P1006** (not loaded: no NPI): ~25 rows | ✅ `UNKNOWN_REFERENCE` (P1006 doesn't exist) | Explain that they're held until P1006 gets an NPI, then re-send them |
| **P1002 / P1005 licenses expiring** within 90 days, with appointments after the expiry date | ❌ load | ✅ warnings and credentialing tasks |
| `BH_NEW_30` appointment while its exception is **still pending** | ❌ loads (the type exists) | ✅ hold East's conditional subset until approval |
| Activity-report schedule and acknowledgement, UAT owner | n/a (not EMR data) | ✅ open decisions and readiness gates |

**The usual pattern for Beacon:**
1. Read the configuration (`GET` endpoints).
2. Validate the source file.
3. Decide which subset can go in.
4. Send only those rows to `POST /imports`. Use `dryRun: true` to confirm first.
5. Listen to webhooks.
6. Move the environment status forward when its own readiness rules pass.

---

## 6. API reference (for Beacon)

Base URL: `http://localhost:5050/api`. Send `Content-Type: application/json` and an **`X-Actor`** header (e.g. `beacon`) so actions are attributed correctly in the audit log.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/schema` | All record types, fields, required flags, references, import aliases |
| GET | `/templates` | Specialty templates and their standards |
| GET, POST | `/environments` | List / create (`{ name, organization:{name,segment,specialty}, templateId, targetGoLive, description }`) |
| GET, PATCH, DELETE | `/environments/:envId` | Read / update details / delete with all data |
| POST | `/environments/:envId/status` | `{ status }`: Draft, Configuring, Migrating, Validating, Ready, Live |
| GET | `/environments/:envId/summary` | Record counts, pending exceptions, template |
| GET, POST | `/environments/:envId/{entity}` | List (filter by any field, `q=` search; appointments also `from=`/`to=`) / create |
| GET, PUT, DELETE | `/environments/:envId/{entity}/:id` | Read / partial update / delete (409 if referenced) |
| POST | `/environments/:envId/imports` | Bulk load, see below |
| GET | `/environments/:envId/imports[/:batchId]` | Import history / one batch with per-row results |
| POST | `/environments/:envId/imports/:batchId/rollback` | Delete everything the batch created (409 if other records depend on it) |
| GET | `/environments/:envId/exceptions?status=Pending` | Configuration exceptions |
| POST | `/environments/:envId/exceptions/:id/decision` | `{ decision: "Approved" \| "Rejected", comment }` |
| GET | `/environments/:envId/audit?since=ISO&entityType=&action=` | Audit trail / event history (polling alternative to webhooks) |
| GET | `/environments/:envId/exports/activity-report.csv?from=&to=` | Daily activity report |
| GET, POST, DELETE | `/webhooks[/:id]` | `{ url, events:["*"\|"exception.*"\|"patient.created"…], environmentId? }` |
| POST | `/webhooks/:id/test` | Send a test event |

`{entity}` is one of `locations`, `departments`, `providers`, `appointment-types`, `users`, `patients`, `appointments`. Their IDs are `code`, `code`, `providerId`, `code`, `username`, `patientId`, `appointmentId`.

**Bulk import body**
```json
{
  "entity": "appointments",
  "rows": [{ "Appointment_ID": "APPT0001", "Patient_ID": "PT0002", "...": "..." }],
  "mapping": { "Appointment_ID": "appointmentId", "Patient_ID": "patientId", "Department": "departmentCode" },
  "rowNumbers": [2],
  "sourceName": "Synthetic_Appointments.csv",
  "dryRun": false
}
```
`mapping` (source column → EMR field) is optional; without it, rows must already use EMR field names. The response is the batch: `summary { total, loaded, rejected }` and `results[] { rowNumber, key, status, errors[{ field, code, message }] }`.

**Errors** use one shape: `{ "error": "Integrity check failed", "details": [{ "field", "code", "message" }] }` with HTTP 422. A conflict (record in use, rollback blocked) returns 409, and a missing record returns 404.

**Events** (webhook `event` = audit `action`):
- `environment.created | updated | status_changed | deleted`
- `<type>.created | updated | deleted`, where `<type>` is `location`, `department`, `provider`, `appointmentType`, `user`, `patient`, `appointment`
- `exception.raised | approved | rejected | withdrawn | superseded`
- `import.completed | dry_run | rolled_back`
- `webhook.test`

Imports send **one** `import.completed` event per batch, not one per row.

---

## 7. Not included (by design)
- Login and authentication (the `X-Actor` header is trusted)
- Billing and claims processing (Interface A)
- e-Prescribing, labs, clinical notes or coding (ICD/CPT), patient portal
- HIPAA hardening

This is a demo and orchestration test bed. Do not put real patient data in it.

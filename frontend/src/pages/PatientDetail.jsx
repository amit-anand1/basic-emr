import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { ENTITY_UI } from '../entities.js';
import RecordForm from '../components/RecordForm.jsx';
import { ErrorBox, Modal, PageHeader, StatusBadge } from '../components/ui.jsx';

/** Page 6b — one patient's record: demographics + appointments, edit and book. */
export default function PatientDetail() {
  const { env } = useOutletContext();
  const { patientId } = useParams();
  const [patient, setPatient] = useState(null);
  const [appts, setAppts] = useState([]);
  const [modal, setModal] = useState(null); // 'edit' | 'book'
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    const id = encodeURIComponent(patientId);
    api(`/environments/${env._id}/patients/${id}`).then(setPatient).catch(setError);
    api(`/environments/${env._id}/appointments?patientId=${id}`).then(setAppts).catch(setError);
  }, [env._id, patientId]);
  useEffect(load, [load]);

  if (error) return <><ErrorBox error={error} /><Link to={`/env/${env._id}/patients`}>← Patients</Link></>;
  if (!patient) return <p className="muted">Loading…</p>;

  const done = () => {
    setModal(null);
    load();
  };

  return (
    <div>
      <Link to={`/env/${env._id}/patients`} className="small">← Patients</Link>
      <PageHeader title={`${patient.firstName} ${patient.lastName}`} subtitle={`Patient ID ${patient.patientId}`}>
        <button className="btn" onClick={() => setModal('edit')}>Edit</button>
        <button className="btn primary" onClick={() => setModal('book')}>+ Book appointment</button>
      </PageHeader>
      <div className="two-col">
        <section className="card">
          <h3>Demographics</h3>
          <dl className="details">
            <dt>Date of birth</dt><dd>{patient.dateOfBirth}</dd>
            <dt>Sex</dt><dd>{patient.sex || '—'}</dd>
            <dt>State</dt><dd>{patient.state || '—'}</dd>
            <dt>Phone</dt><dd>{patient.phone || '—'}</dd>
            <dt>Email</dt><dd>{patient.email || '—'}</dd>
            <dt>Department</dt><dd>{patient.departmentCode || '—'}</dd>
            <dt>Source</dt><dd>{patient.importBatchId ? 'Data import' : 'Registered in EMR'}</dd>
          </dl>
        </section>
        <section className="card">
          <h3>Appointments ({appts.length})</h3>
          <table className="compact">
            <thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Provider</th><th>Dept</th><th>Status</th></tr></thead>
            <tbody>
              {appts.length === 0 && <tr><td colSpan={6} className="empty">No appointments.</td></tr>}
              {appts.map((a) => (
                <tr key={a._id}>
                  <td>{a.date}</td><td>{a.time}</td><td>{a.appointmentTypeCode} ({a.durationMinutes}m)</td>
                  <td>{a.providerId}</td><td>{a.departmentCode}</td><td><StatusBadge value={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      {modal === 'edit' && (
        <Modal title="Edit patient" onClose={() => setModal(null)} wide>
          <RecordForm envId={env._id} entity="patients" ui={ENTITY_UI.patients} record={patient} onCancel={() => setModal(null)} onSaved={done} />
        </Modal>
      )}
      {modal === 'book' && (
        <Modal title="Book appointment" onClose={() => setModal(null)} wide>
          <RecordForm
            envId={env._id}
            entity="appointments"
            ui={ENTITY_UI.appointments}
            defaults={{ patientId: patient.patientId, departmentCode: patient.departmentCode || '', appointmentId: `APPT${Date.now().toString().slice(-6)}` }}
            onCancel={() => setModal(null)}
            onSaved={done}
          />
        </Modal>
      )}
    </div>
  );
}

import { useOutletContext } from 'react-router-dom';
import EntityManager from '../components/EntityManager.jsx';
import { PageHeader } from '../components/ui.jsx';

/** Page 6 — patient list (search, add, edit, delete). Click an ID to open the chart. */
export default function Patients() {
  const { env } = useOutletContext();
  return (
    <div>
      <PageHeader title="Patients" subtitle="Patients loaded by import or registered here. Click a patient ID to open their record." />
      <EntityManager envId={env._id} entity="patients" rowLink={(p) => `/env/${env._id}/patients/${encodeURIComponent(p.patientId)}`} />
    </div>
  );
}

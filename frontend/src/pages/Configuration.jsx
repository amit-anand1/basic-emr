import { Navigate, NavLink, useOutletContext, useParams } from 'react-router-dom';
import EntityManager from '../components/EntityManager.jsx';
import { PageHeader } from '../components/ui.jsx';
import { ENTITY_UI } from '../entities.js';

const SECTIONS = ['locations', 'departments', 'providers', 'appointment-types', 'users'];

/** Page 3 — configuration (setup data), one tab per type. Order of tabs = recommended order of setup. */
export default function Configuration() {
  const { env } = useOutletContext();
  const { section } = useParams();
  if (!section || !SECTIONS.includes(section)) return <Navigate to={`/env/${env._id}/config/locations`} replace />;
  const ui = ENTITY_UI[section];
  return (
    <div>
      <PageHeader title="Configuration" subtitle="Set up the clinic before migrating data. Work left to right: locations → departments → providers → appointment types → users." />
      <div className="tabs">
        {SECTIONS.map((s, i) => (
          <NavLink key={s} to={`/env/${env._id}/config/${s}`}>
            <span className="tab-num">{i + 1}</span>{ENTITY_UI[s].label}
          </NavLink>
        ))}
      </div>
      <p className="muted">{ui.help}</p>
      <EntityManager key={section} envId={env._id} entity={section} bulk />
    </div>
  );
}

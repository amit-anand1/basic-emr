import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Modal, PageHeader, StatusBadge } from '../components/ui.jsx';

/** Page 1 — list of client environments + "Set up environment". */
export default function Environments() {
  const [envs, setEnvs] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/environments').then(setEnvs).catch(setError);
    api('/templates').then(setTemplates).catch(setError);
  }, []);

  const tplName = (id) => templates.find((t) => t.id === id)?.name || 'Blank';

  return (
    <div className="page narrow">
      <PageHeader title="Environments" subtitle="One environment per client (clinic or group). Each is configured and migrated separately.">
        <button className="btn primary" onClick={() => setCreating(true)}>+ Set up environment</button>
      </PageHeader>
      <ErrorBox error={error} />
      {envs && envs.length === 0 && (
        <div className="empty-state">
          <h3>No environments yet</h3>
          <p>Create one with <strong>Set up environment</strong>, or run <code>npm run seed:greenfield</code> in the backend folder to load the demo client.</p>
        </div>
      )}
      {envs && envs.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Specialty</th><th>Template</th><th>Status</th><th>Target go-live</th><th>Created</th></tr>
            </thead>
            <tbody>
              {envs.map((e) => (
                <tr key={e._id}>
                  <td><Link to={`/env/${e._id}`}><strong>{e.name}</strong></Link></td>
                  <td>{e.organization?.specialty}</td>
                  <td>{tplName(e.templateId)}</td>
                  <td><StatusBadge value={e.status} /></td>
                  <td>{e.targetGoLive}</td>
                  <td>{new Date(e.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <CreateEnvironment onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateEnvironment({ onClose }) {
  const navigate = useNavigate();
  const [v, setV] = useState({ name: '', orgName: '', segment: '', specialty: '', templateId: '', targetGoLive: '', description: '' });
  const [error, setError] = useState(null);
  const [templates, setTemplates] = useState(null); // null = loading

  // Load templates every time the form opens, so a backend that was down earlier doesn't leave the list empty.
  useEffect(() => {
    api('/templates')
      .then(setTemplates)
      .catch((err) => {
        setTemplates([]);
        setError(new Error(`Could not load specialty templates (${err.message}). Check that the backend is running, then reopen this form.`));
      });
  }, []);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  function pickTemplate(e) {
    const tpl = (templates || []).find((t) => t.id === e.target.value);
    setV({ ...v, templateId: e.target.value, specialty: tpl?.specialty || v.specialty, segment: tpl?.segment || v.segment });
  }

  async function submit(e) {
    e.preventDefault();
    try {
      const env = await api('/environments', {
        method: 'POST',
        body: {
          name: v.name,
          organization: { name: v.orgName || v.name, segment: v.segment, specialty: v.specialty },
          templateId: v.templateId || null,
          targetGoLive: v.targetGoLive,
          description: v.description,
        },
      });
      navigate(`/env/${env._id}`);
    } catch (err) {
      setError(err);
    }
  }

  const tpl = (templates || []).find((t) => t.id === v.templateId);
  return (
    <Modal title="Set up environment" onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <ErrorBox error={error} />
        <div className="form-grid">
          <div className="field"><label>Environment name<span className="req">*</span></label><input value={v.name} onChange={set('name')} placeholder="Greenfield Behavioral Health Group" autoFocus /></div>
          <div className="field"><label>Organization legal name</label><input value={v.orgName} onChange={set('orgName')} placeholder="(same as environment name)" /></div>
          <div className="field">
            <label>Specialty template</label>
            <select value={v.templateId} onChange={pickTemplate} disabled={templates === null}>
              <option value="">{templates === null ? 'Loading templates…' : 'Blank — no template'}</option>
              {(templates || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Target go-live</label><input type="date" value={v.targetGoLive} onChange={set('targetGoLive')} /></div>
          <div className="field"><label>Specialty</label><input value={v.specialty} onChange={set('specialty')} /></div>
          <div className="field"><label>Segment</label><input value={v.segment} onChange={set('segment')} placeholder="Small group" /></div>
          <div className="field span-2"><label>Description</label><textarea rows={2} value={v.description} onChange={set('description')} /></div>
        </div>
        {tpl && (
          <div className="callout">
            <strong>{tpl.name}</strong> will pre-load these appointment types:{' '}
            {tpl.appointmentTypes.map((a) => `${a.code} (${a.durationMinutes} min)`).join(', ')}.
            Standard roles: {tpl.roles.join(', ')}.
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">Create environment</button>
        </div>
      </form>
    </Modal>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { APPT_STATUSES, ENTITY_UI } from '../entities.js';
import RecordForm, { useOptions } from '../components/RecordForm.jsx';
import { ErrorBox, Modal, PageHeader } from '../components/ui.jsx';

const DAY = 86400000;
const toDate = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => fmt(new Date(toDate(s).getTime() + n * DAY));
const mondayOf = (s) => {
  const d = toDate(s);
  return addDays(s, -((d.getUTCDay() + 6) % 7));
};
const endTime = (time, minutes) => {
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m + (minutes || 0);
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** Page 7 — weekly schedule by location/provider; book appointments and change status. */
export default function Schedule() {
  const { env } = useOutletContext();
  const [week, setWeek] = useState(null);
  const [appts, setAppts] = useState([]);
  const [location, setLocation] = useState('');
  const [provider, setProvider] = useState('');
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  const opts = useOptions(env._id, ['locations', 'departments', 'providers', 'patients']);

  // Start on the week of the earliest appointment (migrated data is often in the future), else this week.
  useEffect(() => {
    api(`/environments/${env._id}/appointments?limit=1`)
      .then((rows) => setWeek(mondayOf(rows[0]?.date || fmt(new Date()))))
      .catch(setError);
  }, [env._id]);

  const load = useCallback(() => {
    if (!week) return;
    api(`/environments/${env._id}/appointments?from=${week}&to=${addDays(week, 6)}${provider ? `&providerId=${provider}` : ''}`)
      .then(setAppts)
      .catch(setError);
  }, [env._id, week, provider]);
  useEffect(load, [load]);

  const deptLocation = useMemo(() => new Map((opts.departments || []).map((d) => [d.value, d.row.locationCode])), [opts]);
  const providerName = useMemo(() => new Map((opts.providers || []).map((p) => [p.value, p.row.name])), [opts]);
  const patientName = useMemo(() => new Map((opts.patients || []).map((p) => [p.value, `${p.row.firstName} ${p.row.lastName}`])), [opts]);

  const visible = appts.filter((a) => !location || deptLocation.get(a.departmentCode) === location);

  async function setStatus(a, status) {
    try {
      await api(`/environments/${env._id}/appointments/${encodeURIComponent(a.appointmentId)}`, { method: 'PUT', body: { status } });
      load();
    } catch (e) {
      setError(e);
    }
  }

  if (!week) return <p className="muted">Loading…</p>;
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

  return (
    <div>
      <PageHeader title="Schedule" subtitle={`Week of ${week}`}>
        <button className="btn primary" onClick={() => setBooking(days[0])}>+ Book appointment</button>
      </PageHeader>
      <ErrorBox error={error} />
      <div className="toolbar">
        <button className="btn" onClick={() => setWeek(addDays(week, -7))}>← Prev</button>
        <input type="date" value={week} onChange={(e) => e.target.value && setWeek(mondayOf(e.target.value))} />
        <button className="btn" onClick={() => setWeek(addDays(week, 7))}>Next →</button>
        <button className="btn" onClick={() => setWeek(mondayOf(fmt(new Date())))}>This week</button>
        <select value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="">All locations</option>
          {(opts.locations || []).map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="">All providers</option>
          {(opts.providers || []).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <span className="muted small">{visible.length} appointment(s)</span>
      </div>
      <div className="week">
        {days.map((d) => {
          const list = visible.filter((a) => a.date === d);
          return (
            <div key={d} className="day">
              <div className="day-head">
                <strong>{toDate(d).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}</strong>
                <span className="muted">{d.slice(5)}</span>
                <button className="icon-btn" title="Book on this day" onClick={() => setBooking(d)}>+</button>
              </div>
              {list.length === 0 && <div className="muted small day-empty">—</div>}
              {list.map((a) => (
                <div key={a._id} className={`appt status-${a.status.replace(/\s/g, '').toLowerCase()}`}>
                  <div className="appt-time">{a.time}–{endTime(a.time, a.durationMinutes)}</div>
                  <Link to={`/env/${env._id}/patients/${encodeURIComponent(a.patientId)}`} className="appt-patient">
                    {patientName.get(a.patientId) || a.patientId}
                  </Link>
                  <div className="small">{a.appointmentTypeCode} · {a.durationMinutes}m</div>
                  <div className="small muted">{providerName.get(a.providerId) || a.providerId} · {a.departmentCode}</div>
                  <select className="appt-status" value={a.status} onChange={(e) => setStatus(a, e.target.value)}>
                    {APPT_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {booking && (
        <Modal title="Book appointment" onClose={() => setBooking(null)} wide>
          <RecordForm
            envId={env._id}
            entity="appointments"
            ui={ENTITY_UI.appointments}
            defaults={{ date: booking, time: '09:00', appointmentId: `APPT${Date.now().toString().slice(-6)}`, providerId: provider }}
            onCancel={() => setBooking(null)}
            onSaved={() => {
              setBooking(null);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

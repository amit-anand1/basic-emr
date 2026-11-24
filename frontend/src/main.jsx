import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './styles.css';
import { Shell, EnvShell } from './components/Layout.jsx';
import Environments from './pages/Environments.jsx';
import Overview from './pages/Overview.jsx';
import Configuration from './pages/Configuration.jsx';
import Exceptions from './pages/Exceptions.jsx';
import DataImport from './pages/DataImport.jsx';
import Patients from './pages/Patients.jsx';
import PatientDetail from './pages/PatientDetail.jsx';
import Schedule from './pages/Schedule.jsx';
import Integrations from './pages/Integrations.jsx';
import AuditLog from './pages/AuditLog.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Shell />}>
          <Route index element={<Environments />} />
          <Route path="env/:envId" element={<EnvShell />}>
            <Route index element={<Overview />} />
            <Route path="config" element={<Configuration />} />
            <Route path="config/:section" element={<Configuration />} />
            <Route path="exceptions" element={<Exceptions />} />
            <Route path="import" element={<DataImport />} />
            <Route path="patients" element={<Patients />} />
            <Route path="patients/:patientId" element={<PatientDetail />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="integrations" element={<Integrations />} />
            <Route path="audit" element={<AuditLog />} />
          </Route>
          <Route path="*" element={<div className="page"><h1>Page not found</h1></div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);

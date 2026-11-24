import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import environmentsRouter, { loadEnv } from './routes/environments.js';
import resourcesRouter from './routes/resources.js';
import importsRouter from './routes/imports.js';
import { exceptionsRouter, auditRouter, exportsRouter, webhooksRouter } from './routes/misc.js';
import { TEMPLATES } from './templates.js';
import { describeEntities } from './services/registry.js';
import { ENV_STATUSES } from './models/index.js';
import { HttpError } from './utils.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '25mb' }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.get('/api/health', (req, res) => res.json({
    ok: true,
    db: mongoose.connection.readyState === 1,
    dbHost: mongoose.connection.host,
    dbName: mongoose.connection.name,
  }));
  app.get('/api/templates', (req, res) => res.json(TEMPLATES));
  app.get('/api/schema', (req, res) => res.json({ environmentStatuses: ENV_STATUSES, entities: describeEntities() }));

  app.use('/api/webhooks', webhooksRouter);
  app.use('/api/environments', environmentsRouter);

  const envScoped = express.Router({ mergeParams: true });
  envScoped.use('/imports', importsRouter);
  envScoped.use('/exceptions', exceptionsRouter);
  envScoped.use('/audit', auditRouter);
  envScoped.use('/exports', exportsRouter);
  envScoped.use('/', resourcesRouter);
  app.use('/api/environments/:envId', loadEnv, envScoped);

  app.use('/api', (req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` }));

  // Production: serve the built React app (frontend/dist) from the same server,
  // so the whole EMR runs on one URL. In development Vite serves the frontend instead.
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('/{*splat}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err?.code === 11000) return res.status(409).json({ error: 'Duplicate record ID', details: err.keyValue });
    if (err?.name === 'ValidationError') return res.status(422).json({ error: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

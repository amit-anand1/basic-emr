/**
 * Serverless entry point (used by Vercel). Vercel imports this file and calls
 * the exported Express app for each request; it never calls listen().
 * For local development keep using `npm run dev` (src/server.js).
 */
import express from 'express';
import mongoose from 'mongoose';
import { createApp } from './src/app.js';

let connecting = null;

/** Opens the Atlas connection once per serverless instance and reuses it. */
async function ensureDb() {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not set. Add it in Vercel → Project → Settings → Environment Variables.');
  }
  connecting ??= mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
    .catch((err) => { connecting = null; throw err; });
  await connecting;
}

const app = express();
app.use(async (req, res, next) => {
  try {
    await ensureDb();
    next();
  } catch (err) {
    console.error('[db]', err.message);
    res.status(503).json({ error: `Database unavailable: ${err.message}` });
  }
});
app.use(createApp());

export default app;

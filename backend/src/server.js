import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Always read backend/.env, whichever folder the server is started from.
// (Real environment variables, e.g. on AWS, take precedence over the file.)
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
import { connectDb, disconnectDb } from './db.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT || 5050);

await connectDb();
const server = createApp().listen(PORT, () => {
  console.log(`[api] Basic EMR API listening on http://localhost:${PORT}/api`);
});

async function shutdown() {
  server.close();
  await disconnectDb();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

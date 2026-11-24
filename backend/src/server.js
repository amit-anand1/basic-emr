import 'dotenv/config';
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

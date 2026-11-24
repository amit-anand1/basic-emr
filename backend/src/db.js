import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let embedded = null;

/**
 * Connects to MONGO_URI when set. Otherwise starts an embedded MongoDB
 * (via mongodb-memory-server) that stores its files in backend/.mongo-data,
 * so data survives restarts and nothing has to be installed.
 */
export async function connectDb() {
  let uri = process.env.MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const dbPath = path.join(backendDir, '.mongo-data');
    fs.mkdirSync(dbPath, { recursive: true });
    embedded = await MongoMemoryServer.create({
      instance: { dbPath, storageEngine: 'wiredTiger', port: Number(process.env.EMBEDDED_MONGO_PORT || 27027) },
    });
    uri = embedded.getUri('basic_emr');
    console.log(`[db] embedded MongoDB running at ${uri} (data in ${dbPath})`);
  }
  await mongoose.connect(uri);
  console.log('[db] connected');
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (embedded) await embedded.stop({ doCleanup: false });
}

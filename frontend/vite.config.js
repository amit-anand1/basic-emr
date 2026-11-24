import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies /api to the Express backend.
const API_URL = process.env.VITE_API_URL || 'http://localhost:5050';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': API_URL } },
  preview: { port: 4173, proxy: { '/api': API_URL } },
});

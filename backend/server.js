'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const timersRouter     = require('./src/routes/timers');
const healthRouter     = require('./src/routes/health');
const movementRouter   = require('./src/routes/movementLog');

const app = express();

// Allow any localhost origin — Vite dev server can shift ports (5173, 5174…)
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || null;
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / curl
    if (ALLOWED_ORIGIN) return cb(null, origin === ALLOWED_ORIGIN);
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) {
      return cb(null, true);
    }
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
}));
app.use(express.json({ limit: '50kb' }));

// Routes
app.use('/api/system-timers', timersRouter);
app.use('/api/health',        healthRouter);
app.use('/api/movement-log',  movementRouter);

// 404 catch-all
app.use((_req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));

// Generic error handler (Express 5 propagates async errors here)
app.use((err, _req, res, _next) => {
  console.error('[chronos] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
});

const PORT = parseInt(process.env.PORT || '3001', 10);

if (require.main === module) {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Chronos backend listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = app; // exported for supertest

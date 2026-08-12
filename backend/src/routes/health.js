'use strict';

const express = require('express');
const router = express.Router();
const { healthCheck } = require('../services/systemdService');

router.get('/', async (_req, res) => {
  const result = await healthCheck();
  // Return 200 for degraded (it works), 503 only for genuinely unavailable
  const status = result.available ? 200 : 503;
  return res.status(status).json({
    ok:             result.available,
    systemd:        result.available ? 'available' : 'unavailable',
    state:          result.state || null,
    reason:         result.reason || null,
    detail:         result.detail || null,
    isLikelySandbox: result.isLikelySandbox || false,
  });
});

module.exports = router;

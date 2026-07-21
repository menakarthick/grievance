'use strict';

const { Router } = require('express');
const { sequelize } = require('../config/database');
const { redisClient } = require('../config/redis');
const { asyncHandler } = require('../utils/asyncHandler');

const router = Router();

// Liveness: the process is up and able to handle HTTP traffic. Deliberately
// does not touch MySQL/Redis — a dependency outage should not make the
// orchestrator (PM2/Docker/k8s) restart a process that is otherwise healthy.
router.get('/', (req, res) => {
  res
    .status(200)
    .json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

// Readiness: the process is additionally able to serve real requests, i.e.
// its dependencies are reachable. Used for load-balancer/orchestrator
// traffic-admission decisions, distinct from liveness above.
router.get(
  '/ready',
  asyncHandler(async (req, res) => {
    const checks = { database: 'down', redis: 'down' };

    await Promise.all([
      sequelize
        .authenticate()
        .then(() => {
          checks.database = 'up';
        })
        .catch(() => {}),
      redisClient
        .ping()
        .then(() => {
          checks.redis = 'up';
        })
        .catch(() => {}),
    ]);

    const allUp = Object.values(checks).every((status) => status === 'up');
    res.status(allUp ? 200 : 503).json({
      status: allUp ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  }),
);

module.exports = router;

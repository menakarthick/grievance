'use strict';

const { Router } = require('express');
const { sendSuccess } = require('../../utils/apiResponse');

const authRoutes = require('./auth.routes');
const citizenRoutes = require('./citizen.routes');
const complaintRoutes = require('./complaint.routes');
const aiRoutes = require('./ai.routes');
const adminRoutes = require('./admin.routes');
const geoRoutes = require('./geo.routes');
const notificationRoutes = require('./notification.routes');
const reportRoutes = require('./report.routes');
const auditRoutes = require('./audit.routes');
const fileRoutes = require('./file.routes');

const router = Router();

// docs/15-API-Versioning.md §15.2: URI versioning, /api/v1 mounted once
// here by src/app.js. Section 12.15's illustrative version-info shape.
router.get('/', (req, res) => {
  sendSuccess(res, {
    data: { currentVersion: 'v1', supportedVersions: ['v1'] },
  });
});

// Every prefixed router is registered before either root-mounted ("no
// common path prefix") router below. adminRoutes/notificationRoutes each
// apply their own blanket authenticate()/requireTenant() via a path-less
// router.use() — mounted at the v1 router root, Express runs that
// middleware for every /api/v1/* request that reaches this point in the
// stack, prefixed or not, since a root mount matches everything. A prefixed
// router registered *after* one of these would have any of its own
// intentionally-unauthenticated routes (e.g. file.routes.js's signed
// download-token endpoint) incorrectly 401 before ever reaching its own
// handler. Registering all prefixed routers first means Express resolves
// their own prefix match (and terminates there) without ever falling
// through to the root-mounted routers' middleware.
router.use('/auth', authRoutes);
router.use('/citizens', citizenRoutes);
router.use('/complaints', complaintRoutes);
router.use('/ai', aiRoutes);
router.use('/geo', geoRoutes);
router.use('/reports', reportRoutes);
router.use('/audit', auditRoutes);
router.use('/files', fileRoutes);
// Administration resources have no common path prefix in the approved
// contract (docs/administration.yaml: /departments, /users, /roles,
// /permissions, /approval-workflows, /sla-rules, /escalation-rules,
// /tenant-config, /feature-flags, /providers all sit directly under
// /api/v1) — mounted at the router root, not under /admin.
router.use(adminRoutes);
// Notification resources have no single common path prefix in the approved
// contract (docs/notification.yaml: /notifications/*,
// /notification-templates, /notification-preferences,
// /notification-providers all sit directly under /api/v1) — mounted at the
// router root, same pattern as Administration above.
router.use(notificationRoutes);

module.exports = router;

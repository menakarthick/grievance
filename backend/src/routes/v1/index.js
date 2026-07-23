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

router.use('/auth', authRoutes);
router.use('/citizens', citizenRoutes);
router.use('/complaints', complaintRoutes);
router.use('/ai', aiRoutes);
// Administration resources have no common path prefix in the approved
// contract (docs/administration.yaml: /departments, /users, /roles,
// /permissions, /approval-workflows, /sla-rules, /escalation-rules,
// /tenant-config, /feature-flags, /providers all sit directly under
// /api/v1) — mounted at the router root, not under /admin.
router.use(adminRoutes);
router.use('/geo', geoRoutes);
// Notification resources have no single common path prefix in the approved
// contract (docs/notification.yaml: /notifications/*,
// /notification-templates, /notification-preferences,
// /notification-providers all sit directly under /api/v1) — mounted at the
// router root, same pattern as Administration above.
router.use(notificationRoutes);
router.use('/reports', reportRoutes);
router.use('/audit', auditRoutes);
router.use('/files', fileRoutes);

module.exports = router;

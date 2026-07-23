'use strict';

const { Router } = require('express');
const multer = require('multer');
const controller = require('../../controllers/complaint.controller');
const validators = require('../../validators/complaint.validators');
const { validate } = require('../../middleware/validate');
const { authenticate, requireRole, requireTenant } = require('../../middleware/auth');
const { idempotent } = require('../../middleware/idempotency');
const policy = require('../../policies/complaint.policy');
const env = require('../../config/env');

// Complaint module routes (docs/complaint.yaml). Mounted at /complaints
// under the versioned API prefix by routes/v1/index.js.
//
// Registration order follows docs/ROUTE-REGISTRATION-ORDER.md's Complaint
// section exactly: /voice, then /track/:trackingId, then the dynamic
// /:complaintId family. (/nearby is declared in geographic.yaml against
// this same prefix but belongs to the still-pending v1.1 Geographic
// entities — not implemented here.)
const router = Router();

const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.complaint.maxVoiceFileSizeBytes },
}).single('audioFile');

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.complaint.maxAttachmentSizeBytes },
}).single('file');

router.use(authenticate, requireTenant());

// --- 4.1 Register Complaint ---
router.post(
  '/',
  requireRole(...policy.register),
  idempotent(),
  validators.complaintRegister,
  validate,
  controller.register,
);

// --- 4.8 Complaint List --- (shares the collection root with 4.1)
router.get('/', requireRole(...policy.list), validators.complaintList, validate, controller.list);

// --- 4.2 Register Voice Complaint --- (literal path, registered before
// the dynamic /:complaintId family per ROUTE-REGISTRATION-ORDER.md)
router.post(
  '/voice',
  requireRole(...policy.registerVoice),
  idempotent(),
  voiceUpload,
  validators.complaintRegisterVoice,
  validate,
  controller.registerVoice,
);

// --- 4.7 Complaint Tracking --- (literal path, registered before the
// dynamic /:complaintId family per ROUTE-REGISTRATION-ORDER.md)
router.get(
  '/track/:trackingId',
  requireRole(...policy.track),
  validators.complaintTrack,
  validate,
  controller.track,
);

// --- 4.3 Upload Complaint Attachment ---
router.post(
  '/:complaintId/attachments',
  requireRole(...policy.uploadAttachment),
  attachmentUpload,
  validators.complaintUploadAttachment,
  validate,
  controller.uploadAttachment,
);

// --- 4.6 Complaint Timeline ---
router.get(
  '/:complaintId/timeline',
  requireRole(...policy.read),
  validators.complaintGetTimeline,
  validate,
  controller.getTimeline,
);

// --- 4.9 Complaint Assignment ---
router.post(
  '/:complaintId/assignments',
  requireRole(...policy.assign),
  validators.complaintCreateAssignment,
  validate,
  controller.createAssignment,
);

// --- 4.10 Complaint Resolution ---
router.post(
  '/:complaintId/resolution',
  requireRole(...policy.resolve),
  validators.complaintCreateResolution,
  validate,
  controller.createResolution,
);

// --- 4.11 Complaint Closure ---
router.post(
  '/:complaintId/closure',
  requireRole(...policy.close),
  validators.complaintCreateClosure,
  validate,
  controller.createClosure,
);

// --- 4.12 Citizen Feedback ---
router.post(
  '/:complaintId/feedback',
  requireRole(...policy.feedback),
  idempotent(),
  validators.complaintSubmitFeedback,
  validate,
  controller.submitFeedback,
);

// --- 4.13 Complaint Reopen ---
router.post(
  '/:complaintId/reopen',
  requireRole(...policy.reopen),
  validators.complaintReopen,
  validate,
  controller.reopen,
);

// --- 4.4 Update Complaint / 4.5 Complaint Details ---
router.patch(
  '/:complaintId',
  requireRole(...policy.update),
  validators.complaintUpdate,
  validate,
  controller.update,
);
router.get(
  '/:complaintId',
  requireRole(...policy.read),
  validators.complaintGetDetails,
  validate,
  controller.getDetails,
);

module.exports = router;

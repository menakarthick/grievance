'use strict';

// HTTP-layer handlers for the Complaint module: parse the request, call
// src/services/complaint.service.js, shape the response via
// src/utils/apiResponse.js. One handler per docs/complaint.yaml operationId.
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { parseSort, parseSearch } = require('../utils/queryOptions');
const service = require('../services/complaint.service');

const DEFAULT_LIST_ORDER = [
  ['createdAt', 'DESC'],
  ['id', 'DESC'],
];
const DEFAULT_TIMELINE_LIMIT = 20;

function parseLimit(req, fallback = 20) {
  const raw = parseInt(req.query.limit, 10);
  return Number.isNaN(raw) ? fallback : raw;
}

// --- 4.1 Register Complaint ---
const register = asyncHandler(async (req, res) => {
  const result = await service.register(req.user, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});

// --- 4.2 Register Voice Complaint ---
const registerVoice = asyncHandler(async (req) => {
  await service.registerVoice(req.user, req.file);
});

// --- 4.3 Upload Complaint Attachment ---
const uploadAttachment = asyncHandler(async (req, res) => {
  const result = await service.uploadAttachment(req.user, req.params.complaintId, req.file, req.body.assetCategory);
  sendSuccess(res, { statusCode: 202, data: result });
});

// --- 4.4 Update Complaint ---
const update = asyncHandler(async (req, res) => {
  const result = await service.update(req.user, req.params.complaintId, req.body);
  sendSuccess(res, { data: result });
});

// --- 4.5 Complaint Details ---
const getDetails = asyncHandler(async (req, res) => {
  const result = await service.getDetails(req.user, req.params.complaintId);
  sendSuccess(res, { data: result });
});

// --- 4.6 Complaint Timeline ---
const getTimeline = asyncHandler(async (req, res) => {
  const limit = parseLimit(req, DEFAULT_TIMELINE_LIMIT);
  const result = await service.getTimeline(req.user, req.params.complaintId, { limit, cursor: req.query.cursor });
  sendSuccess(res, { data: result.data, pagination: result.meta });
});

// --- 4.7 Complaint Tracking ---
const track = asyncHandler(async (req, res) => {
  const result = await service.track(req.user, req.params.trackingId);
  sendSuccess(res, { data: result });
});

// --- 4.8 Complaint List ---
const list = asyncHandler(async (req, res) => {
  const order = parseSort(req, ['createdAt', 'priority', 'slaDueAt'], DEFAULT_LIST_ORDER);
  const limit = parseLimit(req, 20);
  const filter = req.query.filter || {};
  const result = await service.list(req.user, {
    q: parseSearch(req),
    statusId: req.query.statusId,
    departmentId: req.query.departmentId,
    categoryId: req.query.categoryId,
    priority: req.query.priority,
    createdAtGte: filter.createdAt?.gte,
    createdAtLte: filter.createdAt?.lte,
    slaDueAtLte: filter.slaDueAt?.lte,
    order,
    limit,
    cursor: req.query.cursor,
  });
  sendSuccess(res, { data: result.data, pagination: result.meta });
});

// --- 4.9 Complaint Assignment ---
const createAssignment = asyncHandler(async (req, res) => {
  const result = await service.createAssignment(req.user, req.params.complaintId, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});

// --- 4.10 Complaint Resolution ---
const createResolution = asyncHandler(async (req, res) => {
  const result = await service.createResolution(req.user, req.params.complaintId, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});

// --- 4.11 Complaint Closure ---
const createClosure = asyncHandler(async (req, res) => {
  const result = await service.createClosure(req.user, req.params.complaintId, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});

// --- 4.12 Citizen Feedback ---
const submitFeedback = asyncHandler(async (req, res) => {
  const result = await service.submitFeedback(req.user, req.params.complaintId, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});

// --- 4.13 Complaint Reopen ---
const reopen = asyncHandler(async (req, res) => {
  const result = await service.reopen(req.user, req.params.complaintId, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});

module.exports = {
  register,
  registerVoice,
  uploadAttachment,
  update,
  getDetails,
  getTimeline,
  track,
  list,
  createAssignment,
  createResolution,
  createClosure,
  submitFeedback,
  reopen,
};

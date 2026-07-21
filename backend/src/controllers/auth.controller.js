'use strict';

// HTTP-layer handlers for the Authentication module: parse the request,
// call src/services/auth.service.js, shape the response via
// src/utils/apiResponse.js. One handler per docs/authentication.yaml
// operationId.
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const authService = require('../services/auth.service');

const requestCitizenOtp = asyncHandler(async (req, res) => {
  const result = await authService.requestCitizenOtp({ mobileNumber: req.body.mobileNumber, ip: req.ip });
  sendSuccess(res, { data: result });
});

const verifyCitizenOtp = asyncHandler(async (req, res) => {
  const { requestId, mobileNumber, otp, name } = req.body;
  const result = await authService.verifyCitizenOtp({ requestId, mobileNumber, otp, name, ip: req.ip });
  sendSuccess(res, { data: result });
});

const officerLogin = asyncHandler(async (req, res) => {
  const result = await authService.officerLogin({
    username: req.body.username,
    password: req.body.password,
    ip: req.ip,
  });
  sendSuccess(res, { data: result });
});

const verifyOfficerOtp = asyncHandler(async (req, res) => {
  const result = await authService.verifyOfficerOtp({
    otpChallengeId: req.body.otpChallengeId,
    otp: req.body.otp,
    ip: req.ip,
  });
  sendSuccess(res, { data: result });
});

const adminLogin = asyncHandler(async (req, res) => {
  const result = await authService.adminLogin({ username: req.body.username, password: req.body.password, ip: req.ip });
  sendSuccess(res, { data: result });
});

const verifyMfa = asyncHandler(async (req, res) => {
  const result = await authService.verifyMfa({
    mfaChallengeId: req.body.mfaChallengeId,
    totpCode: req.body.totpCode,
    ip: req.ip,
  });
  sendSuccess(res, { data: result });
});

const refreshToken = asyncHandler(async (req, res) => {
  const result = await authService.refreshToken({ refreshToken: req.body.refreshToken, ip: req.ip });
  sendSuccess(res, { data: result });
});

const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout({
    userId: req.user.id,
    jti: req.tokenClaims?.jti,
    exp: req.tokenClaims?.exp,
    refreshToken: req.body.refreshToken,
    allDevices: Boolean(req.body.allDevices),
    ip: req.ip,
  });
  sendSuccess(res, { data: result });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword({ username: req.body.username, ip: req.ip });
  sendSuccess(res, { data: result });
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword({
    resetToken: req.body.resetToken,
    newPassword: req.body.newPassword,
    ip: req.ip,
  });
  sendSuccess(res, { data: result });
});

// Backs GET /api/v1/auth/token/validate — also serves as "Get Current User"
// (the approved contract has no separate /auth/me endpoint; this is the
// closest documented operation and returns exactly the caller's own claims).
const getCurrentUser = asyncHandler(async (req, res) => {
  const result = await authService.getCurrentUser(req.tokenClaims);
  sendSuccess(res, { data: result });
});

module.exports = {
  requestCitizenOtp,
  verifyCitizenOtp,
  officerLogin,
  verifyOfficerOtp,
  adminLogin,
  verifyMfa,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  getCurrentUser,
};

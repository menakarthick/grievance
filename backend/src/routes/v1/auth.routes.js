'use strict';

const { Router } = require('express');
const controller = require('../../controllers/auth.controller');
const validators = require('../../validators/auth.validators');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { rateLimit, ipKey } = require('../../middleware/rateLimit');
const env = require('../../config/env');
const redisKeys = require('../../utils/redisKeys');

// Authentication module routes (docs/authentication.yaml).
// Mounted at /auth under the versioned API prefix by routes/v1/index.js.
// Every operation below sets `security: []` in the approved spec (public,
// pre-authentication) except Logout and Token Validate, which inherit the
// default bearerAuth requirement — that split is preserved exactly here.
const router = Router();

const otpRequestLimiter = rateLimit({
  keyFn: (req) => (req.body?.mobileNumber ? redisKeys.otpRequestRateLimit(req.body.mobileNumber) : null),
  max: env.otp.requestMaxPerWindow,
  windowSeconds: env.otp.requestWindowSeconds,
});

// Light per-IP backstop on the verify/login endpoints — the primary brute
// -force control is each flow's own attempt cap (OTPService maxVerifyAttempts,
// AuthService account lockout), this just bounds abuse volume further
// (docs/14-API-Security.md §14.12).
const verifyLimiter = rateLimit({ keyFn: ipKey('auth-verify'), max: 20, windowSeconds: 600 });
const loginLimiter = rateLimit({ keyFn: ipKey('auth-login'), max: 20, windowSeconds: 600 });
const forgotPasswordLimiter = rateLimit({ keyFn: ipKey('auth-forgot-password'), max: 10, windowSeconds: 3600 });

router.post(
  '/citizen/otp/request',
  otpRequestLimiter,
  validators.authCitizenOtpRequest,
  validate,
  controller.requestCitizenOtp,
);

router.post(
  '/citizen/otp/verify',
  verifyLimiter,
  validators.authCitizenOtpVerify,
  validate,
  controller.verifyCitizenOtp,
);

router.post('/officer/login', loginLimiter, validators.authOfficerLogin, validate, controller.officerLogin);

router.post(
  '/officer/otp/verify',
  verifyLimiter,
  validators.authOfficerOtpVerify,
  validate,
  controller.verifyOfficerOtp,
);

router.post('/admin/login', loginLimiter, validators.authAdminLogin, validate, controller.adminLogin);

router.post('/mfa/verify', verifyLimiter, validators.authMfaVerify, validate, controller.verifyMfa);

router.post('/token/refresh', validators.authTokenRefresh, validate, controller.refreshToken);

router.post('/logout', authenticate, validators.authLogout, validate, controller.logout);

router.post(
  '/password/forgot',
  forgotPasswordLimiter,
  validators.authForgotPassword,
  validate,
  controller.forgotPassword,
);

router.post('/password/reset', validators.authResetPassword, validate, controller.resetPassword);

router.get('/token/validate', authenticate, controller.getCurrentUser);

module.exports = router;

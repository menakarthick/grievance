'use strict';

// express-validator chains for the Authentication module, one named export
// per docs/authentication.yaml operationId, run through
// src/middleware/validate.js in the route definition.
const { body } = require('express-validator');

const MOBILE_PATTERN = /^([6-9]\d{9}|\+[1-9]\d{6,14})$/;
const OTP_PATTERN = /^\d{6}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const authCitizenOtpRequest = [
  body('mobileNumber')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'mobileNumber is required.' })
    .bail()
    .matches(MOBILE_PATTERN)
    .withMessage({ issue: 'INVALID_FORMAT', message: 'mobileNumber must be a valid Indian mobile number.' }),
];

const authCitizenOtpVerify = [
  body('requestId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'requestId is required.' })
    .bail()
    .matches(UUID_PATTERN)
    .withMessage({ issue: 'INVALID_FORMAT', message: 'requestId must be a UUID.' }),
  body('mobileNumber')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'mobileNumber is required.' })
    .bail()
    .matches(MOBILE_PATTERN)
    .withMessage({ issue: 'INVALID_FORMAT', message: 'mobileNumber must be a valid Indian mobile number.' }),
  body('otp')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'otp is required.' })
    .bail()
    .matches(OTP_PATTERN)
    .withMessage({ issue: 'INVALID_FORMAT', message: 'otp must be a 6-digit code.' }),
  body('name').optional().isString().trim().isLength({ min: 1, max: 255 }).withMessage({
    issue: 'INVALID_FORMAT',
    message: 'name must be a non-empty string.',
  }),
];

const usernamePassword = [
  body('username')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'username is required.' })
    .bail()
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage({ issue: 'REQUIRED', message: 'username must not be empty.' }),
  body('password')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'password is required.' })
    .bail()
    .isString()
    .isLength({ min: 1 })
    .withMessage({ issue: 'REQUIRED', message: 'password must not be empty.' }),
];

const authOfficerLogin = usernamePassword;
const authAdminLogin = usernamePassword;

const authOfficerOtpVerify = [
  body('otpChallengeId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'otpChallengeId is required.' })
    .bail()
    .matches(UUID_PATTERN)
    .withMessage({ issue: 'INVALID_FORMAT', message: 'otpChallengeId must be a UUID.' }),
  body('otp')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'otp is required.' })
    .bail()
    .matches(OTP_PATTERN)
    .withMessage({ issue: 'INVALID_FORMAT', message: 'otp must be a 6-digit code.' }),
];

const authMfaVerify = [
  body('mfaChallengeId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'mfaChallengeId is required.' })
    .bail()
    .matches(UUID_PATTERN)
    .withMessage({ issue: 'INVALID_FORMAT', message: 'mfaChallengeId must be a UUID.' }),
  body('totpCode')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'totpCode is required.' })
    .bail()
    .matches(OTP_PATTERN)
    .withMessage({ issue: 'INVALID_FORMAT', message: 'totpCode must be a 6-digit code.' }),
];

const authTokenRefresh = [
  body('refreshToken')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'refreshToken is required.' })
    .bail()
    .isString()
    .isLength({ min: 1 })
    .withMessage({ issue: 'REQUIRED', message: 'refreshToken must not be empty.' }),
];

const authLogout = [
  body('refreshToken')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'refreshToken is required.' })
    .bail()
    .isString()
    .isLength({ min: 1 })
    .withMessage({ issue: 'REQUIRED', message: 'refreshToken must not be empty.' }),
  body('allDevices')
    .optional()
    .isBoolean()
    .withMessage({ issue: 'INVALID_FORMAT', message: 'allDevices must be a boolean.' }),
];

const authForgotPassword = [
  body('username')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'username is required.' })
    .bail()
    .isString()
    .isLength({ min: 1 })
    .withMessage({ issue: 'REQUIRED', message: 'username must not be empty.' }),
];

const authResetPassword = [
  body('resetToken')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'resetToken is required.' })
    .bail()
    .isString()
    .isLength({ min: 1 })
    .withMessage({ issue: 'REQUIRED', message: 'resetToken must not be empty.' }),
  body('newPassword')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'newPassword is required.' })
    .bail()
    .isString()
    .isLength({ min: 12 })
    .withMessage({ issue: 'INVALID_FORMAT', message: 'newPassword must be at least 12 characters.' }),
];

module.exports = {
  authCitizenOtpRequest,
  authCitizenOtpVerify,
  authOfficerLogin,
  authOfficerOtpVerify,
  authAdminLogin,
  authMfaVerify,
  authTokenRefresh,
  authLogout,
  authForgotPassword,
  authResetPassword,
};

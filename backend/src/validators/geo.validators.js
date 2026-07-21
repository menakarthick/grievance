'use strict';

// express-validator chains for the Geographic module, one named export per
// docs/geographic.yaml operationId, run through src/middleware/validate.js
// in the route definition.
const { body, param, query } = require('express-validator');

const idParam = (name) =>
  param(name)
    .exists()
    .withMessage({ issue: 'REQUIRED', message: `${name} is required.` })
    .bail()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: `${name} must be a positive integer id.` })
    .toInt();

const nameBody = (required) => {
  const chain = body('name');
  const withRequired = required
    ? chain.exists().withMessage({ issue: 'REQUIRED', message: 'name is required.' }).bail()
    : chain.optional();
  return withRequired
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage({ issue: 'INVALID_LENGTH', message: 'name must be 2-100 characters.' });
};

const codeBody = (required) => {
  const chain = body('code');
  const withRequired = required
    ? chain.exists().withMessage({ issue: 'REQUIRED', message: 'code is required.' }).bail()
    : chain.optional();
  return withRequired
    .isString()
    .trim()
    .isLength({ min: 1, max: 32 })
    .withMessage({ issue: 'INVALID_LENGTH', message: 'code must be 1-32 characters.' });
};

const isActiveBody = () =>
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage({ issue: 'INVALID_FORMAT', message: 'isActive must be a boolean.' });

const isActiveQuery = () =>
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage({ issue: 'INVALID_FORMAT', message: 'isActive must be a boolean.' });

const pageQuery = () =>
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: 'page must be a positive integer.' });

const sizeQuery = (max) =>
  query('size')
    .optional()
    .isInt({ min: 1, max })
    .withMessage({ issue: 'INVALID_RANGE', message: `size must be between 1 and ${max}.` });

// --- District (docs/07-Geographic-APIs.md §7.2) ---
const geoListDistricts = [isActiveQuery(), pageQuery(), sizeQuery(100)];
const geoCreateDistrict = [codeBody(true), nameBody(true)];
const geoGetDistrict = [idParam('id')];
const geoUpdateDistrict = [idParam('id'), nameBody(false), isActiveBody()];
const geoDeleteDistrict = [idParam('id')];

// --- Zone (docs/07-Geographic-APIs.md §7.5) ---
const geoListZones = [
  query('districtId')
    .optional()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: 'districtId must be a positive integer id.' }),
  isActiveQuery(),
  pageQuery(),
  sizeQuery(100),
];
const geoCreateZone = [
  codeBody(true),
  nameBody(true),
  body('districtId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'districtId is required.' })
    .bail()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: 'districtId must be a positive integer id.' })
    .toInt(),
];
const geoGetZone = [idParam('id')];
const geoUpdateZone = [
  idParam('id'),
  nameBody(false),
  isActiveBody(),
  body('districtId')
    .optional()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: 'districtId must be a positive integer id.' })
    .toInt(),
];
const geoDeleteZone = [idParam('id')];

// --- Ward (docs/07-Geographic-APIs.md §7.7) ---
const geoListWards = [
  query('zoneId')
    .optional()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: 'zoneId must be a positive integer id.' }),
  isActiveQuery(),
  pageQuery(),
  sizeQuery(200),
];
const geoCreateWard = [
  codeBody(true),
  nameBody(true),
  body('zoneId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'zoneId is required.' })
    .bail()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: 'zoneId must be a positive integer id.' })
    .toInt(),
];
const geoGetWard = [idParam('id')];
const geoUpdateWard = [
  idParam('id'),
  nameBody(false),
  isActiveBody(),
  body('zoneId')
    .optional()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: 'zoneId must be a positive integer id.' })
    .toInt(),
];
const geoDeleteWard = [idParam('id')];

module.exports = {
  geoListDistricts,
  geoCreateDistrict,
  geoGetDistrict,
  geoUpdateDistrict,
  geoDeleteDistrict,
  geoListZones,
  geoCreateZone,
  geoGetZone,
  geoUpdateZone,
  geoDeleteZone,
  geoListWards,
  geoCreateWard,
  geoGetWard,
  geoUpdateWard,
  geoDeleteWard,
};

'use strict';

const {
  sequelize,
  User,
  CitizenProfile,
  StaffProfile,
  PasswordHistory,
  AccountLockoutState,
  MfaDevice,
  Tenant,
} = require('../models');

function findByMobileNumber(tenantId, mobileNumber) {
  return User.findOne({ where: { tenantId, mobileNumber, userType: 'citizen' } });
}

function findByUsername(username) {
  return User.findOne({ where: { username } });
}

function findByEmail(email) {
  return User.findOne({ where: { email } });
}

function findById(userId) {
  return User.findByPk(userId);
}

function findByIdWithProfile(userId) {
  return User.findByPk(userId, { include: ['citizenProfile', 'staffProfile'] });
}

// Registers a new citizen on first-ever OTP verification (docs/authentication.yaml
// authCitizenOtpVerify: "creates the user/citizen_profile row on first-ever
// verification"). tenant_id is resolved server-side, never from client input
// (docs/14-API-Security.md §14.10).
async function createCitizen({ tenantId, mobileNumber, name }) {
  return sequelize.transaction(async (t) => {
    const user = await User.create(
      { tenantId, userType: 'citizen', mobileNumber, status: 'active' },
      { transaction: t },
    );
    await CitizenProfile.create({ userId: user.id, name }, { transaction: t });
    return user;
  });
}

function getStaffProfile(userId) {
  return StaffProfile.findOne({ where: { userId } });
}

async function updatePasswordHash(userId, passwordHash) {
  return sequelize.transaction(async (t) => {
    await User.update({ passwordHash }, { where: { id: userId }, transaction: t });
    await PasswordHistory.create({ userId, passwordHash }, { transaction: t });
  });
}

function getRecentPasswordHashes(userId, limit) {
  return PasswordHistory.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit,
  });
}

function getLockoutState(userId) {
  return AccountLockoutState.findOne({ where: { userId } });
}

async function recordFailedLogin(userId, { lockedUntil, failedAttemptCount }) {
  const [state] = await AccountLockoutState.findOrCreate({
    where: { userId },
    defaults: { failedAttemptCount: 0 },
  });
  await state.update({ failedAttemptCount, lockedUntil: lockedUntil || null });
  return state;
}

async function resetLockout(userId) {
  await AccountLockoutState.update({ failedAttemptCount: 0, lockedUntil: null }, { where: { userId } });
}

function getMfaDevice(userId) {
  return MfaDevice.findOne({ where: { userId }, order: [['createdAt', 'DESC']] });
}

function getSingleActiveTenant() {
  return Tenant.findAll({ where: { status: 'active' }, limit: 2 });
}

module.exports = {
  findByMobileNumber,
  findByUsername,
  findByEmail,
  findById,
  findByIdWithProfile,
  createCitizen,
  getStaffProfile,
  updatePasswordHash,
  getRecentPasswordHashes,
  getLockoutState,
  recordFailedLogin,
  resetLockout,
  getMfaDevice,
  getSingleActiveTenant,
};

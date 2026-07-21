'use strict';

const crypto = require('crypto');
const argon2 = require('@node-rs/argon2');
const { authenticator } = require('otplib');

// Bootstrap Super Admin (Section 5: user_type ∈ Citizen/Officer/Admin
// tiers; Section 3: a Super Admin's user row is the deliberate cross-tenant
// exception, tenant_id null). Argon2id password hashing per
// docs/14-API-Security.md §14.2 — this replaces the earlier scrypt
// placeholder now that the real Authentication module exists.
//
// Corporation Admin / Super Admin MFA is mandatory (docs/authentication.yaml
// authAdminLogin), so this seeder also enrolls a TOTP device for the
// bootstrap account — without one, the seeded admin could never complete
// login. The generated secret is logged once, the same way the bootstrap
// password is, so the pilot operator can add it to an authenticator app;
// rotate it immediately in any real deployment.

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@tambaram.gov.in';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe!123';

module.exports = {
  async up(queryInterface, Sequelize) {
    const { QueryTypes } = Sequelize;
    const now = new Date();
    const passwordHash = await argon2.hash(ADMIN_PASSWORD);

    await queryInterface.bulkInsert('user', [
      {
        tenant_id: null,
        external_uuid: crypto.randomUUID(),
        user_type: 'super_admin',
        mobile_number: null,
        email: ADMIN_EMAIL,
        username: 'super_admin',
        password_hash: passwordHash,
        status: 'active',
        created_at: now,
        updated_at: now,
      },
    ]);
    const [user] = await queryInterface.sequelize.query(`SELECT id FROM user WHERE email = :email`, {
      replacements: { email: ADMIN_EMAIL },
      type: QueryTypes.SELECT,
    });

    await queryInterface.bulkInsert('staff_profile', [
      {
        user_id: user.id,
        department_id: null,
        hierarchy_level_id: null,
        scope_type: 'tenant',
        scope_id: null,
        employee_id: 'SUPERADMIN-001',
        created_at: now,
        updated_at: now,
      },
    ]);

    const [role] = await queryInterface.sequelize.query(
      `SELECT id FROM role WHERE tenant_id IS NULL AND name = 'super_admin'`,
      { type: QueryTypes.SELECT },
    );
    await queryInterface.bulkInsert('user_role_assignment', [
      {
        user_id: user.id,
        role_id: role.id,
        scope_type: 'tenant',
        scope_id: null,
        created_at: now,
      },
    ]);

    // TOTP secret stored directly in secret_reference: a Phase-1
    // simplification, documented in src/services/auth.service.js — no
    // secrets-manager integration exists yet to hold the real reference.
    const totpSecret = authenticator.generateSecret();
    await queryInterface.bulkInsert('mfa_device', [
      {
        user_id: user.id,
        device_type: 'totp',
        secret_reference: totpSecret,
        verified_at: now,
        created_at: now,
        updated_at: now,
      },
    ]);

    console.log(
      `[seed-admin-user] Super Admin created: ${ADMIN_EMAIL}. Set SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD env vars before ` +
        're-seeding to avoid the fallback default password, and rotate both it and the MFA secret immediately in any ' +
        `real deployment. TOTP secret (add to an authenticator app): ${totpSecret}`,
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('user_role_assignment', {});
    await queryInterface.bulkDelete('staff_profile', { employee_id: 'SUPERADMIN-001' });
    const [user] = await queryInterface.sequelize.query(`SELECT id FROM user WHERE email = :email`, {
      replacements: { email: ADMIN_EMAIL },
      type: queryInterface.sequelize.QueryTypes.SELECT,
    });
    if (user) {
      await queryInterface.bulkDelete('mfa_device', { user_id: user.id });
    }
    await queryInterface.bulkDelete('user', { email: ADMIN_EMAIL });
  },
};

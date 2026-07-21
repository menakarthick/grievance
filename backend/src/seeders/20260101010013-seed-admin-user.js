'use strict';

const crypto = require('crypto');

// Bootstrap Super Admin (Section 5: user_type ∈ Citizen/Officer/Admin
// tiers; Section 3: a Super Admin's user row is the deliberate cross-tenant
// exception, tenant_id null). Password hashing uses Node's built-in scrypt
// only to avoid adding a new dependency before Phase 2 implements real auth
// business logic — replace with the platform's actual auth hashing scheme
// once the auth service lands, and rotate this password immediately after
// first login in any real deployment.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@tambaram.gov.in';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe!123';

module.exports = {
  async up(queryInterface, Sequelize) {
    const { QueryTypes } = Sequelize;
    const now = new Date();

    await queryInterface.bulkInsert('user', [
      {
        tenant_id: null,
        external_uuid: crypto.randomUUID(),
        user_type: 'super_admin',
        mobile_number: null,
        email: ADMIN_EMAIL,
        username: 'super_admin',
        password_hash: hashPassword(ADMIN_PASSWORD),
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

    console.log(
      `[seed-admin-user] Super Admin created: ${ADMIN_EMAIL}. Set SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD env vars before ` +
        're-seeding to avoid the fallback default password, and rotate it immediately once the auth service is implemented.',
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('user_role_assignment', {});
    await queryInterface.bulkDelete('staff_profile', { employee_id: 'SUPERADMIN-001' });
    await queryInterface.bulkDelete('user', { email: ADMIN_EMAIL });
  },
};

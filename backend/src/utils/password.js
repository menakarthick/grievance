'use strict';

const argon2 = require('@node-rs/argon2');

// Argon2id password hashing (default algorithm of @node-rs/argon2) —
// mandated for Officer/Department Admin/Corporation Admin/Super Admin
// passwords by docs/14-API-Security.md §14.2 and ARCHITECTURE.md §11.3
// ("A02 Cryptographic Failures ... Argon2id password hashing").

async function hashPassword(plainPassword) {
  return argon2.hash(plainPassword);
}

async function verifyPassword(hash, plainPassword) {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, plainPassword);
  } catch {
    return false;
  }
}

// docs/authentication.yaml authResetPassword: "Upper/lower/digit/special
// required; must not match any of the last 5 password hashes (SRS §8.1)."
// minLength 12 is enforced by the OpenAPI schema itself; this checks the
// character-class requirement the schema's `description` states in prose.
function isPasswordPolicyCompliant(password) {
  if (typeof password !== 'string' || password.length < 12) return false;
  return /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

module.exports = { hashPassword, verifyPassword, isPasswordPolicyCompliant };

'use strict';

const { hashPassword, verifyPassword, isPasswordPolicyCompliant } = require('../../src/utils/password');

describe('utils/password', () => {
  test('hashPassword produces a verifiable Argon2id hash', async () => {
    const hash = await hashPassword('Correct-Horse-Battery-9!');
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(hash, 'Correct-Horse-Battery-9!')).resolves.toBe(true);
  });

  test('verifyPassword rejects a wrong password', async () => {
    const hash = await hashPassword('Correct-Horse-Battery-9!');
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });

  test('verifyPassword returns false (not throw) for a null hash', async () => {
    await expect(verifyPassword(null, 'anything')).resolves.toBe(false);
  });

  test.each([
    ['too short', 'Ab1!Ab1!Ab1', false],
    ['no uppercase', 'lowercase123!!!!', false],
    ['no digit', 'NoDigitsHere!!!!', false],
    ['no special char', 'NoSpecialChar123', false],
    ['compliant', 'Valid-Passw0rd!', true],
  ])('isPasswordPolicyCompliant: %s', (_label, password, expected) => {
    expect(isPasswordPolicyCompliant(password)).toBe(expected);
  });
});

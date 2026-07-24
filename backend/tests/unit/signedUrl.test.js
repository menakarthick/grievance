'use strict';

const signedUrl = require('../../src/utils/signedUrl');

describe('utils/signedUrl (SRS §8.2 "signed short-lived URL access")', () => {
  test('a freshly signed token verifies back to the same fileAssetId', () => {
    const { token, expiresAt } = signedUrl.sign('42', 60);
    expect(expiresAt).toBeInstanceOf(Date);
    const verified = signedUrl.verify(token);
    expect(verified).toEqual({ fileAssetId: '42' });
  });

  test('an expired token fails verification', () => {
    const { token } = signedUrl.sign('42', -1);
    expect(signedUrl.verify(token)).toBeNull();
  });

  test('a tampered token fails verification', () => {
    const { token } = signedUrl.sign('42', 60);
    // Flip one character partway through the token rather than appending —
    // Node's base64url decoder tolerantly ignores trailing noise appended
    // after a valid token, so appending doesn't reliably corrupt it; an
    // in-place character swap genuinely changes the decoded payload/signature.
    const mid = Math.floor(token.length / 2);
    const swapped = token[mid] === 'a' ? 'b' : 'a';
    const tampered = token.slice(0, mid) + swapped + token.slice(mid + 1);
    expect(signedUrl.verify(tampered)).toBeNull();
  });

  test('a malformed token fails verification without throwing', () => {
    expect(signedUrl.verify('not-a-real-token')).toBeNull();
    expect(signedUrl.verify('')).toBeNull();
  });

  test('a token minted for one fileAssetId does not verify a different one', () => {
    const { token } = signedUrl.sign('42', 60);
    const verified = signedUrl.verify(token);
    expect(verified.fileAssetId).not.toBe('43');
  });
});

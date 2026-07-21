'use strict';

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const env = require('../../src/config/env');
const { redisClient } = require('../../src/config/redis');
const tokenService = require('../../src/services/token.service');

const publicKey = fs.readFileSync(path.join(__dirname, '..', '..', env.jwt.publicKeyPath), 'utf8');

const baseUser = {
  userId: 7,
  userType: 'officer',
  tenantId: 1,
  roles: ['officer'],
  scope: { scopeType: 'department', scopeId: 3 },
};

describe('services/token.service', () => {
  afterEach(async () => {
    await redisClient.flushall();
  });

  test('issueTokenPair issues a verifiable RS256 access token carrying the required claims', async () => {
    const { accessToken, refreshToken, expiresIn } = await tokenService.issueTokenPair(baseUser);

    expect(typeof refreshToken).toBe('string');
    expect(expiresIn).toBe(env.jwt.accessTokenTtlSeconds);

    const decoded = jwt.verify(accessToken, publicKey, {
      algorithms: ['RS256'],
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    });
    expect(decoded.userId).toBe('7');
    expect(decoded.userType).toBe('officer');
    expect(decoded.roles).toEqual(['officer']);
    expect(decoded.jti).toBeTruthy();
  });

  test('an invalid/malformed token fails verification', () => {
    expect(() => jwt.verify('not-a-real-token', publicKey, { algorithms: ['RS256'] })).toThrow();
  });

  test('an expired token fails verification', async () => {
    const fs2 = require('fs');
    const privateKey = fs2.readFileSync(path.join(__dirname, '..', '..', env.jwt.privateKeyPath), 'utf8');
    const expiredToken = jwt.sign({ userId: '7' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: -10,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    });
    expect(() => jwt.verify(expiredToken, publicKey, { algorithms: ['RS256'] })).toThrow(/expired/i);
  });

  test('rotateRefreshToken: happy path returns a new pair and invalidates the old token id', async () => {
    const { refreshToken: firstToken } = await tokenService.issueTokenPair(baseUser);
    const { refreshToken: secondToken } = await tokenService.rotateRefreshToken(firstToken);

    expect(secondToken).not.toBe(firstToken);

    // Rotating with the new token succeeds again (rotation chain continues).
    const { refreshToken: thirdToken } = await tokenService.rotateRefreshToken(secondToken);
    expect(thirdToken).not.toBe(secondToken);
  });

  test('rotateRefreshToken: reusing an already-rotated token revokes the whole family', async () => {
    const { refreshToken: firstToken } = await tokenService.issueTokenPair(baseUser);
    const { refreshToken: secondToken } = await tokenService.rotateRefreshToken(firstToken);

    // Replaying the already-consumed firstToken must be rejected...
    await expect(tokenService.rotateRefreshToken(firstToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED_FAMILY_REVOKED',
      statusCode: 401,
    });

    // ...and the legitimate, still-unused secondToken must also now be dead
    // (the entire family was revoked, not just the replayed token).
    await expect(tokenService.rotateRefreshToken(secondToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
  });

  test('rotateRefreshToken: unknown token id is REFRESH_TOKEN_INVALID', async () => {
    await expect(tokenService.rotateRefreshToken('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
      statusCode: 401,
    });
  });

  test('denylistAccessTokenFromClaims makes isAccessTokenDenylisted true', async () => {
    const { accessToken } = await tokenService.issueTokenPair(baseUser);
    const decoded = jwt.decode(accessToken);

    await expect(tokenService.isAccessTokenDenylisted(decoded.jti)).resolves.toBe(false);
    await tokenService.denylistAccessTokenFromClaims({ jti: decoded.jti, exp: decoded.exp });
    await expect(tokenService.isAccessTokenDenylisted(decoded.jti)).resolves.toBe(true);
  });

  test('revokeAllUserSessions kills every family issued to that user', async () => {
    const { refreshToken: sessionA } = await tokenService.issueTokenPair(baseUser);
    const { refreshToken: sessionB } = await tokenService.issueTokenPair(baseUser);

    await tokenService.revokeAllUserSessions(baseUser.userId);

    await expect(tokenService.rotateRefreshToken(sessionA)).rejects.toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
    await expect(tokenService.rotateRefreshToken(sessionB)).rejects.toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
  });
});

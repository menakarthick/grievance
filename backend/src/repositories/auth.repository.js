'use strict';

// Data-access layer for the Authentication module. Split into four focused
// repositories (matching the entities they front) rather than one
// monolithic file — re-exported together here so callers that prefer the
// per-module `<module>.repository.js` convention established in Phase 1
// still have a single require() available.
module.exports = {
  userRepository: require('./user.repository'),
  roleRepository: require('./role.repository'),
  permissionRepository: require('./permission.repository'),
  tokenRepository: require('./token.repository'),
};

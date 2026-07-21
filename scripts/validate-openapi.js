'use strict';
/*
 * Structural validator for the multi-file OpenAPI 3.1 spec under docs/.
 * Checks, independent of any external tool:
 *   - YAML syntax across every spec file
 *   - $ref resolution (cross-file and same-file, including the local
 *     '#/components/<type>/<name>' wrapper pattern used inside path files)
 *   - duplicate operationIds across all path files
 *   - duplicate schema/parameter/requestBody/response/header names
 *     (a path file's own local component shadowing a shared one)
 *   - every non-public operation declares a 401 response
 *   - no operation mixes cursor-based and offset-based pagination params
 *   - operationId naming matches the module-prefix convention
 *
 * Exits non-zero if any CRITICAL or HIGH finding is present.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const DOCS = path.join(__dirname, '..', 'docs');

function load(relPath) {
  const full = path.join(DOCS, relPath);
  return yaml.load(fs.readFileSync(full, 'utf8'));
}

const findings = []; // {sev, cat, msg}
const add = (sev, cat, msg) => findings.push({ sev, cat, msg });

// ---------- Load everything ----------
const openapi = load('openapi.yaml');

const COMPONENT_FILES = ['schemas', 'responses', 'requestBodies', 'parameters', 'headers', 'securitySchemes'];
const components = {};
for (const c of COMPONENT_FILES) components[c] = load(`components/${c}.yaml`);

const PATH_FILES = [
  'authentication.yaml', 'citizen.yaml', 'complaint.yaml', 'ai.yaml',
  'administration.yaml', 'geographic.yaml', 'notification.yaml',
  'reports.yaml', 'audit.yaml', 'file-management.yaml',
];
const paths = {};
for (const pf of PATH_FILES) paths[pf] = load(pf);

add('INFO', 'syntax', `All ${1 + COMPONENT_FILES.length + PATH_FILES.length} YAML files parsed successfully.`);

// ---------- $ref resolution ----------
const docCache = new Map();
function loadCached(relPath) {
  if (!docCache.has(relPath)) docCache.set(relPath, load(relPath));
  return docCache.get(relPath);
}

function getPointer(doc, pointerParts) {
  let node = doc;
  for (const raw of pointerParts) {
    const part = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (node === undefined || node === null) throw new Error(`cannot descend into '${part}'`);
    node = Array.isArray(node) ? node[parseInt(part, 10)] : node[part];
    if (node === undefined) throw new Error(`key '${part}' not found`);
  }
  return node;
}

const brokenRefs = [];

function checkRef(ref, sourceRelPath, sourceDoc, localComponentsDoc) {
  if (ref.startsWith('#/components/')) {
    const m = /^#\/components\/(schemas|parameters|requestBodies|responses|headers)\/(.+)$/.exec(ref);
    if (!m) { brokenRefs.push([sourceRelPath, ref, 'unrecognized local ref shape']); return; }
    const [, compType, name] = m;
    const bucket = localComponentsDoc && localComponentsDoc.components && localComponentsDoc.components[compType];
    if (!bucket || !(name in bucket)) {
      brokenRefs.push([sourceRelPath, ref, `local ${compType}.${name} not found in this file`]);
    }
    return;
  }
  if (ref.startsWith('#/')) {
    try {
      getPointer(sourceDoc, ref.slice(2).split('/'));
    } catch (e) {
      brokenRefs.push([sourceRelPath, ref, `same-file pointer not found (${e.message})`]);
    }
    return;
  }
  const m = /^(?:\.\/)?([\w./-]+\.yaml)#\/(.+)$/.exec(ref);
  if (!m) { brokenRefs.push([sourceRelPath, ref, 'unrecognized ref shape']); return; }
  const [, targetFile, pointer] = m;
  const sourceDir = path.posix.dirname(sourceRelPath.replace(/\\/g, '/'));
  const targetRel = sourceDir && sourceDir !== '.' ? path.posix.normalize(`${sourceDir}/${targetFile}`) : targetFile;
  const targetAbs = path.join(DOCS, targetRel);
  if (!fs.existsSync(targetAbs)) {
    brokenRefs.push([sourceRelPath, ref, `target file ${targetRel} does not exist`]);
    return;
  }
  try {
    const targetDoc = loadCached(targetRel);
    getPointer(targetDoc, pointer.split('/'));
  } catch (e) {
    brokenRefs.push([sourceRelPath, ref, `pointer ${pointer} not found in ${targetRel} (${e.message})`]);
  }
}

function walkRefs(node, sourceRelPath, sourceDoc, localComponentsDoc) {
  if (Array.isArray(node)) {
    for (const v of node) walkRefs(v, sourceRelPath, sourceDoc, localComponentsDoc);
  } else if (node && typeof node === 'object') {
    if (typeof node.$ref === 'string') checkRef(node.$ref, sourceRelPath, sourceDoc, localComponentsDoc);
    for (const v of Object.values(node)) walkRefs(v, sourceRelPath, sourceDoc, localComponentsDoc);
  }
}

for (const pf of PATH_FILES) walkRefs(paths[pf], pf, paths[pf], paths[pf]);
for (const c of COMPONENT_FILES) walkRefs(components[c], `components/${c}.yaml`, components[c], components[c]);
walkRefs(openapi, 'openapi.yaml', openapi, null);

if (brokenRefs.length) {
  for (const [f, ref, reason] of brokenRefs) add('CRITICAL', 'broken-ref', `${f}: $ref "${ref}" -> ${reason}`);
} else {
  add('INFO', 'broken-ref', 'No broken $ref found across openapi.yaml, components/*.yaml, and all path files.');
}

// ---------- openapi.yaml's own top-level path refs resolve ----------
const openapiPaths = openapi.paths || {};
const missingOpenapiRefs = [];
for (const [p, item] of Object.entries(openapiPaths)) {
  const ref = item && item.$ref;
  if (!ref) continue;
  const m = /^\.\/([\w.-]+\.yaml)#\/(.+)$/.exec(ref);
  if (!m) { missingOpenapiRefs.push([p, ref, 'unrecognized shape']); continue; }
  const [, fname, pointer] = m;
  const doc = paths[fname] || (fs.existsSync(path.join(DOCS, fname)) ? loadCached(fname) : null);
  if (!doc) { missingOpenapiRefs.push([p, ref, `${fname} not found`]); continue; }
  try {
    getPointer(doc, pointer.split('/'));
  } catch (e) {
    missingOpenapiRefs.push([p, ref, `not found (${e.message})`]);
  }
}
if (missingOpenapiRefs.length) {
  for (const [p, ref, reason] of missingOpenapiRefs) add('CRITICAL', 'broken-ref', `openapi.yaml path "${p}": $ref "${ref}" -> ${reason}`);
} else {
  add('INFO', 'broken-ref', `All ${Object.keys(openapiPaths).length} openapi.yaml top-level path $refs resolve into their target path files.`);
}

// ---------- Duplicate operationIds ----------
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const opIds = new Map();
for (const pf of PATH_FILES) {
  const doc = paths[pf];
  for (const [pathKey, item] of Object.entries(doc)) {
    if (pathKey === 'components' || typeof item !== 'object') continue;
    for (const method of METHODS) {
      const op = item[method];
      if (op && op.operationId) {
        if (!opIds.has(op.operationId)) opIds.set(op.operationId, []);
        opIds.get(op.operationId).push([pf, pathKey, method]);
      }
    }
  }
}
const dupeOps = [...opIds.entries()].filter(([, locs]) => locs.length > 1);
if (dupeOps.length) {
  for (const [opid, locs] of dupeOps) add('HIGH', 'duplicate-operationid', `operationId "${opid}" used ${locs.length}x: ${JSON.stringify(locs)}`);
} else {
  add('INFO', 'duplicate-operationid', `All ${opIds.size} operationIds across path files are unique.`);
}

// ---------- Duplicate schemas/parameters/requestBodies/responses/headers ----------
for (const compType of ['schemas', 'parameters', 'requestBodies', 'responses', 'headers']) {
  const sharedNames = new Set(Object.keys(components[compType] || {}));
  let any = false;
  for (const pf of PATH_FILES) {
    const localBlock = (paths[pf].components && paths[pf].components[compType]) || {};
    for (const name of Object.keys(localBlock)) {
      if (sharedNames.has(name)) {
        add('HIGH', `duplicate-${compType}`, `${pf}: local ${compType} "${name}" shadows a shared components/${compType}.yaml entry of the same name.`);
        any = true;
      }
    }
  }
  if (!any) add('INFO', `duplicate-${compType}`, `No local path-file ${compType} entry shadows a shared component name.`);
}

// ---------- Missing 401 on non-public operations ----------
const missing401 = [];
const publicOps = [];
for (const pf of PATH_FILES) {
  const doc = paths[pf];
  for (const [pathKey, item] of Object.entries(doc)) {
    if (pathKey === 'components' || typeof item !== 'object') continue;
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      const isPublic = Array.isArray(op.security) && op.security.length === 0;
      if (isPublic) { publicOps.push([pf, pathKey, method]); continue; }
      const responses = op.responses || {};
      if (!('401' in responses)) missing401.push([pf, pathKey, method]);
    }
  }
}
if (missing401.length) {
  for (const [pf, pk, m] of missing401) add('HIGH', 'missing-response-code', `${pf} ${m.toUpperCase()} ${pk}: missing 401 Unauthorized response despite inheriting global bearerAuth security.`);
} else {
  add('INFO', 'missing-response-code', 'Every non-public operation declares a 401 response.');
}
add('INFO', 'security', `${publicOps.length} operation(s) declare "security: []" (intentionally public): ${JSON.stringify(publicOps)}`);

// ---------- Pagination consistency ----------
const mixedPagination = [];
for (const pf of PATH_FILES) {
  const doc = paths[pf];
  for (const [pathKey, item] of Object.entries(doc)) {
    if (pathKey === 'components' || typeof item !== 'object') continue;
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      const names = new Set();
      for (const p of op.parameters || []) {
        if (p.$ref) names.add(p.$ref.split('/').pop());
        else if (p.name) names.add(p.name);
      }
      if (names.has('cursor') && names.has('page')) mixedPagination.push([pf, pathKey, method]);
    }
  }
}
if (mixedPagination.length) {
  for (const [pf, pk, m] of mixedPagination) add('MEDIUM', 'pagination-consistency', `${pf} ${m.toUpperCase()} ${pk}: mixes cursor and page pagination params on the same operation.`);
} else {
  add('INFO', 'pagination-consistency', 'No operation mixes cursor-based and offset-based pagination parameters.');
}

// ---------- Naming consistency ----------
const expectedPrefix = {
  'authentication.yaml': 'auth', 'citizen.yaml': 'citizen', 'complaint.yaml': 'complaint',
  'ai.yaml': 'ai', 'administration.yaml': 'admin', 'geographic.yaml': 'geo',
  'notification.yaml': 'notification', 'reports.yaml': 'report', 'audit.yaml': 'audit',
  'file-management.yaml': 'file',
};
const namingIssues = [];
for (const pf of PATH_FILES) {
  const prefix = expectedPrefix[pf];
  const doc = paths[pf];
  for (const [pathKey, item] of Object.entries(doc)) {
    if (pathKey === 'components' || typeof item !== 'object') continue;
    for (const method of METHODS) {
      const op = item[method];
      if (op && op.operationId && !op.operationId.startsWith(prefix)) {
        namingIssues.push([pf, pathKey, method, op.operationId, prefix]);
      }
    }
  }
}
if (namingIssues.length) {
  for (const [pf, pk, m, opid, prefix] of namingIssues) add('MEDIUM', 'naming-consistency', `${pf} ${m.toUpperCase()} ${pk}: operationId "${opid}" does not start with expected prefix "${prefix}".`);
} else {
  add('INFO', 'naming-consistency', 'All operationIds follow the module-prefix convention.');
}

// ---------- Report ----------
const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
findings.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);

console.log('='.repeat(100));
for (const f of findings) console.log(`[${f.sev.padEnd(8)}] (${f.cat}) ${f.msg}`);
console.log('='.repeat(100));

const counts = {};
for (const f of findings) counts[f.sev] = (counts[f.sev] || 0) + 1;
console.log('Summary:', counts);

const blocking = findings.filter(f => f.sev === 'CRITICAL' || f.sev === 'HIGH');
if (blocking.length) {
  console.error(`\nFAIL: ${blocking.length} CRITICAL/HIGH finding(s).`);
  process.exit(1);
}
console.log('\nPASS: zero CRITICAL/HIGH findings.');
